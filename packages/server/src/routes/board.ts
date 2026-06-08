// ── Board + Monitor + System API ──────────────────────────

import { Hono } from "hono";
import { getDb, saveDb } from "../db/connection.js";
import { TaskGraph } from "../engine/task-graph.js";

const router = new Hono();
const graph = new TaskGraph();

// ── Board ──────────────────────────────────────────────────

// GET /api/board?projectId=xxx
router.get("/board", (c) => {
  const projectId = c.req.query("projectId") || "";
  const columns = ["Backlog", "InDev", "ReadyForTest", "InFix", "ReadyForDeploy", "Done", "Blocked"] as const;

  const board = columns.map((status) => {
    const tasks = graph.queryTasks({ project_id: projectId, status, limit: 1000 });
    return { status, title: status, tasks };
  });

  return c.json({ projectId, columns: board });
});

// ── Stats ──────────────────────────────────────────────────

// GET /api/stats?projectId=xxx
router.get("/stats", (c) => {
  const projectId = c.req.query("projectId") || "";
  const db = getDb();
  const sql = projectId
    ? "SELECT status, COUNT(*) as cnt FROM tasks WHERE project_id = ? GROUP BY status"
    : "SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status";
  const stmt = db.prepare(sql);
  if (projectId) stmt.bind([projectId]);
  else stmt.bind([]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    byStatus[row.status as string] = row.cnt as number;
    total += row.cnt as number;
  }
  stmt.free();

  const blocked = graph.queryTasks({ project_id: projectId, status: "Blocked", limit: 100 }).map(t => ({
    id: t.id, title: t.title, error_message: t.error_message,
  }));

  return c.json({
    total,
    byStatus,
    blockedTasks: blocked,
    completionRate: total > 0 ? ((byStatus["Done"] ?? 0) / total * 100).toFixed(1) + "%" : "0%",
  });
});

// ── Costs ──────────────────────────────────────────────────

// GET /api/costs?projectId=&agentId=&from=&to=
router.get("/costs", (c) => {
  const { project_id, agent_id, from, to } = c.req.query();
  const db = getDb();
  let sql = "SELECT * FROM cost_events WHERE 1=1";
  const params: (string | number | null)[] = [];

  if (project_id) { sql += " AND project_id = ?"; params.push(project_id); }
  if (agent_id) { sql += " AND agent_id = ?"; params.push(agent_id); }
  if (from) { sql += " AND timestamp >= ?"; params.push(from); }
  if (to) { sql += " AND timestamp <= ?"; params.push(to); }
  sql += " ORDER BY timestamp DESC LIMIT 500";

  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  // Compute total cost
  const total = rows.reduce((sum, r) => sum + (r.cost_usd as number), 0);
  return c.json({ events: rows, totalCostUsd: total });
});

// ── System ─────────────────────────────────────────────────

// GET /api/detect — detect installed CLIs
router.get("/detect", (c) => {
  const clis: Record<string, { installed: boolean; version?: string; error?: string }> = {};

  for (const cli of ["claude", "hermes", "openclaw"]) {
    clis[cli] = { installed: false, error: "detection requires runtime scan" };
  }

  return c.json({ runtimes: clis, nodeVersion: process.version, platform: process.platform });
});

// POST /api/kill-switch — emergency stop all agents
router.post("/kill-switch", async (c) => {
  const { RuntimePool } = await import("../engine/runtime-pool.js");
  const pool = new RuntimePool();
  const count = await pool.killAll();
  return c.json({ killed: count, reason: c.req.query("reason") || "manual" });
});

// POST /api/cleanup — clean stale data
router.post("/cleanup", (c) => {
  const db = getDb();
  const days = parseInt(c.req.query("days") || "30");
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  db.run("DELETE FROM cost_events WHERE timestamp < ?", [cutoff]);
  db.run("DELETE FROM error_events WHERE timestamp < ?", [cutoff]);
  db.run("DELETE FROM messages WHERE created_at < ?", [cutoff]);
  saveDb();
  return c.json({ cleaned: { olderThan: cutoff, tables: ["cost_events", "error_events", "messages"] } });
});

export default router;
