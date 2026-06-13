// ── Quality Gate Chain — post-execution review → simplify → learn ──
// Integrates the project's skill ecosystem (review-agent, self-improving-agent,
// auto-agent) into the swarm execution pipeline.
//
// Each task passes through up to 4 gates after the agent finishes:
//   GATE 1: Acceptance  — does output match criteria?
//   GATE 2: Review      — adversarial quality check (complex tasks)
//   GATE 3: Simplify    — detect redundant patterns
//   GATE 4: Learn       — record errors to .learnings/

import type { TaskNode } from "@agent-swarm/shared";
import { spawnClaudeOnce } from "./claude-spawn.js";

export interface GateResult {
  passed: boolean;
  gate: string;
  findings: string[];
  suggestion?: string;
}

export interface QualityReport {
  taskId: string;
  gates: GateResult[];
  overallPassed: boolean;
  summary: string;
}

async function quickAsk(prompt: string, model: string = "deepseek-v4-pro[1m]"): Promise<string> {
  const result = await spawnClaudeOnce({
    prompt,
    model,
    timeoutMs: 60_000,
    label: "quality-gate",
  });
  // Gates are advisory — on failure, return empty string (gate handles gracefully)
  return result.success ? result.output : "";
}

export class QualityGateService {

  /**
   * Run all applicable quality gates on a completed task.
   * Light tasks skip review/simplify. Complex tasks get all gates.
   */
  async runGates(task: TaskNode, output: string): Promise<QualityReport> {
    const gates: GateResult[] = [];
    const isComplex = (task.description?.length ?? 0) > 500;

    // ── GATE 1: Acceptance (always runs) ──────────────────────
    gates.push(await this.gateAcceptance(task, output));

    // ── GATE 2: Review (complex tasks only) ───────────────────
    if (isComplex && task.acceptance_criteria) {
      gates.push(await this.gateReview(task, output));
    }

    // ── GATE 3: Simplify (code tasks with >200 lines output) ──
    if (output.length > 2000) {
      gates.push(await this.gateSimplify(output));
    }

    // ── GATE 4: Learn (only if errors detected) ───────────────
    const hasErrors = gates.some(g => !g.passed);
    if (hasErrors) {
      gates.push(await this.gateLearn(task, gates));
    }

    const overallPassed = gates.every(g => g.passed);

    return {
      taskId: task.id,
      gates,
      overallPassed,
      summary: overallPassed
        ? `✅ ${task.title}: all ${gates.length} gates passed`
        : `⚠️ ${task.title}: ${gates.filter(g => !g.passed).length}/${gates.length} gates FAILED — ${gates.filter(g => !g.passed).map(g => g.gate).join(", ")}`,
    };
  }

  // ── GATE 1: Acceptance Check ────────────────────────────────

  private async gateAcceptance(task: TaskNode, output: string): Promise<GateResult> {
    if (!task.acceptance_criteria) {
      return { passed: true, gate: "acceptance", findings: [], suggestion: "无验收标准，自动通过" };
    }

    const prompt = `审查以下任务输出是否满足验收标准。仅回答 PASS 或 FAIL，并简短说明原因。

验收标准:
${task.acceptance_criteria}

执行输出:
${output.slice(-2000)}

判断:`;

    const verdict = await quickAsk(prompt);
    const passed = verdict.toUpperCase().includes("PASS") && !verdict.toUpperCase().includes("FAIL");

    return {
      passed,
      gate: "acceptance",
      findings: passed ? [] : [verdict.slice(0, 200)],
      suggestion: passed ? undefined : "请检查输出是否满足验收标准",
    };
  }

  // ── GATE 2: Review (adversarial quality check) ──────────────

  private async gateReview(task: TaskNode, output: string): Promise<GateResult> {
    const prompt = `作为代码审查师，持怀疑态度审查以下任务输出。找出:
1. 逻辑错误或遗漏
2. 性能问题
3. 安全隐患
4. 代码重复或冗余

如果无明显问题，回答 "PASS: 未发现重大问题"。
如果发现问题，回答 "FAIL: " 然后列出具体问题。

任务: ${task.title}
验收标准: ${task.acceptance_criteria ?? "无"}

输出:
${output.slice(-3000)}

审查结论:`;

    const verdict = await quickAsk(prompt, "deepseek-v4-pro[1m]");
    const passed = verdict.toUpperCase().includes("PASS") && !verdict.includes("FAIL:");

    return {
      passed,
      gate: "review",
      findings: passed ? [] : [verdict.slice(0, 500)],
      suggestion: passed ? undefined : "请根据审查意见修改",
    };
  }

  // ── GATE 3: Simplify Check ──────────────────────────────────

  private async gateSimplify(output: string): Promise<GateResult> {
    const prompt = `审查以下代码输出，找出可以简化的模式:
1. 重复的代码块
2. 过度复杂的逻辑
3. 可以合并的条件判断
4. 不必要的中间变量

如果代码简洁无明显问题，回答 "PASS: 代码已足够简洁"。
如果发现问题，回答 "FAIL: " 并指出具体位置。

输出:
${output.slice(-2000)}

分析:`;

    const verdict = await quickAsk(prompt);
    const passed = verdict.toUpperCase().includes("PASS") && !verdict.includes("FAIL:");

    return {
      passed,
      gate: "simplify",
      findings: passed ? [] : [verdict.slice(0, 300)],
      suggestion: passed ? undefined : "建议简化代码",
    };
  }

  // ── GATE 4: Learn from errors ───────────────────────────────

  private async gateLearn(task: TaskNode, priorGates: GateResult[]): Promise<GateResult> {
    const failures = priorGates.filter(g => !g.passed);
    const errorSummary = failures.map(g =>
      `[${g.gate}] ${g.findings.join("; ")}`
    ).join("\n");

    const prompt = `基于以下任务失败信息，提炼一条简短的学习规则（1-2句话）。
格式: "LEARN: <规则>" 然后 "APPLY: <何时应用>"

任务: ${task.title}
失败信息:
${errorSummary}

学习记录:`;

    const learnOutput = await quickAsk(prompt);

    // Also write to .learnings/ERRORS.md if the project has one
    try {
      const fs = await import("node:fs/promises");
      const learningPath = ".learnings/ERRORS.md";
      const entry = `\n### ${new Date().toISOString().slice(0, 10)} — ${task.title}\n${learnOutput}\n`;
      await fs.appendFile(learningPath, entry, "utf-8").catch(() => {});
    } catch {}

    return {
      passed: true, // learn gate never blocks
      gate: "learn",
      findings: [learnOutput.slice(0, 300)],
      suggestion: "已记录到 .learnings/ERRORS.md",
    };
  }
}
