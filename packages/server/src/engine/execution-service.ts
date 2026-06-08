// ── Execution Service — task → Claude Code → output ───────

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { TaskGraph } from "./task-graph.js";
import { eventBus } from "../sse/event-bus.js";
import type { TaskNode } from "@agent-swarm/shared";

interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

export class ExecutionService {
  private active = new Map<string, ReturnType<typeof spawn>>();

  constructor(private graph: TaskGraph) {}

  isRunning(taskId: string): boolean { return this.active.has(taskId); }
  get activeCount(): number { return this.active.size; }

  async executeTask(taskId: string, model: string = "haiku"): Promise<ExecutionResult> {
    const task = this.graph.getTask(taskId);
    if (!task) throw new Error("任务不存在");
    if (task.status !== "InDev") throw new Error(`任务状态为 ${task.status}，需要先分配到Agent`);

    const outputLines: string[] = [];

    const proc = spawn("claude", ["-p", "--output-format", "stream-json", "--verbose", "--model", model], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    this.active.set(taskId, proc);

    // Read both stdout and stderr for JSON stream-json messages
    const combined = proc.stdout!;
    // Also merge stderr
    proc.stderr!.on("data", (chunk: Buffer) => {
      combined.emit("data", chunk);
    });

    const rl = createInterface({ input: combined });

    const promise = new Promise<ExecutionResult>((resolve, reject) => {
      rl.on("line", (line: string) => {
        try {
          const msg = JSON.parse(line);
          if (msg.type === "assistant") {
            const text = (msg.message?.content ?? [])
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("\n");
            if (text) {
              outputLines.push(text);
              eventBus.publish(task.project_id, "agent-output", {
                agentId: task.owner_agent_id, taskId, content: text,
                stream: "stdout", timestamp: new Date().toISOString(),
              });
            }
          } else if (msg.type === "result") {
            this.active.delete(taskId);
            const result: ExecutionResult = {
              success: msg.subtype === "success",
              output: outputLines.join("\n"),
              error: msg.subtype !== "success" ? "执行失败" : undefined,
            };
            if (result.success) { this._lastOutput = result.output; this._autoComplete(task); }
            else this.graph.failTask(taskId, result.error ?? "Agent 执行失败");
            rl.close();
            resolve(result);
          }
        } catch {
          if (line.trim()) outputLines.push(line);
        }
      });

      proc.on("error", (err) => { this.active.delete(taskId); reject(err); });
      proc.on("exit", (code) => {
        this.active.delete(taskId);
        if (code !== 0 && outputLines.length === 0) reject(new Error(`Claude Code exited ${code}`));
      });

      setTimeout(() => {
        if (this.active.has(taskId)) { proc.kill("SIGTERM"); this.active.delete(taskId); reject(new Error("Timeout")); }
      }, 30 * 60 * 1000);
    });

    // Write prompt to stdin
    const prompt = this._buildPrompt(task);
    proc.stdin!.write(prompt);
    proc.stdin!.end();

    return promise;
  }

  cancelTask(taskId: string): boolean {
    const p = this.active.get(taskId);
    if (!p) return false;
    p.kill("SIGTERM");
    this.active.delete(taskId);
    return true;
  }

  private _buildPrompt(task: TaskNode): string {
    const p: string[] = [
      `你是一个软件工程师。完成以下任务。完成后简要总结。`,
      ``,
      `## 任务`,
      task.title,
      ``,
    ];
    if (task.description) p.push(`## 描述`, task.description, ``);
    if (task.acceptance_criteria) p.push(`## 验收标准`, task.acceptance_criteria, ``);
    return p.join("\n");
  }

  private _autoComplete(task: TaskNode): void {
    // First update description with the captured output
    const output = this._lastOutput ?? "";
    const fresh = this.graph.getTask(task.id);
    if (fresh) {
      this.graph.updateTask(task.id, {
        description: (task.description || "") + "\n\n---\n### 执行结果\n" + output,
        version: fresh.version,
      });
    }
    // Then transition through statuses
    const path = ["ReadyForTest", "ReadyForDeploy", "Done"] as const;
    for (const status of path) {
      const cur = this.graph.getTask(task.id);
      if (!cur) return;
      this.graph.updateTask(task.id, { status, version: cur.version });
    }
    eventBus.publish(task.project_id, "task-update", {
      taskId: task.id, status: "Done", completedAt: new Date().toISOString(),
    });
  }
  private _lastOutput: string = "";
}
