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

// ── 3-Stage Pipeline: Role Classification ──────────────────
// Distinguishes Generator (code producer) from Evaluator (code reviewer)
// to automatically create downstream evaluation tasks.

/** Agent roles that produce code — their output must be evaluated */
const GENERATOR_ROLES = new Set([
  "backend-architect", "frontend-developer", "frontend-architect",
  "database-optimizer", "devops-automator", "ui-designer",
]);

/** Agent roles that evaluate code — they review/test Generator output */
const EVALUATOR_ROLES = new Set([
  "code-reviewer", "testing-qa", "security-engineer",
]);

/** Minimum complexity score to trigger the 3-stage pipeline */
const PIPELINE_COMPLEXITY_THRESHOLD = 3;

/** Evaluator task title prefixes for identification */
const EVAL_TITLE_PREFIX = "审查:";
const QA_TITLE_PREFIX = "验证:";

function isGeneratorRole(role: string): boolean {
  return GENERATOR_ROLES.has(role);
}

function isEvaluatorRole(role: string): boolean {
  return EVALUATOR_ROLES.has(role);
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
**输出语言：简体中文。** reasoning 用中文写，estimatedPhases 用中文。

{
  "score": <1-10>,
  "reasoning": "<为什么是这个分数，中文一句话>",
  "suggestedAgentCount": <建议几个agent并行>,
  "estimatedPhases": ["需要哪些阶段，中文描述，如: 前端UI、数据层、测试验证"]
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
**输出语言：简体中文。** 标题、描述、验收标准全部用中文写。

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
      "requiredCapabilities": ["frontend"],
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
  // 3.5️⃣  3-Stage Pipeline — Generator → Review → QA → Done
  // ═══════════════════════════════════════════════════════════

  /**
   * After a Generator task's spawn succeeds, create two downstream
   * evaluation tasks: code-review (reviewer) and testing-qa (QA).
   *
   * Dependency chain:
   *   Generator task (parent)
   *     ├──→ code-review task (assigned to code-reviewer)
   *     └──→ testing-qa task (assigned to testing-qa, depends on code-review)
   *
   * Both evaluation tasks include the Generator's execution output as context.
   *
   * @returns IDs of created evaluation tasks, or null if pipeline skipped
   */
  async createEvaluationTasks(
    generatorTask: TaskNode,
    agentRole: string,
    executionOutput: string,
    allAgents: AgentInstance[],
  ): Promise<{ reviewTaskId: string; qaTaskId: string } | null> {
    // Gate: skip pipeline for Planner/Evaluator roles or simple tasks
    if (!isGeneratorRole(agentRole)) {
      console.log(`[Pipeline] Skipping evaluation for ${agentRole} task "${generatorTask.title}" — not a Generator role`);
      return null;
    }

    // Gate: estimate complexity from description + execution output
    const complexityEstimate = this.estimateComplexity(
      (generatorTask.description || "") + "\n" + executionOutput,
      generatorTask.title
    );
    if (complexityEstimate < PIPELINE_COMPLEXITY_THRESHOLD) {
      console.log(`[Pipeline] Skipping evaluation for "${generatorTask.title}" — complexity ${complexityEstimate} < ${PIPELINE_COMPLEXITY_THRESHOLD}`);
      return null;
    }

    // Find code-reviewer agent (prefer idle)
    const reviewerAgent = this._findAgentByRole(allAgents, "code-reviewer");
    // Find testing-qa agent (prefer idle)
    const qaAgent = this._findAgentByRole(allAgents, "testing-qa");

    if (!reviewerAgent || !qaAgent) {
      console.warn(`[Pipeline] Cannot create evaluation tasks for "${generatorTask.title}" — missing evaluator agents (reviewer=${!!reviewerAgent}, qa=${!!qaAgent}). Will retry on next cycle.`);
      return null;
    }

    // Build evaluation context: parent task title + execution output
    const evalContext = this._buildEvalContext(generatorTask, executionOutput);

    // ── Create code-review task ──────────────────────────────
    const reviewTask = this.taskGraph.createTask({
      project_id: generatorTask.project_id,
      title: `${EVAL_TITLE_PREFIX} ${generatorTask.title}`,
      description: `## 评估任务: 代码审查\n\n`
        + `**审查对象:** ${generatorTask.title}\n\n`
        + `**审查标准:** 按四维评分矩阵独立验收 Generator 的产出。`
        + `每个发现必须附文件:行号 + 问题 + 修复建议。\n\n`
        + `---\n### 审查上下文 (Generator 的产出)\n${evalContext}`,
      priority: 1,
      required_capabilities: ["testing"],
      acceptance_criteria: `四维评分全部达标 (功能正确性 >= 4/5, 架构合规 >= 3/5, 代码质量 >= 3/5, 复用性 >= 3/5)。`
        + `找到至少一个可验证的具体问题或确认无问题（附证据）。`,
      max_retries: 2,
      parent_task_id: generatorTask.id,
    });

    // Assign code-reviewer agent to the review task
    const assignedReview = this.taskGraph.assignTask(reviewTask.id, reviewerAgent.id, reviewTask.version);
    if (!assignedReview) {
      console.warn(`[Pipeline] Failed to assign code-reviewer to review task for "${generatorTask.title}"`);
    }

    // ── Create testing-qa task (depends on code-review) ──────
    const qaTask = this.taskGraph.createTask({
      project_id: generatorTask.project_id,
      title: `${QA_TITLE_PREFIX} ${generatorTask.title}`,
      description: `## 评估任务: 端到端验证\n\n`
        + `**验证对象:** ${generatorTask.title}\n\n`
        + `**验证方法:** 按验收标准逐条验证功能正确性。`
        + `覆盖四类路径：正常 + 边界 + 异常 + 并发。`
        + `反橡皮图章三问：①代码真跑过？②找到至少一个问题？③有没有放水？\n\n`
        + `---\n### 验证上下文 (Generator 的产出 + 审查结果)\n${evalContext}`,
      priority: 2,
      required_capabilities: ["testing"],
      acceptance_criteria: `每条验收标准至少有对应的测试用例和 PASS/FAIL 结论。`
        + `发现至少一个可验证的结果或确认通过（附证据）。`,
      max_retries: 2,
      parent_task_id: generatorTask.id,
    });

    // Assign testing-qa agent to the QA task
    const assignedQa = this.taskGraph.assignTask(qaTask.id, qaAgent.id, qaTask.version);
    if (!assignedQa) {
      console.warn(`[Pipeline] Failed to assign testing-qa to QA task for "${generatorTask.title}"`);
    }

    // ── Set dependency: QA task depends on review task ──
    this.taskGraph.addDependencies(qaTask.id, [reviewTask.id]);

    console.log(`[Pipeline] Created evaluation tasks for "${generatorTask.title}":`);
    console.log(`  - Review:  ${reviewTask.id.slice(0, 8)} → code-reviewer (${reviewerAgent.name})`);
    console.log(`  - QA:      ${qaTask.id.slice(0, 8)} → testing-qa (${qaAgent.name}) [depends on review]`);

    return { reviewTaskId: reviewTask.id, qaTaskId: qaTask.id };
  }

  /**
   * Check if all evaluation tasks for a Generator task are Done.
   * If both review + QA pass → promote parent Generator to Done.
   * If any evaluation fails → promote parent Generator to InFix.
   *
   * Called after any task completes (may be an evaluation task).
   */
  async checkAndCompleteGeneratorTask(taskId: string): Promise<boolean> {
    const task = this.taskGraph.getTask(taskId);
    if (!task) return false;

    // Only Generator tasks can be auto-completed by evaluations
    const agent = await this._getAgentById(task.owner_agent_id);
    const role = agent?.role ?? "";
    if (!isGeneratorRole(role)) return false;

    // Find child evaluation tasks
    const children = this.taskGraph.getChildrenByParent(taskId);
    if (children.length === 0) return false; // No evaluations created yet

    // Check status of all children
    const allDone = children.every(c => c.status === "Done");
    const anyFailed = children.some(c => c.status === "InFix" || c.status === "Blocked");

    if (anyFailed) {
      // Evaluation failed → Generator goes to InFix
      const fresh = this.taskGraph.getTask(taskId);
      if (fresh && fresh.status !== "Done" && fresh.status !== "InFix") {
        const failedChildren = children
          .filter(c => c.status === "InFix" || c.status === "Blocked")
          .map(c => `  - ${c.title} (${c.status}): ${c.error_message ?? "无错误信息"}`)
          .join("\n");
        this.taskGraph.updateTask(taskId, {
          description: (task.description || "") + `\n\n---\n### ⚠️ 评估未通过\n${failedChildren}`,
          status: "InFix",
          version: fresh.version,
        });
        console.log(`[Pipeline] Generator "${task.title}" → InFix (evaluation failed)`);
        return true;
      }
      return true;
    }

    if (allDone) {
      // All evaluations passed → promote Generator to Done
      const fresh = this.taskGraph.getTask(taskId);
      if (fresh && fresh.status !== "Done") {
        const childSummary = children
          .map(c => `  - ✅ ${c.title}`)
          .join("\n");
        this.taskGraph.updateTask(taskId, {
          description: (task.description || "") + `\n\n---\n### ✅ 3-Stage Pipeline 通过\n${childSummary}`,
          status: "Done",
          version: fresh.version,
        });
        console.log(`[Pipeline] Generator "${task.title}" → Done (all evaluations passed)`);
        await this.propagateContext(taskId);
        return true;
      }
      return true;
    }

    // Some children still in progress (Backlog/InDev/ReadyForTest)
    return false;
  }

  /** Find an agent by role, preferring idle agents. */
  private _findAgentByRole(agents: AgentInstance[], role: string): AgentInstance | null {
    // Prefer idle agents
    const idle = agents.find(a => a.role === role && a.status === "idle");
    if (idle) return idle;
    // Fall back to any agent with that role (busy agents may be re-used)
    return agents.find(a => a.role === role) ?? null;
  }

  /** Create a Sprint Contract task for high-complexity projects.
   *  Assigns to product-manager (preferred) or software-architect.
   *  The Planner produces requirements/architecture docs that downstream tasks consume. */
  private _createPlannerTask(
    projectId: string, title: string, description: string, complexity: ComplexityReport
  ): string | null {
    const task = this.taskGraph.createTask({
      project_id: projectId,
      title: `Sprint Contract: ${title}`,
      description: `作为 Planner，分析以下需求并输出 Sprint Contract:\n\n${description}\n\n复杂度: ${complexity.score}/10\n阶段: ${complexity.estimatedPhases.join(", ")}\n\n输出格式:\n## 需求分析\n## 架构方案\n## 接口契约\n## 任务拆解确认`,
      priority: 0,
      required_capabilities: ["architecture"],
      acceptance_criteria: "Sprint Contract 通过编排官审查，下游任务可据此执行",
      max_retries: 2,
    });
    console.log(`[Planner] Created Sprint Contract task ${task.id.slice(0, 8)} for "${title}"`);
    return task.id;
  }

  /** Get a single agent by ID from the database. */
  private async _getAgentById(agentId: string | null): Promise<AgentInstance | null> {
    if (!agentId) return null;
    const { getDb } = await import("../db/connection.js");
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM agents WHERE id = ?");
    stmt.bind([agentId]);
    let agent: AgentInstance | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      agent = {
        id: row.id, project_id: row.project_id, name: row.name, role: row.role,
        runtime: row.runtime, model: row.model, status: row.status,
        worktree_path: row.worktree_path, current_task_id: row.current_task_id,
        capabilities: JSON.parse(row.capabilities || "[]"),
        last_heartbeat: row.last_heartbeat, permission_mode: row.permission_mode,
        pid: row.pid, created_at: row.created_at,
      };
    }
    stmt.free();
    return agent;
  }

  /** Build evaluation context from the Generator task's output. */
  private _buildEvalContext(generatorTask: TaskNode, executionOutput: string): string {
    const parts: string[] = [];
    parts.push(`**父任务:** ${generatorTask.title}`);
    if (generatorTask.acceptance_criteria) {
      parts.push(`**验收标准:** ${generatorTask.acceptance_criteria}`);
    }
    parts.push(`**执行输出 (摘要):** ${executionOutput.slice(0, 4000)}`);
    return parts.join("\n\n");
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

    // Step 3: Create planner task (Sprint Contract) for high-complexity tasks
    let plannerTaskId: string | null = null;
    if (complexity.score >= 7) {
      plannerTaskId = this._createPlannerTask(projectId, title, description, complexity);
      if (plannerTaskId) {
        console.log(`[orchestrate] Created Planner task for "${title}" (score=${complexity.score})`);
      }
    }

    // Step 4: Create all sub-tasks in TaskGraph with DAG dependencies
    const taskIds: string[] = [];
    const idMap = new Map<number, string>(); // index -> taskId

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

    // If planner task exists, all implementation tasks depend on it
    if (plannerTaskId) {
      for (const tid of taskIds) {
        this.taskGraph.addDependencies(tid, [plannerTaskId]);
      }
    }

    // Set up AI-decomposed dependencies
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

    const allTaskIds = plannerTaskId ? [plannerTaskId, ...taskIds] : taskIds;
    return { complexity, decomposition, taskIds: allTaskIds };
  }

  /** Like orchestrate() but reuses a pre-computed complexity to skip re-analysis */
  private async _orchestrateWithComplexity(
    projectId: string, title: string, description: string, complexity: ComplexityReport
  ): Promise<{ complexity: ComplexityReport; decomposition: DecompositionResult; taskIds: string[] }> {
    const decomposition = await this.decomposeTask(title, description, complexity);
    const taskIds: string[] = [];
    const idMap = new Map<number, string>();
    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const st = decomposition.subTasks[i]!;
      const task = this.taskGraph.createTask({
        project_id: projectId, title: st.title, description: st.description,
        priority: i === 0 ? 0 : 1,
        required_capabilities: st.requiredCapabilities,
        acceptance_criteria: st.acceptanceCriteria, max_retries: 3,
      });
      taskIds.push(task.id);
      idMap.set(i, task.id);
    }
    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const st = decomposition.subTasks[i]!;
      if (st.dependsOn.length > 0) {
        const depIds = st.dependsOn.map(idx => idMap.get(idx)).filter((id): id is string => id !== undefined);
        if (depIds.length > 0) {
          const tId = idMap.get(i);
          if (tId) this.taskGraph.addDependencies(tId, depIds);
        }
      }
    }
    // Evaluation tasks created dynamically after Generator execution (see autoExecute loop).
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
    projectId: string, title: string, description: string,
    precomputedComplexity?: ComplexityReport
  ): Promise<{
    complexity: ComplexityReport;
    decomposition: DecompositionResult;
    taskIds: string[];
    completed: number;
    blocked: number;
  }> {
    // Step 1-3: orchestrate — skip re-analysis if complexity already computed
    const plan = precomputedComplexity
      ? await this._orchestrateWithComplexity(projectId, title, description, precomputedComplexity)
      : await this.orchestrate(projectId, title, description);

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
    let idleLoops = 0;
    const MAX_IDLE_LOOPS = 30; // 30 * 2s = 60s max wait

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
        idleLoops++;
        if (idleLoops >= MAX_IDLE_LOOPS) {
          // Deadlock detection: tasks stuck in non-InDev states
          const stuck = [...remaining].map(id => {
            const t = this.taskGraph.getTask(id);
            return t ? `${t.title.slice(0,30)}(${t.status})` : `${id}(gone)`;
          });
          console.error(`[autoExecute] Deadlock after ${idleLoops} idle loops. Stuck tasks: ${stuck.join(", ")}`);
          for (const id of remaining) {
            const t = this.taskGraph.getTask(id);
            if (t && t.status === "Backlog") {
              // Re-attempt assignment for stuck backlog tasks
              const agent = this.selectBestAgent(allAgents, t.required_capabilities, projectId);
              if (agent) this.taskGraph.assignTask(id, agent, t.version);
            }
          }
          idleLoops = 0; // reset counter after recovery attempt
        }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      idleLoops = 0; // reset on activity

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

      // Process results — 3-Stage Pipeline routing
      for (let i = 0; i < ready.length; i++) {
        const taskId = ready[i]!;
        const result = results[i];

        if (result?.status === "fulfilled" && result.value.success) {
          const task = this.taskGraph.getTask(taskId);
          if (!task) continue;

          const agent = task?.owner_agent_id ? agentMap.get(task.owner_agent_id) : undefined;
          const role = agent?.role ?? "";

          // ── 3-Stage Pipeline: Generator → Evaluator(s) → Done ──
          if (isGeneratorRole(role)) {
            // Generator finished writing code → create evaluation tasks
            // Override ReadyForTest (set by executeTask) back to InDev — generator
            // stays InDev until both code-review and testing-qa pass.
            const fresh = this.taskGraph.getTask(taskId);
            if (fresh && fresh.status !== "InDev" && fresh.status !== "Done") {
              this.taskGraph.updateTask(taskId, {
                status: "InDev",
                version: fresh.version,
              });
            }

            const evalResult = await this.createEvaluationTasks(
              task, role, result.value.output, allAgents
            );

            if (evalResult) {
              // Add evaluation tasks to the execution loop
              remaining.add(evalResult.reviewTaskId);
              remaining.add(evalResult.qaTaskId);
              // Refresh agentMap with evaluator agents (they may have been picked up)
              const reviewAgent = this._findAgentByRole(allAgents, "code-reviewer");
              const qaAgent = this._findAgentByRole(allAgents, "testing-qa");
              if (reviewAgent) agentMap.set(reviewAgent.id, reviewAgent);
              if (qaAgent) agentMap.set(qaAgent.id, qaAgent);
              // Generator stays in remaining — polled every cycle until evaluations pass
              console.log(`[Pipeline] Generator "${task.title}" awaiting evaluation (2 evaluators dispatched)`);
            } else {
              // No evaluators available or complexity too low → fallback to quality gate
              console.log(`[Pipeline] Evaluation skipped for "${task.title}" — falling back to quality gate`);
              const gateReport = await qualityGate.runGates(task, result.value.output).catch(() => null);
              if (gateReport?.overallPassed) {
                const f = this.taskGraph.getTask(taskId);
                if (f) this.taskGraph.updateTask(taskId, { status: "Done", version: f.version });
                remaining.delete(taskId);
                completed++;
                await this.propagateContext(taskId);
              } else {
                remaining.delete(taskId);
                blocked++;
              }
            }
          } else if (isEvaluatorRole(role)) {
            // Evaluator finished reviewing/testing → quality gate, then check parent
            const gateReport = await qualityGate.runGates(task, result.value.output).catch(() => null);

            if (gateReport?.overallPassed) {
              console.log(`[QualityGate] ${gateReport.summary}`);
              const fresh = this.taskGraph.getTask(taskId);
              if (fresh) {
                this.taskGraph.updateTask(taskId, { status: "Done", version: fresh.version });
              }
              remaining.delete(taskId);
              completed++;
              await this.propagateContext(taskId);

              // Check if parent Generator can now be completed
              if (task.parent_task_id) {
                const parentPromoted = await this.checkAndCompleteGeneratorTask(task.parent_task_id);
                if (parentPromoted) {
                  remaining.delete(task.parent_task_id);
                  completed++;
                }
              }
            } else if (gateReport) {
              // Evaluation failed → move evaluator to InFix
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

              // Cascade: evaluator failed → reassign (goes back to Backlog via failTask if retries remain)
              // Also check parent — if this eval is permanently blocked, parent goes to InFix
              if (task.parent_task_id) {
                await this.checkAndCompleteGeneratorTask(task.parent_task_id);
                // Parent may now be InFix — remove from remaining if so
                const parent = this.taskGraph.getTask(task.parent_task_id);
                if (parent && (parent.status === "InFix" || parent.status === "Blocked" || parent.status === "Done")) {
                  remaining.delete(task.parent_task_id);
                  if (parent.status === "Done") completed++;
                  else blocked++;
                }
              }
            } else {
              // No gate report → promote to Done anyway
              const fresh = this.taskGraph.getTask(taskId);
              if (fresh) {
                this.taskGraph.updateTask(taskId, { status: "Done", version: fresh.version });
              }
              remaining.delete(taskId);
              completed++;
              await this.propagateContext(taskId);

              if (task.parent_task_id) {
                const parentPromoted = await this.checkAndCompleteGeneratorTask(task.parent_task_id);
                if (parentPromoted) {
                  remaining.delete(task.parent_task_id);
                  completed++;
                }
              }
            }
          } else {
            // Planner / unknown role → legacy quality gate path
            const gateReport = await qualityGate.runGates(task, result.value.output).catch(() => null);

            if (gateReport?.overallPassed) {
              console.log(`[QualityGate] ${gateReport.summary}`);
              const fresh = this.taskGraph.getTask(taskId);
              if (fresh) {
                this.taskGraph.updateTask(taskId, { status: "Done", version: fresh.version });
              }
              remaining.delete(taskId);
              completed++;
              await this.propagateContext(taskId);
            } else if (gateReport) {
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
              remaining.delete(taskId);
              completed++;
              await this.propagateContext(taskId);
            }
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
