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
// Uses spawnClaudeWithRetry for transient failure resilience.

let _spawnModule: any = null;

async function askClaude(prompt: string, model = "deepseek-v4-flash"): Promise<string> {
  if (!_spawnModule) {
    _spawnModule = await import("./claude-spawn.js");
  }
  const result = await _spawnModule.spawnClaudeWithRetry({
    prompt,
    model,
    timeoutMs: 120_000,
    label: "orchestrator-ask",
  }, 2);
  if (result.success) return result.output;
  const stderr = result.output || "(no output)";
  throw new Error(`${result.error ?? "askClaude failed"} | stderr: ${stderr.slice(0, 300)}`);
}

// ── Robust JSON extraction from AI output ──────────────────
// AI sometimes wraps JSON in markdown fences, adds commentary, or
// produces slightly malformed JSON (trailing commas, unicode issues).
// This function tries multiple strategies before giving up.

function extractJson(output: string): any {
  // Strategy 1: Remove markdown fences, try direct parse
  const cleaned = output
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try { return JSON.parse(cleaned); } catch {}

  // Strategy 2: Find the outermost { } pair containing expected keys
  // Look for {"score" or { "score"
  const objMatch = cleaned.match(/\{[^{}]*"score"\s*:\s*\d+[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  // Strategy 3: Find any { } pair and try to fix common issues
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    let candidate = cleaned.slice(braceStart, braceEnd + 1);
    // Fix trailing commas before } or ]
    candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
    // Fix unescaped newlines in strings
    candidate = candidate.replace(/\n/g, "\\n");
    try { return JSON.parse(candidate); } catch {}
  }

  // Strategy 4: Extract fields individually with regex
  const scoreMatch = cleaned.match(/"score"\s*:\s*(\d+)/);
  const reasoningMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]+)"/);
  const agentMatch = cleaned.match(/"suggestedAgentCount"\s*:\s*(\d+)/);
  const phasesMatch = cleaned.match(/"estimatedPhases"\s*:\s*\[([^\]]*)\]/);
  if (scoreMatch?.[1]) {
    const phases: string[] = [];
    if (phasesMatch?.[1]) {
      const items = phasesMatch[1].match(/"([^"]+)"/g);
      if (items) phases.push(...items.map(i => i.replace(/"/g, "")));
    }
    return {
      score: parseInt(scoreMatch[1]),
      reasoning: reasoningMatch?.[1] ?? "AI analysis",
      suggestedAgentCount: agentMatch?.[1] ? parseInt(agentMatch[1]) : 2,
      estimatedPhases: phases,
    };
  }

  throw new Error("No JSON object found in AI output");
}

// ── Capability inference (keyword → skill module mapping) ───
// Used when AI decomposition fails, so tasks still get skill injection.

// ── Canonical 5-tag capability vocabulary ──
// These MUST match seed.ts ROLE_CAPABILITY_MAP tags.
// Legacy 9-tag keywords are merged: database/api/backend/devops → architecture
const CAPABILITY_KEYWORDS: Array<{ cap: string; keywords: RegExp[] }> = [
  { cap: "frontend",   keywords: [/前端|frontend|ui|界面|页面|page|组件|component|react|vue|样式|css|html/i] },
  { cap: "architecture",keywords: [
    /架构|architect|设计|design|模块|module|系统|system|模式|pattern|重构|refactor/i,
    /数据库|database|表|table|sql|migration|迁移|索引|index|查询|query|存储|store/i,
    /api|接口|端点|endpoint|rest|路由|route|请求|request|响应|response/i,
    /后端|backend|服务端|server|逻辑|logic|业务|business|处理|handler/i,
    /部署|deploy|构建|build|ci|cd|docker|容器|环境|env|配置|config|脚本|script/i,
  ]},
  { cap: "testing",    keywords: [/测试|test|单元测试|unit test|验证|verify|断言|assert|mock|qa/i] },
  { cap: "performance",keywords: [/性能|performance|优化|optimize|缓存|cache|加速|加速|速度|speed|慢|slow/i] },
  { cap: "security",   keywords: [/安全|security|认证|auth|登录|login|注册|register|密码|password|token|jwt|权限|permission|加密|encrypt|哈希|hash/i] },
];

function inferCapabilities(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const caps: string[] = [];
  for (const { cap, keywords } of CAPABILITY_KEYWORDS) {
    if (keywords.some(k => k.test(text))) {
      caps.push(cap);
    }
  }
  return caps.length > 0 ? caps : ["architecture"]; // default to architecture
}

// ── Orchestrator ───────────────────────────────────────────

/** Maximum number of Claude Code processes spawned concurrently */
const MAX_CONCURRENT_SPAWNS = 3;

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

    try {
      const output = await askClaude(prompt);
      try {
        const json = extractJson(output);
        return {
          score: Math.max(1, Math.min(10, json.score ?? 5)),
          reasoning: json.reasoning ?? "AI 分析",
          suggestedAgentCount: Math.max(1, Math.min(5, json.suggestedAgentCount ?? 2)),
          estimatedPhases: json.estimatedPhases ?? [],
        };
      } catch {
        // JSON extraction failed → fallback with raw output snippet
        const fb = this._fallbackComplexity(title, description);
        fb.reasoning = `[JSON提取失败] ${fb.reasoning} | raw: ${output.slice(0, 100)}`;
        return fb;
      }
    } catch (err: any) {
      const fb = this._fallbackComplexity(title, description);
      fb.reasoning = `[AI调用失败] ${fb.reasoning} | ${err.message?.slice(0, 120) ?? 'unknown'}`;
      console.error(`[analyzeComplexity] AI call failed: ${err.message?.slice(0, 200)}`);
      return fb;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2️⃣  AI 任务分解 — 大需求拆成子任务 + DAG 依赖
  // ═══════════════════════════════════════════════════════════

  async decomposeTask(
    title: string, description: string, complexity: ComplexityReport
  ): Promise<DecompositionResult> {
    const prompt = `你是一个软件架构师。把以下需求拆解成具体的子任务。
返回纯 JSON（不要 markdown 代码块）。

能力标签必须从以下 5 个标签中选择（可多选，不要自己编造）:
能力标签必须从以下 5 个标签中选择（可多选，不要自己编造）:
- frontend      (前端/UI/组件/样式/交互)
- architecture  (架构设计/后端逻辑/API/数据库/DevOps/模块划分)
- testing       (测试/验证/QA/代码审查)
- performance   (性能优化/缓存/加速)
- security      (安全/认证/授权/加密/权限)

{
  "subTasks": [
    {
      "title": "子任务标题",
      "description": "详细描述（包含具体要做什么、涉及哪些文件）",
      "requiredCapabilities": ["backend", "database"],
      "dependsOn": [0],
      "acceptanceCriteria": "可验证的完成标准"
    }
  ],
  "estimatedTotalMinutes": <估计总分钟数>,
  "recommendedModel": "<deepseek-v4-pro[1m]|deepseek-v4-flash>"
}

规则:
- dependsOn 是数组索引，[0] 表示依赖第0个子任务，第一个子任务用 []
- requiredCapabilities 必须用上面列出的标签，不要自己编造
- 复杂度: ${complexity.score}/10，建议 ${complexity.suggestedAgentCount} 个agent并行
- 每个子任务描述要足够详细（100字以上），包含涉及的文件

需求标题: ${title}
需求描述: ${description}`;

    try {
      const output = await askClaude(prompt);
      try {
        const json = extractJson(output);
        return {
          subTasks: (json.subTasks ?? []).map((t: any) => ({
            title: t.title ?? "子任务",
            description: t.description ?? "",
            requiredCapabilities: t.requiredCapabilities ?? [],
            dependsOn: t.dependsOn ?? [],
            acceptanceCriteria: t.acceptanceCriteria ?? "",
          })),
          estimatedTotalMinutes: json.estimatedTotalMinutes ?? 30,
          recommendedModel: json.recommendedModel ?? "deepseek-v4-pro[1m]",
        };
      } catch {
        console.error(`[decomposeTask] JSON extraction failed, using phase-based fallback`);
        return this._phaseBasedFallback(title, description, complexity);
      }
    } catch (err: any) {
      console.error(`[decomposeTask] AI call failed: ${err.message?.slice(0, 200)}`);
      return this._phaseBasedFallback(title, description, complexity);
    }
  }

  /** Fallback: use complexity phases as task structure when AI decomposition fails */
  private _phaseBasedFallback(title: string, description: string, complexity: ComplexityReport): DecompositionResult {
    const phases = complexity.estimatedPhases.length > 0
      ? complexity.estimatedPhases
      : ["implementation"];

    console.log(`[decomposeTask] Phase fallback: ${phases.length} phases -> ${phases.join(", ")}`);

    const subTasks = phases.map((phaseName, i) => ({
      title: `[${phaseName}] ${title}`,
      description: `Phase: ${phaseName}\n\n${description}\n\nPhase "${phaseName}" task.`,
      requiredCapabilities: inferCapabilities(title, `${description} ${phaseName}`),
      dependsOn: i > 0 ? [i - 1] : [],
      acceptanceCriteria: `Phase ${phaseName} completed and verified`,
    }));

    return {
      subTasks,
      estimatedTotalMinutes: phases.length * 10,
      recommendedModel: complexity.score >= 7 ? "deepseek-v4-pro[1m]" : "deepseek-v4-flash",
    };
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
    const { QualityGateService } = await import("./quality-gate.js");
    const executor = new ExecutionService(this.taskGraph);
    const qualityGate = new QualityGateService();

    // Collect all agents + build lookup map
    const allAgents = await this._getAgents(projectId);
    const agentMap = new Map(allAgents.map(a => [a.id, a]));

    // Assign agents to each task
    for (const taskId of plan.taskIds) {
      const task = this.taskGraph.getTask(taskId);
      if (!task) continue;
      const bestAgent = this.selectBestAgent(allAgents, task.required_capabilities, projectId);
      if (bestAgent) {
        this.taskGraph.assignTask(taskId, bestAgent, task.version);
      }
    }

    // Step 5: Execute tasks in dependency order with quality gates
    const remaining = new Set(plan.taskIds);
    let completed = 0;
    let blocked = 0;

    while (remaining.size > 0) {
      const ready = [...remaining].filter(id => {
        if (executor.isRunning(id)) return false;
        const task = this.taskGraph.getTask(id);
        if (!task) return false;
        if (task.status === "Done") { remaining.delete(id); completed++; return false; }
        if (task.status === "Blocked") { remaining.delete(id); blocked++; return false; }
        return task.status === "InDev" && this.taskGraph.isTaskReady(id);
      });

      if (ready.length === 0) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Execute ready InDev tasks with concurrency limit.
      // MAX_CONCURRENT_SPAWNS prevents spawn-storm → API rate-limit → crash (exit -1).
      const results: Array<{ status: string; value?: any; reason?: any }> = [];
      for (let i = 0; i < ready.length; i += MAX_CONCURRENT_SPAWNS) {
        const batch = ready.slice(i, i + MAX_CONCURRENT_SPAWNS);
        const batchResults = await Promise.allSettled(
          batch.map(taskId => {
            const task = this.taskGraph.getTask(taskId);
            const agent = task?.owner_agent_id ? agentMap.get(task.owner_agent_id) : undefined;
            const model = agent?.model || "deepseek-v4-pro[1m]";
            // If agent has a lighter model configured, use it; otherwise default
            return executor.executeTask(taskId, model, agent).catch(e => ({ success: false, output: "", error: e.message }));
          })
        );
        results.push(...batchResults);
        // Brief inter-batch pause to let API rate-limit bucket refill
        if (i + MAX_CONCURRENT_SPAWNS < ready.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Process results + run quality gates for each completed execution
      for (let i = 0; i < ready.length; i++) {
        const taskId = ready[i]!;
        const result = results[i];

        if (result?.status === "fulfilled" && result.value.success) {
          const task = this.taskGraph.getTask(taskId);
          if (!task) continue;

          // ── Quality Gate Chain ──
          const gateReport = await qualityGate.runGates(task, result.value.output).catch(() => null);

          if (gateReport?.overallPassed) {
            // ✅ All gates passed → promote to Done
            console.log(`[QualityGate] ${gateReport.summary}`);
            const fresh = this.taskGraph.getTask(taskId);
            if (fresh) {
              this.taskGraph.updateTask(taskId, { status: "Done", version: fresh.version });
            }
            remaining.delete(taskId);
            completed++;
            await this.propagateContext(taskId);
          } else if (gateReport) {
            // ⚠️ Gates failed → move to InFix for retry
            console.log(`[QualityGate] ${gateReport.summary}`);
            const failedGates = gateReport.gates
              .filter(g => !g.passed)
              .map(g => `  - [${g.gate}] ${g.findings.join("; ") || "检查未通过"}`)
              .join("\n");
            const fresh = this.taskGraph.getTask(taskId);
            if (fresh) {
              this.taskGraph.updateTask(taskId, {
                description: (task.description || "") + `\n\n---\n### ⚠️ 质量门禁未通过\n${failedGates}`,
                status: "InFix",
                version: fresh.version,
              });
            }
            remaining.delete(taskId);
            blocked++;
          } else {
            // No gate report (gate service errored) → promote to Done anyway
            remaining.delete(taskId);
            completed++;
            await this.propagateContext(taskId);
          }
        } else {
          // Execution failed
          remaining.delete(taskId);
          blocked++;
        }
      }

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
