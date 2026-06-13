// ── Tasks REST API (8 endpoints) ──────────────────────────

import { Hono } from "hono";
import { z } from "zod";
import { sharedGraph } from "../engine/shared-services.js";
import { ExecutionService } from "../engine/execution-service.js";
import type { TaskStatus, TaskPriority } from "@agent-swarm/shared";
import { canTransition } from "@agent-swarm/shared";

const router = new Hono();
const graph = sharedGraph;

// ── Schema ─────────────────────────────────────────────────

const createSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1, "标题不能为空"),
  description: z.string().default(""),
  priority: z.number().int().min(0).max(4).default(3),
  complexity: z.number().int().min(1).max(10).optional(),
  required_capabilities: z.array(z.string()).default([]),
  depends_on: z.array(z.string()).default([]),
  acceptance_criteria: z.string().optional(),
  max_retries: z.number().int().min(1).max(10).default(3),
  timeout_ms: z.number().int().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["Backlog","InDev","ReadyForTest","InFix","ReadyForDeploy","Done","Blocked","Cancelled"]).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  version: z.number().int().min(1, "乐观锁版本号必需"),
  error_message: z.string().nullable().optional(),
});

const assignSchema = z.object({ agent_id: z.string().min(1) });
const statusSchema = z.object({
  status: z.enum(["Backlog","InDev","ReadyForTest","InFix","ReadyForDeploy","Done","Blocked","Cancelled"]),
  version: z.number().int().min(1),
});

// ── Helpers ────────────────────────────────────────────────

async function parseBody<T>(c: any, schema: z.ZodSchema<T>): Promise<{ data?: T; error?: any }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const r = schema.safeParse(raw);
  return r.success ? { data: r.data } : { error: r.error.issues };
}

// ── Routes ─────────────────────────────────────────────────

// GET /api/tasks — list with filters
router.get("/", (c) => {
  const { project_id, status, agent_id, priority, search, limit, offset } = c.req.query();
  const tasks = graph.queryTasks({
    project_id,
    status: (status as TaskStatus) || undefined,
    agent_id,
    priority: priority ? parseInt(priority) : undefined,
    search,
    limit: limit ? parseInt(limit) : 250,
    offset: offset ? parseInt(offset) : 0,
  });
  return c.json(tasks);
});

// GET /api/tasks/:id
router.get("/:id", (c) => {
  const task = graph.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "任务不存在" }, 404);
  return c.json(task);
});

// POST /api/tasks — create
router.post("/", async (c) => {
  const parsed = await parseBody(c, createSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const d = parsed.data!;
  const task = graph.createTask({
    project_id: d.project_id,
    title: d.title,
    description: d.description,
    priority: d.priority as any,
    complexity: d.complexity,
    required_capabilities: d.required_capabilities,
    depends_on: d.depends_on,
    acceptance_criteria: d.acceptance_criteria,
    max_retries: d.max_retries,
    timeout_ms: d.timeout_ms,
  });

  return c.json(task, 201);
});

// PATCH /api/tasks/:id — update (optimistic lock)
router.patch("/:id", async (c) => {
  const parsed = await parseBody(c, updateSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const { version, ...updates } = parsed.data!;
  const task = graph.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "任务不存在" }, 404);

  // Validate status transition
  if (updates.status && !canTransition(task.status, updates.status)) {
    return c.json({
      error: "非法状态流转",
      current: task.status,
      requested: updates.status,
      allowed: ["Backlog","InDev","ReadyForTest","InFix","ReadyForDeploy","Done","Blocked","Cancelled"]
        .filter(s => canTransition(task.status, s as TaskStatus)),
    }, 409);
  }

  // Block direct transition to InDev — must go through POST /assign
  if (updates.status === "InDev" && task.status === "Backlog") {
    return c.json({ error: "不能直接拖入 InDev。请先通过「分配 Agent」将任务分配给执行者。" }, 422);
  }

  // Prevent transitions when unassigned
  if (updates.status && updates.status !== "Backlog" && !task.owner_agent_id) {
    return c.json({ error: "任务未分配 Agent，无法流转状态。请先分配 Agent。" }, 422);
  }

  const result = graph.updateTask(task.id, {
    ...updates,
    priority: updates.priority as TaskPriority | undefined,
    version,
  });
  if (!result) return c.json({ error: "乐观锁冲突，请重试" }, 409);

  return c.json(result);
});

// POST /api/tasks/:id/assign
router.post("/:id/assign", async (c) => {
  const parsed = await parseBody(c, assignSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const task = graph.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "任务不存在" }, 404);

  const result = graph.assignTask(task.id, parsed.data!.agent_id, task.version);
  if (!result) return c.json({ error: "分配失败（任务已被占用或版本冲突）" }, 409);

  return c.json(result);
});

// POST /api/tasks/:id/unassign
router.post("/:id/unassign", (c) => {
  const id = c.req.param("id");
  const task = graph.getTask(id);
  if (!task) return c.json({ error: "任务不存在" }, 404);

  const result = graph.updateTask(id, {
    status: "Backlog",
    owner_agent_id: null,
    version: task.version,
  });
  if (!result) return c.json({ error: "乐观锁冲突" }, 409);

  return c.json(result);
});

// POST /api/tasks/:id/status — status transition
router.post("/:id/status", async (c) => {
  const parsed = await parseBody(c, statusSchema);
  if (parsed.error) return c.json({ error: "请求参数校验失败", details: parsed.error }, 400);

  const id = c.req.param("id");
  const task = graph.getTask(id);
  if (!task) return c.json({ error: "任务不存在" }, 404);

  const { status, version } = parsed.data!;
  if (!canTransition(task.status, status)) {
    return c.json({
      error: "非法状态流转",
      current: task.status,
      requested: status,
    }, 409);
  }

  // Block direct transition to InDev — must go through POST /assign
  if (status === "InDev" && task.status === "Backlog") {
    return c.json({ error: "不能直接设置为 InDev。请先通过「分配 Agent」将任务分配给执行者。" }, 422);
  }

  // Prevent transitions when unassigned
  if (status !== "Backlog" && !task.owner_agent_id) {
    return c.json({ error: "任务未分配 Agent，无法流转状态。请先分配 Agent。" }, 422);
  }

  const result = graph.updateTask(id, { status, version });
  if (!result) return c.json({ error: "乐观锁冲突" }, 409);

  return c.json(result);
});

// POST /api/tasks/:id/retry — manual retry
router.post("/:id/retry", (c) => {
  const id = c.req.param("id");
  const task = graph.getTask(id);
  if (!task) return c.json({ error: "任务不存在" }, 404);
  if (task.status !== "InFix") return c.json({ error: "只有InFix状态的任务可以重试" }, 409);

  const result = graph.updateTask(id, { status: "Backlog", version: task.version, error_message: null });
  if (!result) return c.json({ error: "乐观锁冲突" }, 409);
  return c.json(result);
});

// POST /api/tasks/:id/execute — actually run Claude Code on this task
router.post("/:id/execute", async (c) => {
  const id = c.req.param("id");
  const task = graph.getTask(id);
  if (!task) return c.json({ error: "任务不存在" }, 404);
  if (task.status !== "InDev") return c.json({ error: `任务状态为 ${task.status}，需要先分配到Agent`, status: task.status }, 409);

  const executor = new ExecutionService(graph);

  try {
    const model = c.req.query("model") || "deepseek-v4-pro[1m]";
    const result = await executor.executeTask(id, model);
    return c.json({
      taskId: id,
      success: result.success,
      output: result.output.slice(0, 5000),
      error: result.error,
    });
  } catch (err: any) {
    return c.json({ error: "执行失败", detail: err.message }, 500);
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", (c) => {
  const ok = graph.deleteTask(c.req.param("id"));
  if (!ok) return c.json({ error: "任务不存在" }, 404);
  return c.json({ deleted: c.req.param("id") });
});

// POST /api/tasks/clean — clean up tasks by project + optional status filter
router.post("/clean", async (c) => {
  const { project_id, status } = await c.req.json().catch(() => ({}));
  if (!project_id) return c.json({ error: "project_id 必需" }, 400);

  const targetStatus = (status as string) || "Backlog";
  const tasks = graph.queryTasks({ project_id, status: targetStatus as any, limit: 10000 });

  let deleted = 0;
  for (const task of tasks) {
    if (graph.deleteTask(task.id)) deleted++;
  }

  return c.json({
    message: `已清理项目 ${project_id} 中 ${deleted} 个 ${targetStatus} 状态的任务`,
    deleted,
    status: targetStatus,
  });
});

export default router;
