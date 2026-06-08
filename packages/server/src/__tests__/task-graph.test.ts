// ============================================================
// TaskGraph engine tests — DAG + optimistic locking + BFS
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDb, getDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { TaskGraph } from "../engine/task-graph.js";

const TEST_DB = "__test_taskgraph.db";

let graph: TaskGraph;

beforeAll(async () => {
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch { /* ignore */ }
  await initDb(TEST_DB);
  migrate();

  // Seed a project for tests
  const db = getDb();
  db.run("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)",
    ["proj-tg", "TaskGraph Test", "/tmp/taskgraph-test"]);

  graph = new TaskGraph();
});

afterAll(async () => {
  await closeDb();
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch { /* ignore */ }
});

describe("TaskGraph CRUD", () => {
  it("should create a task with all required fields", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "单元测试任务",
      description: "验证createTask包含所有必填字段",
      priority: 0,
      required_capabilities: ["backend", "database"],
      acceptance_criteria: "测试通过",
      max_retries: 3,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("单元测试任务");
    expect(task.status).toBe("Backlog");
    expect(task.priority).toBe(0);
    expect(task.required_capabilities).toEqual(["backend", "database"]);
    expect(task.version).toBe(1);
    expect(task.retry_count).toBe(0);
    expect(task.max_retries).toBe(3);
    expect(task.created_at).toBeDefined();
  });

  it("should get a task by ID", () => {
    const created = graph.createTask({
      project_id: "proj-tg",
      title: "getTask测试",
    });
    const fetched = graph.getTask(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("getTask测试");
  });

  it("should return null for non-existent task", () => {
    const result = graph.getTask("non-existent-id");
    expect(result).toBeNull();
  });

  it("should query tasks with multi-dimensional filtering", () => {
    const t1 = graph.createTask({
      project_id: "proj-tg",
      title: "后端任务A",
      priority: 1,
      required_capabilities: ["backend"],
    });
    const t2 = graph.createTask({
      project_id: "proj-tg",
      title: "前端任务B",
      priority: 2,
      required_capabilities: ["frontend"],
    });

    // Filter by project
    const all = graph.queryTasks({ project_id: "proj-tg" });
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Filter by status
    const backlog = graph.queryTasks({ project_id: "proj-tg", status: "Backlog" });
    expect(backlog.every((t) => t.status === "Backlog")).toBe(true);

    // Filter by search
    const found = graph.queryTasks({ project_id: "proj-tg", search: "后端" });
    expect(found.some((t) => t.title === "后端任务A")).toBe(true);
    expect(found.some((t) => t.title === "前端任务B")).toBe(false);

    // Filter by priority
    const p1 = graph.queryTasks({ project_id: "proj-tg", priority: 1 });
    expect(p1.every((t) => t.priority === 1)).toBe(true);

    // Cleanup
    graph.deleteTask(t1.id);
    graph.deleteTask(t2.id);
  });
});

describe("TaskGraph Optimistic Locking", () => {
  it("assignTask should succeed with correct version", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "乐观锁测试-正常",
    });

    const assigned = graph.assignTask(task.id, "agent-001", task.version);
    expect(assigned).not.toBeNull();
    expect(assigned!.status).toBe("InDev");
    expect(assigned!.owner_agent_id).toBe("agent-001");
    expect(assigned!.version).toBe(task.version + 1);
  });

  it("assignTask should fail with wrong version (stale read)", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "乐观锁测试-冲突",
    });

    // First assignment succeeds
    const assigned = graph.assignTask(task.id, "agent-001", task.version);
    expect(assigned).not.toBeNull();

    // Second assignment with stale version should fail
    const conflict = graph.assignTask(task.id, "agent-002", task.version); // old version!
    expect(conflict).toBeNull();

    // Task should still be assigned to first agent
    const current = graph.getTask(task.id);
    expect(current!.owner_agent_id).toBe("agent-001");
    expect(current!.status).toBe("InDev");
  });

  it("assignTask should fail if task is not in Backlog", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "非Backlog任务",
    });
    expect(task).not.toBeNull();
    expect(task.id).toBeDefined();

    // Assign first
    graph.assignTask(task.id, "agent-001", task.version);

    // Try to assign again with current version
    const current = graph.getTask(task.id);
    expect(current).not.toBeNull();
    const retry = graph.assignTask(task.id, "agent-002", current!.version);
    expect(retry).toBeNull();
  });

  it("updateTask should fail with wrong version", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "update乐观锁",
    });

    // Successful update
    const updated = graph.updateTask(task.id, {
      title: "已更新",
      version: task.version,
    });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("已更新");
    expect(updated!.version).toBe(task.version + 1);

    // Stale update should fail
    const conflict = graph.updateTask(task.id, {
      title: "冲突更新",
      version: task.version, // old version!
    });
    expect(conflict).toBeNull();

    // Title should not have changed
    const current = graph.getTask(task.id);
    expect(current!.title).toBe("已更新");
  });

  it("updateTask should set completed_at on Done/Cancelled", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "完成时间测试",
    });

    // Assign first
    graph.assignTask(task.id, "agent-001", task.version);
    const current = graph.getTask(task.id)!;

    const done = graph.updateTask(task.id, {
      status: "Done",
      version: current.version,
    });
    expect(done!.status).toBe("Done");
    expect(done!.completed_at).toBeDefined();
  });
});

describe("TaskGraph DAG operations", () => {
  it("should detect self-dependency as cycle", () => {
    const task = graph.createTask({
      project_id: "proj-tg",
      title: "自引用测试",
    });

    const isCycle = graph.wouldCreateCycle(task.id, task.id);
    expect(isCycle).toBe(true);
  });

  it("should detect transitive cycle", () => {
    const t1 = graph.createTask({ project_id: "proj-tg", title: "T1" });
    const t2 = graph.createTask({ project_id: "proj-tg", title: "T2" });

    // Create dependency: T2 depends on T1
    const db = getDb();
    db.run("INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)",
      [t2.id, t1.id]);

    // T1 depends on T2 would create a cycle
    const isCycle = graph.wouldCreateCycle(t1.id, t2.id);
    expect(isCycle).toBe(true);
  });

  it("should not create dependency records via createTask dependencies", () => {
    const t1 = graph.createTask({ project_id: "proj-tg", title: "Dep" });
    const t2 = graph.createTask({
      project_id: "proj-tg",
      title: "Dep on T1",
      depends_on: [t1.id],
    });

    const deps = graph.getDependencies(t2.id);
    expect(deps.length).toBe(1);
    expect(deps[0]!.depends_on_id).toBe(t1.id);
  });

  it("isTaskReady should return false when dependencies not Done", () => {
    const t1 = graph.createTask({ project_id: "proj-tg", title: "Blocker" });
    const t2 = graph.createTask({
      project_id: "proj-tg",
      title: "Blocked by T1",
      depends_on: [t1.id],
    });

    // T1 not done → T2 not ready
    expect(graph.isTaskReady(t2.id)).toBe(false);

    // Mark T1 as Done
    graph.updateTask(t1.id, { status: "Done", version: t1.version });

    // Now T2 should be ready
    expect(graph.isTaskReady(t2.id)).toBe(true);
  });

  it("getReadyTasks should return only tasks with dependencies met", () => {
    const projId = "proj-tg";
    const tA = graph.createTask({ project_id: projId, title: "Ready Task" });
    const tB = graph.createTask({ project_id: projId, title: "Not Ready" });
    const tC = graph.createTask({
      project_id: projId,
      title: "Depends on B",
      depends_on: [tB.id],
    });

    const ready = graph.getReadyTasks(projId);
    // tA should be ready (no deps), tC should NOT be ready (B not done)
    expect(ready.some((t) => t.id === tA.id)).toBe(true);
    expect(ready.some((t) => t.id === tC.id)).toBe(false);

    // Mark B as Done
    graph.updateTask(tB.id, { status: "Done", version: tB.version });

    const ready2 = graph.getReadyTasks(projId);
    expect(ready2.some((t) => t.id === tC.id)).toBe(true);
  });

  it("deleteTask should remove task and its dependency records", () => {
    const t = graph.createTask({
      project_id: "proj-tg",
      title: "To Delete",
      depends_on: [],
    });
    const id = t.id;

    expect(graph.getTask(id)).not.toBeNull();
    expect(graph.deleteTask(id)).toBe(true);
    expect(graph.getTask(id)).toBeNull();
    expect(graph.deleteTask(id)).toBe(false);
  });

  it("addDependencies should reject cycle-creating edges", () => {
    const t1 = graph.createTask({ project_id: "proj-tg", title: "T1" });
    const t2 = graph.createTask({ project_id: "proj-tg", title: "T2" });
    const t3 = graph.createTask({ project_id: "proj-tg", title: "T3" });

    // Valid: T3 depends on T1, T2
    const result = graph.addDependencies(t3.id, [t1.id, t2.id]);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);

    // Invalid: T1 depends on T3 would create cycle (T3 → T1, T1 → T3)
    const cycle = graph.addDependencies(t1.id, [t3.id]);
    expect(cycle).toBeNull();

    // Verify T1 still has no deps
    expect(graph.getDependencies(t1.id).length).toBe(0);
  });

  it("addDependencies should reject non-existent tasks", () => {
    const t = graph.createTask({ project_id: "proj-tg", title: "Exists" });
    const result = graph.addDependencies(t.id, ["non-existent-id"]);
    expect(result).toBeNull();
  });
});

describe("TaskGraph completeTask + cascading", () => {
  it("completeTask should mark task as Done", () => {
    const t = graph.createTask({ project_id: "proj-tg", title: "Complete me" });

    const done = graph.completeTask(t.id);
    expect(done).not.toBeNull();
    expect(done!.status).toBe("Done");
  });

  it("completeTask should unblock dependents that are ready", () => {
    const t1 = graph.createTask({ project_id: "proj-tg", title: "First" });
    const t2 = graph.createTask({
      project_id: "proj-tg",
      title: "Second (blocked waiting for t1)",
      depends_on: [t1.id],
    });

    // Assign t2 then complete t1 → t2 becomes ready (dependency met)
    graph.assignTask(t2.id, "agent-1", t2.version);
    graph.completeTask(t1.id);

    // T2 is still InDev (assigned), but its dependency is met → it's ready
    expect(graph.isTaskReady(t2.id)).toBe(true);
  });

  it("failTask should increment retry_count", () => {
    const t = graph.createTask({
      project_id: "proj-tg",
      title: "Will fail",
      max_retries: 5,
    });

    const failed = graph.failTask(t.id, "Something went wrong");
    expect(failed).not.toBeNull();
    expect(failed!.retry_count).toBe(1);
    expect(failed!.status).toBe("Backlog");
    expect(failed!.error_message).toBe("Something went wrong");
    expect(failed!.owner_agent_id).toBeNull(); // released
  });

  it("failTask should block task when maxRetries exhausted", () => {
    const t = graph.createTask({
      project_id: "proj-tg",
      title: "Will exhaust retries",
      max_retries: 2,
    });

    // First failure — retry
    graph.failTask(t.id, "Error 1");
    const after1 = graph.getTask(t.id)!;

    // Second failure — maxRetries reached (retry_count becomes 2 >= max_retries 2)
    graph.failTask(after1.id, "Error 2");
    const after2 = graph.getTask(t.id)!;

    expect(after2.status).toBe("Blocked");
    expect(after2.retry_count).toBe(2);
    expect(after2.error_message).toBe("Error 2");
  });

  it("failTask should cascade-block dependents", () => {
    const t1 = graph.createTask({
      project_id: "proj-tg",
      title: "Root blocker",
      max_retries: 1, // will block on first failure
    });
    const t2 = graph.createTask({
      project_id: "proj-tg",
      title: "Depends on root",
      depends_on: [t1.id],
    });
    const t3 = graph.createTask({
      project_id: "proj-tg",
      title: "Depends on t2 (transitive)",
      depends_on: [t2.id],
    });

    // Fail t1 → maxRetries=1 → Blocked + cascade
    graph.failTask(t1.id, "Root failure");

    // t2 and t3 should also be Blocked (cascade)
    const t2Result = graph.getTask(t2.id)!;
    const t3Result = graph.getTask(t3.id)!;

    expect(t2Result.status).toBe("Blocked");
    expect(t3Result.status).toBe("Blocked");
  });

  it("large DAG cycle detection (50 nodes chain)", () => {
    const ids: string[] = [];
    // Create chain: task-0 → task-1 → task-2 → ... → task-49
    let prevId: string | null = null;
    for (let i = 0; i < 50; i++) {
      const deps = prevId ? [prevId] : [];
      const t = graph.createTask({
        project_id: "proj-tg",
        title: `Chain-${i}`,
        depends_on: deps,
      });
      ids.push(t.id);
      prevId = t.id;
    }

    // Adding edge from task-0 → task-49 would create cycle
    // (task-49 already transitively depends on task-0)
    const isCycle = graph.wouldCreateCycle(ids[0]!, ids[49]!);
    expect(isCycle).toBe(true);

    // Adding valid edge (task-49 → new task) should not cycle
    const newTask = graph.createTask({ project_id: "proj-tg", title: "New" });
    const noCycle = graph.wouldCreateCycle(newTask.id, ids[49]!);
    expect(noCycle).toBe(false);
  });
});
