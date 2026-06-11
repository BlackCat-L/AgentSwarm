// ── Agents REST API (10 endpoints) ────────────────────────

import { Hono } from "hono";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/connection.js";
import { createAgentIdentity } from "../engine/agent-identity.js";
import { CapabilityScorer } from "../engine/capability-scorer.js";
import type { AgentRow } from "@agent-swarm/shared";

const router = new Hono();
const scorer = new CapabilityScorer();

// ── Schema ─────────────────────────────────────────────────

const createSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1, "Agent名称不能为空"),
  role: z.string().min(1, "角色不能为空"),
  runtime: z.enum(["claude-code", "hermes", "openclaw"]).default("claude-code"),
  model: z.enum(["opus", "sonnet", "haiku"]).default("sonnet"),
  capabilities: z.array(z.string()).default([]),
  permission_mode: z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]).default("acceptEdits"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["idle", "busy", "offline", "error", "paused"]).optional(),
  model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  permission_mode: z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]).optional(),
});

// ── Helpers ────────────────────────────────────────────────

function agentRow(row: Record<string, unknown>): AgentRow {
  return {
    id: row.id as string, project_id: row.project_id as string,
    name: row.name as string, role: row.role as AgentRow["role"],
    runtime: row.runtime as AgentRow["runtime"],
    model: row.model as AgentRow["model"],
    status: row.status as AgentRow["status"],
    worktree_path: (row.worktree_path as string) ?? null,
    current_task_id: (row.current_task_id as string) ?? null,
    capabilities: (row.capabilities as string) ?? "[]",
    last_heartbeat: (row.last_heartbeat as string) ?? null,
    permission_mode: (row.permission_mode as string) ?? "acceptEdits",
    pid: (row.pid as number) ?? null,
    created_at: row.created_at as string,
  };
}

async function parseBody<T>(c: any, schema: z.ZodSchema<T>): Promise<{ data?: T; error?: any }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const r = schema.safeParse(raw);
  return r.success ? { data: r.data } : { error: r.error.issues };
}

// ── Routes ─────────────────────────────────────────────────

// GET /api/agents — list with filters
router.get("/", (c) => {
  const { status, role, project_id } = c.req.query();
  const db = getDb();
  let sql = "SELECT * FROM agents WHERE 1=1";
  const params: (string | number | null)[] = [];

  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (role) { sql += " AND role = ?"; params.push(role); }
  sql += " ORDER BY created_at DESC";

  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return c.json(rows.map(agentRow));
});

// GET /api/agents/:id
router.get("/:id", (c) => {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM agents WHERE id = ?");
  stmt.bind([c.req.param("id")]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "Agent不存在" }, 404); }
  const row = agentRow(stmt.getAsObject()); stmt.free();
  return c.json(row);
});

// POST /api/agents — register new agent (with Ed25519 identity)
router.post("/", async (c) => {
  try {
  const parsed = await parseBody(c, createSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const { project_id, name, role, runtime, model, capabilities, permission_mode } = parsed.data!;
  const db = getDb();

  // Verify project exists
  const check = db.prepare("SELECT id FROM projects WHERE id = ?");
  check.bind([project_id]);
  if (!check.step()) { check.free(); return c.json({ error: "项目不存在" }, 400); }
  check.free();

  const id = uuidv4();

  // Generate Ed25519 identity
  let identityJson = "{}";
  try {
    const identity = await createAgentIdentity(id);
    identityJson = JSON.stringify(identity);
  } catch { /* key gen fails gracefully */ }

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO agents (id, project_id, name, role, runtime, model, status, capabilities, permission_mode, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, project_id, name, role, runtime, model, "idle", JSON.stringify(capabilities), permission_mode, now]
  );

  // Initialize capability profile
  scorer.upsertCapabilityProfile(id, capabilities as string[]);

  // Store identity in messages table
  db.run(
    "INSERT OR REPLACE INTO messages (id, from_agent_id, type, content, created_at) VALUES (?,?,?,?,?)",
    [`identity:${id}`, id, "status", identityJson, now]
  );

  saveDb();

  const stmt = db.prepare("SELECT * FROM agents WHERE id = ?");
  stmt.bind([id]); stmt.step();
  const row = agentRow(stmt.getAsObject()); stmt.free();
  return c.json({ ...row, identity: JSON.parse(identityJson) }, 201);
  } catch (e: any) { console.error('[agents] POST error:', e.message, e.stack?.slice(0,200)); return c.json({ error: "服务器内部错误", detail: e.message }, 500); }
});

// PATCH /api/agents/:id — update
router.patch("/:id", async (c) => {
  const parsed = await parseBody(c, updateSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const db = getDb(); const id = c.req.param("id");
  const stmt = db.prepare("SELECT id FROM agents WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "Agent不存在" }, 404); }
  stmt.free();

  const { name, status, model, permission_mode } = parsed.data!;
  if (name) db.run("UPDATE agents SET name = ? WHERE id = ?", [name, id]);
  if (status) db.run("UPDATE agents SET status = ? WHERE id = ?", [status, id]);
  if (model) db.run("UPDATE agents SET model = ? WHERE id = ?", [model, id]);
  if (permission_mode) db.run("UPDATE agents SET permission_mode = ? WHERE id = ?", [permission_mode, id]);
  saveDb();

  const stmt2 = db.prepare("SELECT * FROM agents WHERE id = ?");
  stmt2.bind([id]); stmt2.step();
  const row = agentRow(stmt2.getAsObject()); stmt2.free();
  return c.json(row);
});

// POST /api/agents/:id/heartbeat
router.post("/:id/heartbeat", (c) => {
  const db = getDb(); const id = c.req.param("id");
  const now = new Date().toISOString();
  db.run("UPDATE agents SET last_heartbeat = ?, status = CASE WHEN status = 'offline' THEN 'idle' ELSE status END WHERE id = ?", [now, id]);
  saveDb();
  return c.json({ acknowledged: true });
});

// POST /api/agents/:id/start
router.post("/:id/start", (c) => {
  const db = getDb(); const id = c.req.param("id");
  db.run("UPDATE agents SET status = 'busy' WHERE id = ? AND status IN ('idle','offline','paused')", [id]);
  saveDb();
  return c.json({ action: "start", agent_id: id });
});

// POST /api/agents/:id/stop
router.post("/:id/stop", (c) => {
  const db = getDb(); const id = c.req.param("id");
  db.run("UPDATE agents SET status = 'offline' WHERE id = ?", [id]);
  saveDb();
  return c.json({ action: "stop", agent_id: id });
});

// POST /api/agents/:id/pause
router.post("/:id/pause", (c) => {
  const db = getDb(); const id = c.req.param("id");
  db.run("UPDATE agents SET status = 'paused' WHERE id = ? AND status = 'busy'", [id]);
  saveDb();
  return c.json({ action: "pause", agent_id: id });
});

// POST /api/agents/:id/resume
router.post("/:id/resume", (c) => {
  const db = getDb(); const id = c.req.param("id");
  db.run("UPDATE agents SET status = 'busy' WHERE id = ? AND status = 'paused'", [id]);
  saveDb();
  return c.json({ action: "resume", agent_id: id });
});

// DELETE /api/agents/:id — delete + cleanup worktree
router.delete("/:id", (c) => {
  const db = getDb(); const id = c.req.param("id");
  const stmt = db.prepare("SELECT id FROM agents WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "Agent不存在" }, 404); }
  stmt.free();

  // Cleanup messages, capabilities, identity
  db.run("DELETE FROM agent_capabilities WHERE agent_id = ?", [id]);
  db.run("DELETE FROM messages WHERE from_agent_id = ? OR to_agent_id = ?", [id, id]);
  db.run("DELETE FROM messages WHERE id = ?", [`identity:${id}`]);
  db.run("UPDATE tasks SET owner_agent_id = NULL WHERE owner_agent_id = ?", [id]);
  db.run("DELETE FROM agents WHERE id = ?", [id]);
  saveDb();

  return c.json({ deleted: id });
});

export default router;
