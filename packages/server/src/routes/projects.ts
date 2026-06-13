// ── Projects REST API ──────────────────────────────────────

import { Hono } from "hono";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/connection.js";
import type { ProjectRow } from "@agent-swarm/shared";

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "项目名称不能为空"),
  path: z.string().min(1, "项目路径不能为空"),
  worktree_base: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ── Helpers ────────────────────────────────────────────────

function projectRow(row: Record<string, unknown>): ProjectRow {
  return {
    id: row.id as string, name: row.name as string, path: row.path as string,
    worktree_base: (row.worktree_base as string) ?? null,
    claude_md: (row.claude_md as string) ?? null,
    config: (row.config as string) ?? "{}",
    created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

async function parseBody<T>(c: any, schema: z.ZodSchema<T>): Promise<{ data?: T; error?: any }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const result = schema.safeParse(raw);
  if (!result.success) return { error: result.error.issues };
  return { data: result.data };
}

// ── Routes ─────────────────────────────────────────────────

router.get("/", (c) => {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM projects ORDER BY created_at DESC");
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return c.json(rows.map(projectRow));
});

router.get("/:id", (c) => {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM projects WHERE id = ?");
  stmt.bind([c.req.param("id")]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "项目不存在" }, 404); }
  const row = projectRow(stmt.getAsObject());
  stmt.free();
  return c.json(row);
});

router.post("/", async (c) => {
  const parsed = await parseBody(c, createSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const { name, path: rawPath, worktree_base, config } = parsed.data!;

  // ── Path validation ──────────────────────────────────────
  const fs = await import("node:fs");
  const pathModule = await import("node:path");
  const resolved = pathModule.resolve(rawPath);

  // Normalize: resolve relative paths, remove trailing slashes
  const normalizedPath = resolved.replace(/[\\/]+$/, "");

  // Security: reject non-existent paths
  if (!fs.existsSync(normalizedPath)) {
    return c.json({
      error: "项目路径不存在",
      path: normalizedPath,
      hint: "请确保路径指向一个已存在的目录"
    }, 400);
  }

  // Security: reject files (must be directory)
  const stat = fs.statSync(normalizedPath);
  if (!stat.isDirectory()) {
    return c.json({ error: "项目路径必须是目录，不能是文件", path: normalizedPath }, 400);
  }

  // Security: reject paths outside expected roots
  const cwd = process.cwd().replace(/[\\/]+$/, "");
  const isWithinWorkspace = normalizedPath.startsWith(cwd) ||
    /^[A-Z]:[\\/]company[\\/]/.test(normalizedPath); // allow F:/company/* paths
  if (!isWithinWorkspace) {
    console.warn(`[projects] Path outside workspace: ${normalizedPath} (cwd: ${cwd})`);
    // Allow anyway but log a warning — the user might have projects anywhere
  }

  const db = getDb();

  // Check for duplicate path
  const check = db.prepare("SELECT id FROM projects WHERE path = ?");
  check.bind([normalizedPath]);
  if (check.step()) {
    check.free();
    return c.json({ error: "项目路径已注册", path: normalizedPath, hint: "该路径已有项目，无需重复注册" }, 409);
  }
  check.free();

  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO projects (id, name, path, worktree_base, config, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    [id, name, normalizedPath, worktree_base ?? null, JSON.stringify(config ?? {}), now, now]
  );
  saveDb();

  // ── Auto-seed agents for this project ────────────────────
  try {
    const { seedAgentsForProject } = await import("../db/seed.js");
    seedAgentsForProject(id);
  } catch (err: any) {
    console.warn(`[projects] Agent seed failed for ${id}: ${err.message}`);
  }

  const stmt = db.prepare("SELECT * FROM projects WHERE id = ?");
  stmt.bind([id]); stmt.step();
  const row = projectRow(stmt.getAsObject()); stmt.free();
  return c.json(row, 201);
});

router.patch("/:id", async (c) => {
  const parsed = await parseBody(c, updateSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const { name, config } = parsed.data!;
  const db = getDb(); const id = c.req.param("id");

  const stmt = db.prepare("SELECT id FROM projects WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "项目不存在" }, 404); }
  stmt.free();

  const now = new Date().toISOString();
  if (name) db.run("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?", [name, now, id]);
  if (config) db.run("UPDATE projects SET config = ?, updated_at = ? WHERE id = ?", [JSON.stringify(config), now, id]);
  saveDb();

  const stmt2 = db.prepare("SELECT * FROM projects WHERE id = ?");
  stmt2.bind([id]); stmt2.step();
  const row = projectRow(stmt2.getAsObject()); stmt2.free();
  return c.json(row);
});

router.delete("/:id", (c) => {
  const db = getDb(); const id = c.req.param("id");
  const stmt = db.prepare("SELECT id FROM projects WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "项目不存在" }, 404); }
  stmt.free();

  const cascade = [
    "DELETE FROM messages WHERE to_agent_id IN (SELECT id FROM agents WHERE project_id = ?)",
    "DELETE FROM messages WHERE from_agent_id IN (SELECT id FROM agents WHERE project_id = ?)",
    "DELETE FROM cost_events WHERE project_id = ?",
    "DELETE FROM error_events WHERE project_id = ?",
    "DELETE FROM workflows WHERE project_id = ?",
    "DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)",
    "DELETE FROM tasks WHERE project_id = ?",
    "DELETE FROM agent_capabilities WHERE agent_id IN (SELECT id FROM agents WHERE project_id = ?)",
    "DELETE FROM agents WHERE project_id = ?",
    "DELETE FROM projects WHERE id = ?",
  ];
  for (const sql of cascade) db.run(sql, [id]);
  saveDb();
  return c.json({ deleted: id });
});

export default router;
