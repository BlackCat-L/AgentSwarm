// ── Workflow + Messages + ErrorLogs API ───────────────────

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/connection.js";

const router = new Hono();

// ── Workflows ──────────────────────────────────────────────

router.post("/workflows/start", async (c) => {
  const db = getDb();
  const id = uuidv4(); const now = new Date().toISOString();
  const { project_id, type } = await c.req.json().catch(() => ({}));
  if (!project_id) return c.json({ error: "project_id必需" }, 400);

  db.run(
    "INSERT INTO workflows (id, project_id, type, current_phase, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    [id, project_id, type || "standard-dev-team", 0, "running", now, now]
  );
  saveDb();
  return c.json({ id, project_id, type: type || "standard-dev-team", current_phase: 0, status: "running" }, 201);
});

router.get("/workflows/:id", (c) => {
  const stmt = getDb().prepare("SELECT * FROM workflows WHERE id = ?");
  stmt.bind([c.req.param("id")]);
  if (!stmt.step()) { stmt.free(); return c.json({ error: "工作流不存在" }, 404); }
  const row = stmt.getAsObject(); stmt.free();
  return c.json(row);
});

router.post("/workflows/:id/pause", (c) => {
  const id = c.req.param("id");
  getDb().run("UPDATE workflows SET status = 'paused', updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  saveDb();
  return c.json({ action: "pause", workflow_id: id });
});

router.post("/workflows/:id/resume", (c) => {
  const id = c.req.param("id");
  getDb().run("UPDATE workflows SET status = 'running', updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  saveDb();
  return c.json({ action: "resume", workflow_id: id });
});

// ── Messages ───────────────────────────────────────────────

router.get("/messages", (c) => {
  const { to_agent_id, from_agent_id, type } = c.req.query();
  let sql = "SELECT * FROM messages WHERE 1=1";
  const params: string[] = [];
  if (to_agent_id) { sql += " AND to_agent_id = ?"; params.push(to_agent_id); }
  if (from_agent_id) { sql += " AND from_agent_id = ?"; params.push(from_agent_id); }
  if (type) { sql += " AND type = ?"; params.push(type); }
  sql += " ORDER BY created_at DESC LIMIT 200";

  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return c.json(rows);
});

router.post("/messages", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb(); const id = uuidv4(); const now = new Date().toISOString();
  db.run(
    "INSERT INTO messages (id, from_agent_id, to_agent_id, type, content, created_at) VALUES (?,?,?,?,?,?)",
    [id, body.from_agent_id || null, body.to_agent_id || null, body.type || "status", body.content || "", now]
  );
  saveDb();
  return c.json({ id, created_at: now }, 201);
});

// ── Error Logs ─────────────────────────────────────────────

router.get("/errors", (c) => {
  const { agent_id, project_id, type, limit, offset } = c.req.query();
  let sql = "SELECT * FROM error_events WHERE 1=1";
  const params: (string | number | null)[] = [];

  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (agent_id) { sql += " AND agent_id = ?"; params.push(agent_id); }
  if (type) { sql += " AND type = ?"; params.push(type); }
  sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  params.push(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);

  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return c.json(rows);
});

export default router;
