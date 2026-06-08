// ── Claude Code CLI Provider (fallback) ───────────────────
// Uses child_process.spawn('claude', ['-p', '--output-format', 'stream-json'])

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentProvider, ExecuteOpts, ProviderAvailability } from "./types.js";

export const claudeCliProvider: AgentProvider = {
  name: "claude-cli",
  label: "Claude Code (CLI)",

  async checkAvailability(): Promise<ProviderAvailability> {
    return new Promise((resolve) => {
      const proc = spawn("claude", ["--version"], { timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      proc.on("error", () => resolve({ status: "unavailable", detail: "claude CLI not found" }));
      proc.on("exit", (code) => {
        if (code === 0) resolve({ status: "ready" });
        else resolve({ status: "unavailable", detail: `claude exit code: ${code}` });
      });
      setTimeout(() => { proc.kill(); resolve({ status: "unavailable", detail: "timeout" }); }, 5000);
    });
  },

  async execute(opts: ExecuteOpts) {
    const args = ["-p", "--output-format", "stream-json"];
    if (opts.model) args.push("--model", opts.model);
    if (opts.sessionId) args.push("--resume", opts.sessionId);

    const proc = spawn("claude", args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = createInterface({ input: proc.stdout });
    let aborted = false;

    const events = (async function* () {
      // Write prompt to stdin then close
      proc.stdin.write(opts.prompt);
      proc.stdin.end();

      for await (const line of stdout) {
        if (aborted) break;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "assistant") {
            yield { type: "assistant" as const, content: msg.message?.content?.[0]?.text ?? "" };
          } else if (msg.type === "result") {
            yield { type: "completed" as const, stopReason: msg.subtype ?? "end_turn" };
            break;
          } else if (msg.type === "error") {
            yield { type: "error" as const, message: msg.error ?? "CLI error" };
          }
        } catch { /* skip malformed lines */ }
      }

      // Capture stderr for errors
      let stderr = "";
      proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      await new Promise<void>((resolve) => {
        proc.on("exit", (code) => {
          if (code !== 0 && stderr && !aborted) {
            // Error already yielded via stream
          }
          resolve();
        });
      });
    })();

    return {
      events,
      abort: async () => {
        aborted = true;
        proc.kill("SIGTERM");
      },
      send: async (_message: string) => {
        // Not supported in CLI -p mode
      },
    };
  },
};
