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
routes.post("/auto", async (c) => {
  const { project_id, title, description } = await c.req.json().catch(() => ({}));
  if (!project_id || !title) return c.json({ error: "project_id 和 title 必需" }, 400);

  const { getOrchestrator } = await import("../engine/shared-services.js");
  const orch = getOrchestrator();

  // Quick complexity analysis (returns fast)
  const complexity = await orch.analyzeComplexity(title, description || "");

  // Start full auto-execute in background (may take minutes)
  orch.autoExecute(project_id, title, description || "").then(result => {
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
