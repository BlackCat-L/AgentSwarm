// ── Orchestrator v2 — AI-driven analysis, decomposition, contract passing ──

import { TaskGraph } from "./task-graph.js";
import { CapabilityScorer } from "./capability-scorer.js";
import { RuntimePool } from "./runtime-pool.js";
import { RateLimiter } from "./rate-limiter.js";
import { RuntimeCircuitBreaker } from "./circuit-breaker.js";
import type { TaskNode, AgentInstance } from "@agent-swarm/shared";

export interface OrchestratorConfig {
  maxGlobalAgents: number; maxPerRuntime: number;
  cycleIntervalMs: number; defaultTimeoutMs: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxGlobalAgents: 5, maxPerRuntime: 3,
  cycleIntervalMs: 5000, defaultTimeoutMs: 30 * 60 * 1000,
};

export interface ComplexityReport {
  score: number;          // 1-10
  reasoning: string;      // why this score
  suggestedAgentCount: number;
  estimatedPhases: string[];
}

export interface DecompositionResult {
  subTasks: {
    title: string;
    description: string;
    requiredCapabilities: string[];
    dependsOn: number[];  // indices of subTasks this depends on
    acceptanceCriteria: string;
  }[];
  estimatedTotalMinutes: number;
  recommendedModel: string;
}

// ── Helper: call Claude Code for structured thinking ────────

async function askClaude(prompt: string, model = "haiku"): Promise<string> {
  const { spawn } = await import("node:child_process");
  const { createInterface } = await import("node:readline");
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--output-format", "stream-json", "--verbose", "--model", model], {
      env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"], shell: true,
    });
    const lines: string[] = [];
    const rl = createInterface({ input: proc.stdout! });
    proc.stderr!.on("data", (c: Buffer) => proc.stdout!.emit("data", c));
    rl.on("line", (line: string) => {
      try { const m = JSON.parse(line); if (m.type === "assistant") {
        (m.message?.content ?? []).filter((b: any) => b.type === "text").forEach((b: any) => lines.push(b.text));
      }} catch {}
    });
    proc.on("exit", (c) => c === 0 ? resolve(lines.join("\n")) : reject(new Error(`exit ${c}`)));
    proc.stdin!.write(prompt); proc.stdin!.end();
    setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, 120_000);
  });
}

// ── Orchestrator ───────────────────────────────────────────

export class Orchestrator {
  private taskGraph: TaskGraph;
  private scorer: CapabilityScorer;
  private pool: RuntimePool;
  private rateLimiter: RateLimiter;
  private breaker: RuntimeCircuitBreaker;
  private config: OrchestratorConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    taskGraph: TaskGraph, scorer: CapabilityScorer,
    pool: RuntimePool, rateLimiter: RateLimiter, breaker: RuntimeCircuitBreaker,
    config?: Partial<OrchestratorConfig>
  ) {
    this.taskGraph = taskGraph; this.scorer = scorer;
    this.pool = pool; this.rateLimiter = rateLimiter; this.breaker = breaker;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════
  // 1️⃣  AI 复杂度分析 — Claude Code 读任务，输出结构化评分
  // ═══════════════════════════════════════════════════════════

  async analyzeComplexity(title: string, description: string): Promise<ComplexityReport> {
    const prompt = `分析以下软件任务的复杂度。返回纯 JSON（不要 markdown 代码块）。

{
  "score": <1-10>,
  "reasoning": "<为什么是这个分数，一句话>",
  "suggestedAgentCount": <建议几个agent并行>,
  "estimatedPhases": ["需要哪些阶段，如: backend, frontend, database, testing, devops"]
}

任务标题: ${title}
任务描述: ${description}`;

    const output = await askClaude(prompt);
    try {
      const json = JSON.parse(output.replace(/```[^]*?```/g, "").trim());
      return {
        score: Math.max(1, Math.min(10, json.score ?? 5)),
        reasoning: json.reasoning ?? "AI 分析",
        suggestedAgentCount: Math.max(1, Math.min(5, json.suggestedAgentCount ?? 2)),
        estimatedPhases: json.estimatedPhases ?? [],
      };
    } catch {
      // Fallback to keyword scoring if AI output is malformed
      return this._fallbackComplexity(title, description);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2️⃣  AI 任务分解 — 大需求拆成子任务 + DAG 依赖
  // ═══════════════════════════════════════════════════════════

  async decomposeTask(
    title: string, description: string, complexity: ComplexityReport
  ): Promise<DecompositionResult> {
    const prompt = `你是一个软件架构师。把以下需求拆解成具体的子任务。
返回纯 JSON（不要 markdown 代码块）。每个子任务必须有明确的能力标签。

{
  "subTasks": [
    {
      "title": "子任务标题",
      "description": "详细描述",
      "requiredCapabilities": ["backend", "database"],
      "dependsOn": [0],
      "acceptanceCriteria": "如何验证完成"
    }
  ],
  "estimatedTotalMinutes": <估计总分钟数>,
  "recommendedModel": "<sonnet|opus|haiku>"
}

规则:
- dependsOn 是数组索引，如 dependsOn: [0, 2] 表示依赖第0和第2个子任务
- 第一个子任务的 dependsOn 应为空数组 []
- 每个子任务分配给一个角色
- 复杂度评分: ${complexity.score}/10，建议 ${complexity.suggestedAgentCount} 个agent并行

需求标题: ${title}
需求描述: ${description}`;

    const output = await askClaude(prompt, "sonnet");
    try {
      const json = JSON.parse(output.replace(/```[^]*?```/g, "").trim());
      return {
        subTasks: (json.subTasks ?? []).map((t: any) => ({
          title: t.title ?? "子任务",
          description: t.description ?? "",
          requiredCapabilities: t.requiredCapabilities ?? [],
          dependsOn: t.dependsOn ?? [],
          acceptanceCriteria: t.acceptanceCriteria ?? "",
        })),
        estimatedTotalMinutes: json.estimatedTotalMinutes ?? 30,
        recommendedModel: json.recommendedModel ?? "sonnet",
      };
    } catch {
      // Fallback: single task
      return {
        subTasks: [{ title, description, requiredCapabilities: [], dependsOn: [], acceptanceCriteria: "" }],
        estimatedTotalMinutes: 15,
        recommendedModel: "sonnet",
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3️⃣  契约传递 — 上游输出 → 下游输入上下文注入
  // ═══════════════════════════════════════════════════════════

  /**
   * When a task completes, inject its output as context into dependent tasks.
   * This IS the contract passing mechanism:
   *   Architect produces API_CONTRACT → Backend receives it as context
   *   Backend produces implementation → QA receives contract + impl as context
   */
  async propagateContext(completedTaskId: string): Promise<void> {
    const completed = this.taskGraph.getTask(completedTaskId);
    if (!completed || completed.status !== "Done") return;

    // Extract the output from the task description (stored after execution)
    const contractOutput = this._extractOutput(completed);

    // Find all tasks that depend on this one
    const dependents = this.taskGraph.getDependents(completedTaskId);

    for (const dep of dependents) {
      const dependent = this.taskGraph.getTask(dep.task_id);
      if (!dependent) continue;

      // Inject upstream output as context into the dependent task's description
      const upstreamTitle = completed.title;
      const contextBlock = `\n\n---\n### 上游契约: ${upstreamTitle}\n${contractOutput}`;

      // Only append if not already present
      if (!dependent.description.includes(`上游契约: ${upstreamTitle}`)) {
        this.taskGraph.updateTask(dependent.id, {
          description: (dependent.description || "") + contextBlock,
          version: dependent.version,
        });
      }
    }
  }

  private _extractOutput(task: TaskNode): string {
    // The execution result is stored in description after "### 执行结果"
    const match = task.description?.match(/### 执行结果\n([\s\S]*)/);
    if (match && match[1]) return match[1].trim();

    // Or the acceptance criteria
    if (task.acceptance_criteria) return task.acceptance_criteria;

    // Or just the whole description
    return task.description?.slice(-500) ?? "(无输出)";
  }

  // ═══════════════════════════════════════════════════════════
  // 4️⃣  完整编排 — 输入一句话需求，自动完成全部流程
  // ═══════════════════════════════════════════════════════════

  async orchestrate(
    projectId: string, title: string, description: string
  ): Promise<{
    complexity: ComplexityReport;
    decomposition: DecompositionResult;
    taskIds: string[];
  }> {
    // Step 1: AI analyze complexity
    const complexity = await this.analyzeComplexity(title, description);

    // Step 2: AI decompose into sub-tasks
    const decomposition = await this.decomposeTask(title, description, complexity);

    // Step 3: Create all sub-tasks in TaskGraph with DAG dependencies
    const taskIds: string[] = [];
    const idMap = new Map<number, string>(); // index → taskId

    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const st = decomposition.subTasks[i]!;
      const task = this.taskGraph.createTask({
        project_id: projectId,
        title: st.title,
        description: st.description,
        priority: i === 0 ? 0 : 1,
        required_capabilities: st.requiredCapabilities,
        acceptance_criteria: st.acceptanceCriteria,
        max_retries: 3,
      });
      taskIds.push(task.id);
      idMap.set(i, task.id);
    }

    // Second pass: set up dependencies
    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const st = decomposition.subTasks[i]!;
      if (st.dependsOn.length > 0) {
        const depIds = st.dependsOn
          .map((depIdx: number) => idMap.get(depIdx))
          .filter((id): id is string => id !== undefined);
        if (depIds.length > 0) {
          const tId = idMap.get(i);
          if (tId) this.taskGraph.addDependencies(tId, depIds);
        }
      }
    }

    return { complexity, decomposition, taskIds };
  }

  // ═══════════════════════════════════════════════════════════
  // 5️⃣  全自动执行 — 输入需求 → 自动拆解 → 分配 → 并行执行 → 完成
  // ═══════════════════════════════════════════════════════════

  /**
   * Full autonomous pipeline:
   *   需求 → analyze → decompose → create DAG → assign → execute → propagate → repeat
   * Returns when all tasks are Done or some are Blocked.
   */
  async autoExecute(
    projectId: string, title: string, description: string
  ): Promise<{
    complexity: ComplexityReport;
    decomposition: DecompositionResult;
    taskIds: string[];
    completed: number;
    blocked: number;
  }> {
    // Step 1-3: orchestrate
    const plan = await this.orchestrate(projectId, title, description);

    // Step 4: Auto-assign agents to all tasks
    const { ExecutionService } = await import("./execution-service.js");
    const executor = new ExecutionService(this.taskGraph);

    // Collect all agents in this project
    const allAgents = await this._getAgents(projectId);

    // Assign agents to each task
    for (const taskId of plan.taskIds) {
      const task = this.taskGraph.getTask(taskId);
      if (!task) continue;
      const bestAgent = this.selectBestAgent(allAgents, task.required_capabilities, projectId);
      if (bestAgent) {
        // Assign but don't execute yet — wait for dependencies
        this.taskGraph.assignTask(taskId, bestAgent, task.version);
      }
    }

    // Step 5: Execute tasks in dependency order
    // Start with tasks that have no dependencies
    const remaining = new Set(plan.taskIds);
    let completed = 0;
    let blocked = 0;

    while (remaining.size > 0) {
      // Find tasks whose dependencies are all Done
      const ready = [...remaining].filter(id => {
        if (executor.isRunning(id)) return false;
        const task = this.taskGraph.getTask(id);
        if (!task) return false;
        if (task.status === "Done") { remaining.delete(id); completed++; return false; }
        if (task.status === "Blocked") { remaining.delete(id); blocked++; return false; }
        return task.status === "InDev" && this.taskGraph.isTaskReady(id);
      });

      if (ready.length === 0) {
        // Check if any tasks are still running
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Execute ready tasks in parallel
      const results = await Promise.allSettled(
        ready.map(taskId => executor.executeTask(taskId).catch(e => ({ success: false, output: "", error: e.message })))
      );

      for (let i = 0; i < ready.length; i++) {
        const taskId = ready[i]!;
        const result = results[i];
        if (result?.status === "fulfilled" && result.value.success) {
          remaining.delete(taskId);
          completed++;
          // Propagate context to dependent tasks
          await this.propagateContext(taskId);
        }
      }

      // Update agent busies after each batch
      await new Promise(r => setTimeout(r, 1000));
    }

    return { ...plan, completed, blocked };
  }

  private async _getAgents(projectId: string): Promise<AgentInstance[]> {
    // Read from DB directly
    const { getDb } = await import("../db/connection.js");
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM agents WHERE project_id = ?");
    stmt.bind([projectId]);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows.map((r: any) => ({
      id: r.id, project_id: r.project_id, name: r.name, role: r.role,
      runtime: r.runtime, model: r.model, status: r.status,
      worktree_path: r.worktree_path, current_task_id: r.current_task_id,
      capabilities: JSON.parse(r.capabilities || "[]"),
      last_heartbeat: r.last_heartbeat, permission_mode: r.permission_mode,
      pid: r.pid, created_at: r.created_at,
    }));
  }

  // ═══════════════════════════════════════════════════════════
  // 5️⃣  Legacy: Agent selection + assignment + safety
  // ═══════════════════════════════════════════════════════════

  estimateComplexity(desc: string, title: string): number {
    // Fallback keyword-based (used when AI is unavailable)
    return this._fallbackComplexity(title, desc).score;
  }

  decideParallelism(score: number): number {
    if (score <= 2) return 1; if (score <= 4) return 2;
    if (score <= 7) return 3; return Math.min(4, this.config.maxGlobalAgents);
  }

  selectBestAgent(candidates: AgentInstance[], requiredTags: string[], _pid: string): string | null {
    const idle = candidates.filter(a => a.status === "idle");
    if (idle.length === 0) return null;
    const ranked = this.scorer.rankAgents(idle.map(a => a.id), requiredTags);
    return ranked[0]?.agentId ?? null;
  }

  submitResult(taskId: string, passed: boolean, errorMsg?: string): TaskNode | null {
    if (passed) {
      const result = this.taskGraph.completeTask(taskId);
      // Auto-propagate context to dependents
      if (result) this.propagateContext(taskId).catch(() => {});
      return result;
    }
    return this.taskGraph.failTask(taskId, errorMsg ?? "Task failed QA/acceptance");
  }

  canAcceptWork(runtime: string) {
    if (!this.breaker.canDispatch(runtime)) return { allowed: false, reason: "Circuit breaker OPEN" };
    if (this.rateLimiter.isRuntimePaused(runtime)) return { allowed: false, reason: "Rate limited" };
    if (this.pool.activeCountForRuntime(runtime) >= this.config.maxPerRuntime) return { allowed: false, reason: "Runtime limit" };
    if (this.pool.activeCount >= this.config.maxGlobalAgents) return { allowed: false, reason: "Global limit" };
    return { allowed: true };
  }

  getStats() { return { pool: this.pool.getStats(), paused: this.rateLimiter.getPausedRuntimes(), config: this.config, cycleRunning: this.intervalId !== null }; }

  startCycle(): void { if (!this.intervalId) this.intervalId = setInterval(() => this.assignmentCycle(), this.config.cycleIntervalMs); }
  stopCycle(): void { if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; } }

  assignmentCycle(): string[] {
    const tasks = this.taskGraph.queryTasks({ status: "Backlog", limit: 100 });
    return tasks.filter(t => this.taskGraph.isTaskReady(t.id)).slice(0, this.config.maxGlobalAgents).map(t => t.id);
  }

  private _fallbackComplexity(title: string, desc: string): ComplexityReport {
    const text = `${title} ${desc}`.toLowerCase();
    let s = 2;
    if (text.match(/全栈|full.stack|saas|平台|enterprise/)) s += 3;
    if (text.match(/api|backend|frontend|数据库|auth/)) s += 1;
    if (text.includes("frontend") && text.includes("backend")) s += 2;
    if (text.match(/修复|fix|typo|小改动/)) s -= 1;
    return { score: Math.max(1, Math.min(10, s)), reasoning: "关键词分析", suggestedAgentCount: s <= 3 ? 1 : s <= 6 ? 2 : 3, estimatedPhases: [] };
  }
}
