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
import { getDb } from "../db/connection.js";

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

async function quickAsk(prompt: string, model: string = "deepseek-v4-flash"): Promise<string> {
  const result = await spawnClaudeOnce({
    prompt,
    model,
    timeoutMs: 60_000,
    label: "quality-gate",
  });
  // Gates are advisory — on failure, return empty string (gate handles gracefully)
  return result.success ? result.output : "";
}

// ═══════════════════════════════════════════════════════════════
// ── Disk change detection: ground truth for file modifications ──
// ═══════════════════════════════════════════════════════════════

/** Source file extensions that agents should modify */
const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".less",
  ".html", ".htm", ".vue", ".svelte",
  ".json", ".yaml", ".yml", ".toml",
  ".py", ".rs", ".go", ".java", ".cs",
  ".md", ".mdx",
]);

/**
 * Walk project directory (max 3 levels, skip node_modules/.git/dist etc.)
 * Returns true if any source file was modified more recently than sinceMs ago.
 */
async function hasRecentDiskChanges(projectCwd: string, sinceMs: number = 10 * 60 * 1000): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const cutoff = Date.now() - sinceMs;
    const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__",
      "Library", "Temp", "Obj", "bin", "obj", ".trash", ".bak"]);

    async function walk(dir: string, depth: number): Promise<boolean> {
      if (depth > 3) return false;
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch { return false; }
      for (const entry of entries) {
        if (skipDirs.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (await walk(full, depth + 1)) return true;
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SOURCE_EXTS.has(ext)) {
            try {
              const stat = await fs.stat(full);
              if (stat.mtimeMs > cutoff) return true;
            } catch {}
          }
        }
      }
      return false;
    }
    return await walk(projectCwd, 0);
  } catch {
    return false; // fallback to text heuristics on error
  }
}

/** Resolve project working directory from task's project_id */
function resolveProjectCwd(projectId?: string): string | null {
  if (!projectId) return null;
  try {
    const db = getDb();
    const stmt = db.prepare("SELECT path FROM projects WHERE id = ?");
    stmt.bind([projectId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as { path: string };
      stmt.free();
      return row.path || null;
    }
    stmt.free();
  } catch {}
  return null;
}

export class QualityGateService {

  /**
   * Run all applicable quality gates on a completed task.
   * Light tasks skip review/simplify. Complex tasks get all gates.
   */
  async runGates(task: TaskNode, output: string): Promise<QualityReport> {
    const gates: GateResult[] = [];
    const isComplex = (task.description?.length ?? 0) > 500;
    const hasRetried = (task.retry_count ?? 0) > 0;
    const isEvaluatorTask = task.title.startsWith("审查:") || task.title.startsWith("Review:") || task.title.startsWith("验证:") || task.title.startsWith("Security Review:");
    const isTrivial = output.length < 500 && !isComplex;

    // ── COST SAVING: Skip gate spawns for evaluator tasks and trivial tasks ──
    if (isTrivial && hasRetried) {
      return { taskId: task.id, gates: [{ passed: true, gate: "acceptance", findings: [], suggestion: "简单已重试任务，自动通过" }], overallPassed: true, summary: "skip: trivial retried" };
    }
    if (isEvaluatorTask) {
      return { taskId: task.id, gates: [{ passed: true, gate: "acceptance", findings: [], suggestion: "评估任务，跳过质量门禁" }], overallPassed: true, summary: "skip: evaluator task" };
    }

    // ═══════════════════════════════════════════════════════════════
    // ── GATE 0: File change hard check (before all AI gates) ──
    // ═══════════════════════════════════════════════════════════════
    //
    // Two-tier detection for the "分析→FAIL→重试→分析→FAIL" dead loop:
    //
    //   TIER A: Short output (< 2000 chars) + no tool evidence → immediate FAIL
    //           Catches: empty/sparse output, brief analysis without code
    //
    //   TIER B: Any length + no tool evidence → check DISK for real changes
    //           Catches: long analysis text that describes but doesn't apply changes
    //           (e.g., 2995 chars of code descriptions with 0 actual file modifications)
    //
    // Raison d'être: Text heuristics alone are unreliable — an agent can produce
    // thousands of chars describing code changes without actually modifying files.
    // Disk evidence (file mtimes) is the only ground truth.
    const isGeneratorTask = !isEvaluatorTask && !task.title.startsWith("📋 Contract:");
    const hasToolEvidence = /Edit|Write|Bash|改动文件|修改.*文件|git diff|创建.*文件|tsc --noEmit|npm run|编译通过|验证通过|cat\s|mkdir|touch|cp\s|mv\s/.test(output);
    const outputTooShort = output.length < 2000; // raised from 500 — analysis-only often 1000-3000 chars

    if (isGeneratorTask && !hasToolEvidence) {
      // ── TIER A: Short output with no tool evidence → instant fail ──
      if (outputTooShort) {
        if (hasRetried) {
          return {
            taskId: task.id,
            gates: [{
              passed: false,
              gate: "acceptance",
              findings: [`重试${task.retry_count}次仍无文件变更——Agent未调用Edit/Write/Bash工具，0文件修改。`],
              suggestion: "Agent反复输出分析文字但不修改代码，已达重试上限。需人工检查任务描述是否明确要求了文件操作。",
            }],
            overallPassed: false,
            summary: `❌ ${task.title}: 0 file changes after ${task.retry_count} retries — PERMANENTLY BLOCKED`,
          };
        }
        return {
          taskId: task.id,
          gates: [{
            passed: false,
            gate: "acceptance",
            findings: ["Agent未调用Edit/Write/Bash工具，0文件变更。输出<2000字且无工具调用证据。"],
            suggestion: "必须用Edit/Write/Bash在目标项目中实际创建或修改代码文件。不能只输出文字分析替代。",
          }],
          overallPassed: false,
          summary: `❌ ${task.title}: 0 file changes — output < 2000 chars, no tool evidence`,
        };
      }

      // ── TIER B: Long output but no tool evidence → verify disk ──
      const projectCwd = resolveProjectCwd(task.project_id);
      if (projectCwd) {
        const diskChanged = await hasRecentDiskChanges(projectCwd);
        if (!diskChanged) {
          // Output is long enough to pass Tier A, but zero files actually modified on disk
          if (hasRetried) {
            return {
              taskId: task.id,
              gates: [{
                passed: false,
                gate: "acceptance",
                findings: [`重试${task.retry_count}次——磁盘检测：项目目录中0个文件被修改。Agent输出了${output.length}字分析但未实际修改任何代码。`],
                suggestion: "Agent反复分析但不修改文件，已达重试上限。BLOCKED。",
              }],
              overallPassed: false,
              summary: `❌ ${task.title}: 0 disk changes after ${task.retry_count} retries — PERMANENTLY BLOCKED`,
            };
          }
          return {
            taskId: task.id,
            gates: [{
              passed: false,
              gate: "acceptance",
              findings: [`磁盘检测失败：项目目录中0个源文件被修改。Agent输出了${output.length}字内容但未实际写入任何代码文件。`],
              suggestion: "必须用Edit/Write/Bash实际修改代码文件。磁盘上的文件变更才是交付物，文字分析不是。",
            }],
            overallPassed: false,
            summary: `❌ ${task.title}: ${output.length} chars output but 0 files changed on disk — analysis without code`,
          };
        }
        // Disk has recent changes — agent DID modify files even if tool evidence regex missed it
        console.log(`[QualityGate] GATE 0 PASS (disk): ${task.title.slice(0,40)} — files modified on disk despite no regex tool evidence`);
      }
    }

    // ── GATE 1: Acceptance (always runs, auto-pass after 1 retry) ──
    if (hasRetried) {
      gates.push({ passed: true, gate: "acceptance", findings: [], suggestion: `已重试 ${task.retry_count} 次，自动通过验收` });
    } else if (isTrivial) {
      // Trivial task — inline check instead of Claude Code spawn
      const passed = output.length > 0 && !output.includes("[stderr]");
      gates.push({ passed, gate: "acceptance", findings: passed ? [] : ["输出为空或含错误"], suggestion: passed ? undefined : "请检查执行输出" });
    } else {
      gates.push(await this.gateAcceptance(task, output));
    }

    // ── GATE 2: Review (complex tasks only, skip after retry) ──
    if (isComplex && task.acceptance_criteria && !hasRetried) {
      gates.push(await this.gateReview(task, output));
    }

    // ── GATE 3: Simplify (code tasks with >2000 chars output, skip after retry) ──
    if (output.length > 2000 && !hasRetried) {
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

    const verdict = await quickAsk(prompt);
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
