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
  useInteractive?: boolean; // true = interactive mode (tools available), false/undefined = -p print mode
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
  const { prompt, model = "deepseek-v4-pro[1m]", timeoutMs = 120_000, label, cwd } = config;
  const logPrefix = label ? `[spawn:${label}]` : "[spawn]";

  // Pre-flight checks
  if (!claudeBinAvailable()) {
    const err = `Claude Code binary not found at ${resolveClaudeBin()}`;
    console.error(`${logPrefix} Pre-flight FAILED: ${err}`);
    return { success: false, output: "", error: err };
  }

  // Strip ANTHROPIC_MODEL overrides so --model flag reaches the actual provider
  const execEnv = { ...process.env };
  delete execEnv.ANTHROPIC_MODEL;
  delete execEnv.ANTHROPIC_SMALL_FAST_MODEL;

  const bin = resolveClaudeBin();
  const outputLines: string[] = [];
  let spawnError: Error | null = null;

  console.log(`${logPrefix} Starting: bin="${bin}", model="${model}", timeout=${timeoutMs}ms, cwd="${cwd || process.cwd()}"`);
  const startTime = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - startTime;
      if (result.success) {
        console.log(`${logPrefix} SUCCESS: ${result.output.length} chars output in ${elapsed}ms`);
      } else {
        console.warn(`${logPrefix} FAILED (${elapsed}ms): ${result.error?.slice(0, 200) ?? "unknown error"}`);
      }
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
      // Capture all stderr — API errors, rate limits, auth failures are here
      const trimmed = text.trim();
      if (trimmed) {
        outputLines.push(`[stderr] ${trimmed}`);
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

// ── Interactive spawn (no -p flag — full tool access) ─────

export async function spawnClaudeInteractive(
  config: SpawnConfig
): Promise<SpawnResult> {
  const { prompt, model = "deepseek-v4-pro[1m]", timeoutMs = 300_000, label, cwd } = config;
  const logPrefix = label ? `[spawn:${label}]` : "[spawn:interactive]";

  // Pre-flight checks
  if (!claudeBinAvailable()) {
    const err = `Claude Code binary not found at ${resolveClaudeBin()}`;
    console.error(`${logPrefix} Pre-flight FAILED: ${err}`);
    return { success: false, output: "", error: err };
  }

  // Strip ANTHROPIC_MODEL overrides so --model flag reaches the actual provider
  const execEnv = { ...process.env };
  delete execEnv.ANTHROPIC_MODEL;
  delete execEnv.ANTHROPIC_SMALL_FAST_MODEL;

  const bin = resolveClaudeBin();
  const outputLines: string[] = [];
  let spawnError: Error | null = null;

  console.log(`${logPrefix} Starting interactive (NO -p): bin="${bin}", model="${model}", timeout=${timeoutMs}ms, cwd="${cwd || process.cwd()}"`);
  const startTime = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - startTime;
      if (result.success) {
        console.log(`${logPrefix} SUCCESS: ${result.output.length} chars output in ${elapsed}ms`);
      } else {
        console.warn(`${logPrefix} FAILED (${elapsed}ms): ${result.error?.slice(0, 200) ?? "unknown error"}`);
      }
      resolve(result);
    };

    let proc: ChildProcess;
    try {
      // NO -p flag — interactive mode gives agents full tool access (Skill, Read, Write, Bash, etc.)
      proc = spawn(bin, ["--output-format", "stream-json", "--verbose", "--model", model], {
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
      // Capture all stderr — API errors, rate limits, auth failures are here
      const trimmed = text.trim();
      if (trimmed) {
        outputLines.push(`[stderr] ${trimmed}`);
      }
    });

    let toolUseCount = 0;

    rl.on("line", (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "assistant") {
          const text = (msg.message?.content ?? [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
          if (text) outputLines.push(text);
        } else if (msg.type === "tool_use") {
          toolUseCount++;
          const toolName = msg.name ?? "unknown";
          outputLines.push(`[tool_use: ${toolName}]`);
          console.log(`${logPrefix} Tool call #${toolUseCount}: ${toolName}`);
        } else if (msg.type === "result") {
          console.log(`${logPrefix} Task complete (${toolUseCount} tool calls made)`);
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

    // Write prompt and close stdin — agent processes it, makes tool calls, produces result
    if (proc.stdin) {
      proc.stdin.end(Buffer.from(prompt, "utf-8"));
    } else {
      done({ success: false, output: "", error: "Process stdin unavailable — binary may have failed to start" });
    }

    // Timeout (longer for interactive mode since agents may make multiple tool calls)
    setTimeout(() => {
      if (!settled) {
        proc.kill("SIGTERM");
        done({
          success: false,
          output: outputLines.join("\n"),
          error: `Timeout after ${timeoutMs}ms (${toolUseCount} tool calls made)`,
        });
      }
    }, timeoutMs);
  });
}

// ── Retry wrapper ──────────────────────────────────────────

export async function spawnClaudeWithRetry(
  config: SpawnConfig,
  maxRetries: number = 2
): Promise<SpawnResult> {
  const logPrefix = config.label ? `[spawn:${config.label}]` : "[spawn]";
  let lastResult: SpawnResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000); // 2s, 4s, 8s...
      console.warn(`${logPrefix} Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
      await new Promise(r => setTimeout(r, delay));
    }

    const result = config.useInteractive
      ? await spawnClaudeInteractive(config)
      : await spawnClaudeOnce(config);
    if (result.success) return result;

    // Don't retry configuration errors
    if (result.error?.includes("binary not found") || result.error?.includes("API key")) {
      console.error(`${logPrefix} Configuration error — not retrying: ${result.error.slice(0, 200)}`);
      return result;
    }

    lastResult = result;
  }

  console.error(`${logPrefix} All ${maxRetries + 1} attempts failed`);
  return {
    ...lastResult!,
    error: `${lastResult!.error} (retried ${maxRetries} times)`,
  };
}
