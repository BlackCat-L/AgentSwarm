// ── Route registry ─────────────────────────────────────────

import { Hono } from "hono";
import { migrationStatus } from "../db/migrate.js";
import { sseHandler } from "../sse/handler.js";
import projectsRouter from "./projects.js";
import agentsRouter from "./agents.js";
import tasksRouter from "./tasks.js";
import boardRouter from "./board.js";
import workflowsRouter from "./workflows.js";
import sortRouter from "./sort.js";
import healthExtendedRouter from "./health-extended.js";
import statusExtendedRouter from "./status-extended.js";

const routes = new Hono();

// Health + Status
routes.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
routes.get("/hello", (c) => c.json({ message: "Hello from Agent Swarm" }));
routes.get("/status", (c) => c.json({
  server: "Agent Swarm — Dark Factory",
  version: "0.0.0",
  db: migrationStatus(),
  uptime: process.uptime(),
}));

// SSE events
routes.get("/events", sseHandler);

// Auto — 全自动: 一句话 → 分析 → 拆解 → 分配 → 后台并行执行
// Optional cleanPrevious=true to delete all Backlog tasks for this project before creating new ones.
routes.post("/auto", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { project_id, title, description, cleanPrevious } = body;
  if (!project_id || !title) return c.json({ error: "project_id 和 title 必需" }, 400);

  // ── Project existence check ──────────────────────────────
  const { getDb } = await import("../db/connection.js");
  const db = getDb();
  const projCheck = db.prepare("SELECT id, path FROM projects WHERE id = ?");
  projCheck.bind([project_id]);
  if (!projCheck.step()) {
    projCheck.free();
    return c.json({ error: "项目不存在", project_id, hint: "请先用 /swarm 注册当前项目" }, 404);
  }
  const projRow = projCheck.getAsObject() as { id: string; path: string };
  projCheck.free();

  // Encoding diagnostic: log hex of title to detect UTF-8 corruption
  const titleHex = Buffer.from(title, "utf-8").toString("hex").slice(0, 40);
  console.log(`[Auto] project=${projRow.path} title hex: ${titleHex} | ${title.slice(0, 40)}`);

  // Auto-clean previous backlog tasks if requested
  if (cleanPrevious) {
    const { sharedGraph } = await import("../engine/shared-services.js");
    const oldTasks = sharedGraph.queryTasks({ project_id, status: "Backlog" as any, limit: 10000 });
    let cleaned = 0;
    for (const task of oldTasks) {
      if (sharedGraph.deleteTask(task.id)) cleaned++;
    }
    if (cleaned > 0) {
      console.log(`[Auto] Cleaned ${cleaned} old Backlog tasks for project ${project_id}`);
    }
  }

  const { getOrchestrator } = await import("../engine/shared-services.js");
  const orch = getOrchestrator();

  // Quick complexity analysis (returns fast)
  const complexity = await orch.analyzeComplexity(title, description || "");

  // Start full auto-execute in background (may take minutes)
  // Pass pre-computed complexity to avoid redundant (potentially failing) re-analysis
  orch.autoExecute(project_id, title, description || "", complexity).then(result => {
    console.log(`[Auto] "${title}": ${result.completed} done, ${result.blocked} blocked`);
  }).catch(err => {
    console.error(`[Auto] "${title}" failed:`, err.message);
  });

  return c.json({
    message: "已启动全自动执行，刷新看板查看进度",
    complexity,
    dashboard: "http://localhost:5173",
  });
});

// Orchestrate — one-shot full pipeline
routes.post("/orchestrate", async (c) => {
  const { project_id, title, description } = await c.req.json().catch(() => ({}));
  if (!project_id || !title) return c.json({ error: "project_id 和 title 必需" }, 400);

  const { getOrchestrator } = await import("../engine/shared-services.js");
  const orch = getOrchestrator();
  const result = await orch.orchestrate(project_id, title, description || "");

  return c.json(result);
});

// Sub-routers
routes.route("/projects", projectsRouter);
routes.route("/agents", agentsRouter);
routes.route("/tasks", tasksRouter);
routes.route("/", boardRouter);          // /api/board, /api/stats, /api/costs, /api/detect, /api/kill-switch, /api/cleanup
routes.route("/", workflowsRouter);      // /api/workflows, /api/messages, /api/errors
routes.route("/", workflowsRouter);      // /api/workflows, /api/messages, /api/errors
routes.route("/sort", sortRouter);       // /api/sort (sorting visualisation)
routes.route("/api/health-extended", healthExtendedRouter);
routes.route("/api/status-extended", statusExtendedRouter);

export default routes;
