// ── OpenClaw Provider (stub) ───────────────────────────────

import { spawn } from "node:child_process";
import type { AgentProvider, ExecuteOpts, ProviderAvailability } from "./types.js";

export const openclawProvider: AgentProvider = {
  name: "openclaw",
  label: "OpenClaw",

  async checkAvailability(): Promise<ProviderAvailability> {
    return new Promise((resolve) => {
      const proc = spawn("openclaw", ["--version"], { timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      proc.on("error", () => resolve({ status: "unavailable", detail: "openclaw CLI not found" }));
      proc.on("exit", (code) => {
        code === 0 ? resolve({ status: "ready" }) : resolve({ status: "unavailable", detail: `exit code ${code}` });
      });
      setTimeout(() => { proc.kill(); resolve({ status: "unavailable", detail: "timeout" }); }, 5000);
    });
  },

  async execute(opts: ExecuteOpts) {
    const proc = spawn("openclaw", ["-p", "--output", "stream-json"], {
      cwd: opts.cwd, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin.write(opts.prompt); proc.stdin.end();

    return {
      events: (async function* () { yield { type: "completed" as const, stopReason: "openclaw stub" }; })(),
      abort: async () => { proc.kill(); },
      send: async () => {},
    };
  },
};
