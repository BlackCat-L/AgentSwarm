// ============================================================
// TaskGraph — Core task DAG engine with optimistic locking
// Reference: AgentManager task-graph.ts + PRD §0.8 RuntimePool
// ============================================================

import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/connection.js";
import type {
  TaskNode,
  TaskStatus,
  TaskPriority,
  TaskDependency,
  CreateTaskInput,
  UpdateTaskInput,
} from "@agent-swarm/shared";

/** sql.js bind parameter type (number | string | null) */
type SqlParam = number | string | null;

// Re-export for convenience
export type { TaskNode, TaskStatus, TaskDependency, CreateTaskInput, UpdateTaskInput };

// ============================================================
// Query helpers
// ============================================================

function rowToTask(row: Record<string, unknown>): TaskNode {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    status: row.status as TaskStatus,
    priority: (row.priority as number) as TaskPriority,
    complexity: row.complexity as number | null,
    owner_agent_id: (row.owner_agent_id as string) ?? null,
    parent_task_id: (row.parent_task_id as string) ?? null,
    input: (row.input as string) ?? null,
    expected_output: (row.expected_output as string) ?? null,
    acceptance_criteria: (row.acceptance_criteria as string) ?? null,
    required_capabilities: JSON.parse((row.required_capabilities as string) || "[]"),
    version: row.version as number,
    retry_count: row.retry_count as number,
    max_retries: row.max_retries as number,
    timeout_ms: row.timeout_ms as number | null,
    error_message: (row.error_message as string) ?? null,
    phase: (row.phase as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: (row.completed_at as string) ?? null,
  };
}

function rowToDep(row: Record<string, unknown>): TaskDependency {
  return {
    task_id: row.task_id as string,
    depends_on_id: row.depends_on_id as string,
  };
}

/** Execute a parameterized query using prepared statement and return rows. */
function queryAll(sql: string, params: SqlParam[]): Record<string, unknown>[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ============================================================
// TaskGraph class
// ============================================================

export class TaskGraph {
  /**
   * Create a new task with full validation.
   */
  createTask(input: CreateTaskInput): TaskNode {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO tasks (
        id, project_id, title, description, status, priority, complexity,
        required_capabilities, acceptance_criteria, expected_output,
        max_retries, timeout_ms, version, retry_count, phase,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.project_id,
        input.title,
        input.description ?? "",
        "Backlog" as TaskStatus,
        input.priority ?? 3,
        input.complexity ?? null,
        JSON.stringify(input.required_capabilities ?? []),
        input.acceptance_criteria ?? null,
        input.expected_output ?? null,
        input.max_retries ?? 3,
        input.timeout_ms ?? null,
        1,   // version
        0,   // retry_count
        (input as any).phase ?? null,
        now,
        now,
      ]
    );

    // Insert dependencies
    if (input.depends_on?.length) {
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)"
      );
      for (const depId of input.depends_on) {
        stmt.run([id, depId]);
      }
      stmt.free();
    }

    saveDb();
    return this.getTask(id)!;
  }

  /**
   * Get a single task by ID.
   */
  getTask(id: string): TaskNode | null {
    const rows = queryAll("SELECT * FROM tasks WHERE id = ?", [id]);
    return rows.length > 0 ? rowToTask(rows[0]!) : null;
  }

  /**
   * Query tasks with multi-dimensional filtering.
   */
  queryTasks(filters: {
    project_id?: string;
    status?: TaskStatus;
    agent_id?: string;
    priority?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }): TaskNode[] {
    const conditions: string[] = [];
    const params: SqlParam[] = [];

    if (filters.project_id) {
      conditions.push("project_id = ?");
      params.push(filters.project_id);
    }
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters.agent_id) {
      conditions.push("owner_agent_id = ?");
      params.push(filters.agent_id);
    }
    if (filters.priority !== undefined) {
      conditions.push("priority = ?");
      params.push(filters.priority);
    }
    if (filters.search) {
      conditions.push("(title LIKE ? OR description LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const limit = filters.limit ?? 250;
    const offset = filters.offset ?? 0;

    const sql = `SELECT * FROM tasks ${where} ORDER BY priority ASC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return queryAll(sql, params).map(rowToTask);
  }

  /**
   * Assign a task to an agent with optimistic locking.
   * Uses UPDATE WHERE version = ? as a CAS (Compare-And-Swap) operation.
   * Only succeeds if version matches (no concurrent modification).
   */
  assignTask(taskId: string, agentId: string, expectedVersion: number): TaskNode | null {
    const db = getDb();

    // Read current task state
    const task = this.getTask(taskId);
    if (!task) return null;

    // Optimistic lock check
    if (task.version !== expectedVersion) return null;

    // Verify task is assignable
    if (task.status !== "Backlog" || task.owner_agent_id !== null) return null;

    // Atomic CAS update — only modifies row if version matches
    const now = new Date().toISOString();
    db.run(
      `UPDATE tasks
       SET owner_agent_id = ?, status = 'InDev',
           version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
      [agentId, now, taskId, expectedVersion]
    );

    // Verify the update succeeded by checking version changed
    const updated = this.getTask(taskId);
    if (!updated || updated.version === expectedVersion) {
      // 0 rows affected — another caller won the race
      return null;
    }

    saveDb();
    return updated;
  }

  /**
   * Update task status with optimistic locking.
   */
  updateTask(taskId: string, input: UpdateTaskInput): TaskNode | null {
    const db = getDb();
    const task = this.getTask(taskId);
    if (!task) return null;

    // Optimistic lock check
    if (task.version !== input.version) return null;

    const now = new Date().toISOString();
    const updates: string[] = ["version = version + 1", "updated_at = ?"];
    const params: SqlParam[] = [now];

    if (input.title !== undefined) {
      updates.push("title = ?");
      params.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      params.push(input.status);
      if (input.status === "Done" || input.status === "Cancelled") {
        updates.push("completed_at = ?");
        params.push(now);
      }
    }
    if (input.priority !== undefined) {
      updates.push("priority = ?");
      params.push(input.priority);
    }
    if (input.owner_agent_id !== undefined) {
      updates.push("owner_agent_id = ?");
      params.push(input.owner_agent_id);
    }
    if (input.error_message !== undefined) {
      updates.push("error_message = ?");
      params.push(input.error_message);
    }

    params.push(taskId, task.version);

    db.run(
      `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND version = ?`,
      params
    );

    saveDb();
    return this.getTask(taskId);
  }

  /**
   * Get task dependencies.
   */
  getDependencies(taskId: string): TaskDependency[] {
    return queryAll(
      "SELECT * FROM task_dependencies WHERE task_id = ?",
      [taskId]
    ).map(rowToDep);
  }

  /**
   * Get tasks that depend on the given task.
   */
  getDependents(taskId: string): TaskDependency[] {
    return queryAll(
      "SELECT * FROM task_dependencies WHERE depends_on_id = ?",
      [taskId]
    ).map(rowToDep);
  }

  /**
   * BFS cycle detection — returns true if adding `dependsOnId` to `taskId`
   * would create a cycle in the dependency graph.
   */
  wouldCreateCycle(taskId: string, dependsOnId: string): boolean {
    // If task depends on itself, it's a cycle
    if (taskId === dependsOnId) return true;

    // BFS from dependsOnId — if we reach taskId, adding this edge creates a cycle
    const visited = new Set<string>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get all tasks that `current` depends on
      const deps = this.getDependencies(current);
      for (const dep of deps) {
        if (!visited.has(dep.depends_on_id)) {
          queue.push(dep.depends_on_id);
        }
      }
    }

    return false;
  }

  /**
   * Check if a task is "ready" — all its dependencies are Done.
   */
  isTaskReady(taskId: string): boolean {
    const deps = this.getDependencies(taskId);
    for (const dep of deps) {
      const depTask = this.getTask(dep.depends_on_id);
      if (!depTask || depTask.status !== "Done") {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all tasks that are ready to be worked on (dependencies met + unassigned + backlog).
   */
  getReadyTasks(projectId: string): TaskNode[] {
    const backlogTasks = this.queryTasks({ project_id: projectId, status: "Backlog" });
    return backlogTasks.filter((t) => this.isTaskReady(t.id));
  }

  /**
   * Get the full DAG for a project (tasks + dependency edges).
   */
  getProjectDag(projectId: string): { tasks: TaskNode[]; edges: TaskDependency[] } {
    const tasks = this.queryTasks({ project_id: projectId, limit: 10000 });
    const edges = queryAll(
      `SELECT td.* FROM task_dependencies td
       JOIN tasks t ON td.task_id = t.id
       WHERE t.project_id = ?
       ORDER BY td.task_id`,
      [projectId]
    ).map(rowToDep);
    return { tasks, edges };
  }

  /**
   * Delete a task and its dependency records.
   */
  deleteTask(taskId: string): boolean {
    const db = getDb();
    const task = this.getTask(taskId);
    if (!task) return false;

    db.run("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?",
      [taskId, taskId]);
    db.run("DELETE FROM tasks WHERE id = ?", [taskId]);
    saveDb();
    return true;
  }

  // ============================================================
  // DAG dependency management + cascading
  // ============================================================

  /**
   * Add dependencies to a task with cycle detection.
   * Rejects the entire batch if any edge would create a cycle.
   * @returns Array of added dependency edges, or null if any edge creates a cycle.
   */
  addDependencies(taskId: string, dependsOnIds: string[]): TaskDependency[] | null {
    const db = getDb();

    // Validate: task must exist
    const task = this.getTask(taskId);
    if (!task) return null;

    // Validate: every dependsOnId must exist
    for (const depId of dependsOnIds) {
      if (!this.getTask(depId)) return null;
    }

    // Cycle check: reject entire batch if any edge would create a cycle
    for (const depId of dependsOnIds) {
      if (this.wouldCreateCycle(taskId, depId)) return null;
    }

    // Insert all edges
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)"
    );
    for (const depId of dependsOnIds) {
      stmt.run([taskId, depId]);
    }
    stmt.free();
    saveDb();

    return this.getDependencies(taskId);
  }

  /**
   * Mark a task as Done and unblock dependents that now have all deps met.
   * Tasks that were Blocked because this was their last pending dependency
   * are moved back to Backlog.
   */
  completeTask(taskId: string): TaskNode | null {
    const task = this.getTask(taskId);
    if (!task) return null;

    const updated = this.updateTask(taskId, {
      status: "Done",
      version: task.version,
    });
    if (!updated) return null;

    // Check all tasks that depend on this completed task
    const dependents = this.getDependents(taskId);
    for (const dep of dependents) {
      const dependent = this.getTask(dep.task_id);
      if (dependent && dependent.status === "Blocked") {
        // Check if this was the last blocking dependency
        if (this.isTaskReady(dep.task_id)) {
          this.unblockTask(dep.task_id, dependent.version);
        }
      }
    }

    return this.getTask(taskId);
  }

  /**
   * Fail a task — increment retry_count.
   * If retry_count >= max_retries, block the task AND cascade-block all
   * tasks that depend on it.
   */
  failTask(taskId: string, errorMessage: string): TaskNode | null {
    const task = this.getTask(taskId);
    if (!task) {
      console.error(`[failTask] Task ${taskId.slice(0, 8)} not found in DB — cannot fail`);
      return null;
    }

    const newRetryCount = task.retry_count + 1;

    if (newRetryCount >= task.max_retries) {
      // Max retries exhausted — permanently block
      console.warn(`[failTask] Task "${task.title}" (${taskId.slice(0, 8)}) retries EXHAUSTED (${newRetryCount}/${task.max_retries}) — moving to Blocked. Error: ${errorMessage.slice(0, 200)}`);
      const db = getDb();
      const now = new Date().toISOString();
      db.run(
        `UPDATE tasks SET retry_count = ?, status = 'Blocked',
         owner_agent_id = NULL, error_message = ?,
         version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
        [newRetryCount, errorMessage, now, taskId, task.version]
      );
      saveDb();

      // Cascade: block all tasks that depend on this one
      this.cascadeBlock(taskId);
    } else {
      // Within retry limit — mark as failed, goes back to Backlog
      console.log(`[failTask] Task "${task.title}" (${taskId.slice(0, 8)}) failed — retry ${newRetryCount}/${task.max_retries}, moving to Backlog. Error: ${errorMessage.slice(0, 200)}`);
      const db = getDb();
      const now = new Date().toISOString();
      db.run(
        `UPDATE tasks SET retry_count = ?, status = 'Backlog',
         owner_agent_id = NULL, error_message = ?,
         version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
        [newRetryCount, errorMessage, now, taskId, task.version]
      );
      saveDb();
    }

    return this.getTask(taskId);
  }

  /**
   * Unblock a task — move from Blocked back to Backlog.
   * Used when all blocking dependencies are resolved.
   */
  unblockTask(taskId: string, expectedVersion: number): TaskNode | null {
    const task = this.getTask(taskId);
    if (!task) return null;
    if (task.status !== "Blocked") return null;
    if (task.version !== expectedVersion) return null;

    const now = new Date().toISOString();
    getDb().run(
      `UPDATE tasks SET status = 'Backlog', error_message = NULL,
       version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
      [now, taskId, expectedVersion]
    );
    saveDb();
    return this.getTask(taskId);
  }

  /**
   * Recursively block all tasks that depend on the given task (BFS cascade).
   */
  private cascadeBlock(rootTaskId: string): void {
    const queue = [rootTaskId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const dependents = this.getDependents(current);
      for (const dep of dependents) {
        const dependent = this.getTask(dep.task_id);
        if (dependent && dependent.status !== "Blocked" && dependent.status !== "Done") {
          this.markBlocked(dep.task_id, dependent.version,
            `Upstream task ${current} is blocked`);
        }
        if (!visited.has(dep.task_id)) {
          queue.push(dep.task_id);
        }
      }
    }
  }

  /**
   * Mark a single task as Blocked (internal helper).
   */
  private markBlocked(taskId: string, expectedVersion: number, reason: string): void {
    const now = new Date().toISOString();
    getDb().run(
      `UPDATE tasks SET status = 'Blocked', error_message = ?,
       version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
      [reason, now, taskId, expectedVersion]
    );
  }
}
