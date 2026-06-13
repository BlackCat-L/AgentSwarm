// ── Claude Code Spawn Diagnostics ──────────────────────────
// Unified spawn logic with exit-code decoding, retry, and pre-flight checks.
// Replaces scattered spawn calls in execution-service, orchestrator, and quality-gate.
//
// Exit code 4294967295 (0xFFFFFFFF, signed -1) on Windows = process crashed before
// producing output. Common causes:
//   - API key missing / invalid (ANTHROPIC_AUTH_TOKEN)
//   - API base URL unreachable (ANTHROPIC_BASE_URL)
//   - Model name not recognized by the API
//   - Binary blocked by antivirus
//   - Out of memory / system resource exhaustion
//   - Too many concurrent Claude Code processes (rate limit)

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";

// ── Binary resolution ──────────────────────────────────────

export function resolveClaudeBin(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || "";
    return [appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"].join("\\");
  }
  return "claude";
}

export function claudeBinAvailable(): boolean {
  if (process.platform !== "win32") return true;
  return existsSync(resolveClaudeBin());
}

// ── Exit code decoder ──────────────────────────────────────

export function decodeExitCode(code: number): string {
  // Windows: 4294967295 = 0xFFFFFFFF = -1 (signed int32)
  if (code === 4294967295 || code === -1) {
    // Try to diagnose
    if (!claudeBinAvailable()) {
      return "Claude Code binary not found — run `npm install -g @anthropic-ai/claude-code`";
    }
    const token = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!token || token.length < 10) {
      return "ANTHROPIC_AUTH_TOKEN missing or invalid — check your API key";
    }
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (baseUrl && !baseUrl.startsWith("http")) {
      return `ANTHROPIC_BASE_URL malformed: "${baseUrl}" — must start with https://`;
    }
    return "Claude Code crashed on startup — possible causes: API unreachable, model not found, or antivirus blocking";
  }
  if (code === 1) return "General error (exit 1) — check Claude Code output for details";
  if (code === 137 || code === 143) return `Process killed by signal (${code}) — possible OOM or manual kill`;
  return `Exit code ${code}`;
}

// ── Spawn config ───────────────────────────────────────────

export interface SpawnConfig {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  label?: string; // for log prefix
  cwd?: string;   // working directory for Claude Code (target project root)
}

export interface SpawnResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

// ── Core spawn with diagnostics ────────────────────────────

export async function spawnClaudeOnce(
  config: SpawnConfig
): Promise<SpawnResult> {
  const { prompt, model = "deepseek-v4-pro[1m]", timeoutMs = 120_000, cwd } = config;

  // Pre-flight checks
  if (!claudeBinAvailable()) {
    return { success: false, output: "", error: `Claude Code binary not found at ${resolveClaudeBin()}` };
  }

  // Strip ANTHROPIC_MODEL overrides so --model flag reaches the actual provider
  const execEnv = { ...process.env };
  delete execEnv.ANTHROPIC_MODEL;
  delete execEnv.ANTHROPIC_SMALL_FAST_MODEL;

  const bin = resolveClaudeBin();
  const outputLines: string[] = [];
  let spawnError: Error | null = null;

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let proc: ChildProcess;
    try {
      proc = spawn(bin, ["-p", "--output-format", "stream-json", "--verbose", "--model", model], {
        env: execEnv,
        stdio: ["pipe", "pipe", "pipe"],
        cwd: cwd || process.cwd(),
      });
    } catch (err: any) {
      done({ success: false, output: "", error: `spawn(${bin}) failed: ${err.message}` });
      return;
    }

    const rl = createInterface({ input: proc.stdout! });
    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      // If stderr contains npm errors, capture them
      if (text.includes("npm error") || text.includes("ENOENT")) {
        outputLines.push(`[stderr] ${text.trim()}`);
      }
      proc.stdout!.emit("data", chunk);
    });

    rl.on("line", (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "assistant") {
          const text = (msg.message?.content ?? [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
          if (text) outputLines.push(text);
        } else if (msg.type === "result") {
          done({
            success: msg.subtype === "success",
            output: outputLines.join("\n"),
            error: msg.subtype !== "success" ? "Task execution failed" : undefined,
          });
        }
      } catch {
        if (line.trim()) outputLines.push(line);
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      spawnError = err;
      done({
        success: false,
        output: outputLines.join("\n"),
        error: `Spawn error: ${err.code} — ${err.message}`,
      });
    });

    proc.on("exit", (code: number | null) => {
      if (settled) return;
      const exitCode = code ?? -1;
      if (exitCode === 0 && outputLines.length > 0) {
        // Process exited cleanly with output (JSON lines parsed above)
        // result event should have fired; if we're here it means no "result" type
        done({ success: true, output: outputLines.join("\n") });
      } else {
        const detail = decodeExitCode(exitCode);
        const context = spawnError ? ` | spawn: ${spawnError.message}` : "";
        const lastLine = outputLines.length > 0 ? outputLines[outputLines.length - 1] : "";
        const snippet = lastLine ? ` | last output: ${lastLine.slice(0, 200)}` : "";
        done({
          success: false,
          exitCode,
          output: outputLines.join("\n"),
          error: `${detail}${context}${snippet}`,
        });
      }
    });

    // Write prompt
    if (proc.stdin) {
      proc.stdin.end(Buffer.from(prompt, "utf-8"));
    } else {
      done({ success: false, output: "", error: "Process stdin unavailable — binary may have failed to start" });
    }

    // Timeout
    setTimeout(() => {
      if (!settled) {
        proc.kill("SIGTERM");
        done({ success: false, output: outputLines.join("\n"), error: `Timeout after ${timeoutMs}ms` });
      }
    }, timeoutMs);
  });
}

// ── Retry wrapper ──────────────────────────────────────────

export async function spawnClaudeWithRetry(
  config: SpawnConfig,
  maxRetries: number = 2
): Promise<SpawnResult> {
  let lastResult: SpawnResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000); // 2s, 4s, 8s...
      await new Promise(r => setTimeout(r, delay));
    }

    const result = await spawnClaudeOnce(config);
    if (result.success) return result;

    // Don't retry configuration errors
    if (result.error?.includes("binary not found") || result.error?.includes("API key")) {
      return result;
    }

    lastResult = result;
  }

  return {
    ...lastResult!,
    error: `${lastResult!.error} (retried ${maxRetries} times)`,
  };
}
