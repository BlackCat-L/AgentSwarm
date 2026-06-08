// ── Provider interface types ───────────────────────────────

import type { AgentHandle } from "@agent-swarm/shared";

export interface AgentProvider {
  readonly name: string;
  readonly label: string;
  checkAvailability(): Promise<ProviderAvailability>;
  listModels?(): Promise<RuntimeModel[]>;
  execute(opts: ExecuteOpts): Promise<AgentHandle>;
  fetchUsage?(): Promise<UsageInfo | null>;
}

export type ProviderAvailability =
  | { status: "ready" }
  | { status: "unauthorized"; detail: string }
  | { status: "unavailable"; detail: string };

export interface ExecuteOpts {
  prompt: string;
  cwd: string;
  sessionId?: string;
  resume?: string;
  model?: string;
  env?: Record<string, string>;
  systemPromptFile?: string;
}

export interface RuntimeModel {
  id: string;
  name: string;
  description?: string;
  supports: { effort: boolean; adaptive_thinking: boolean; fast_mode: boolean; auto_mode: boolean };
}

export interface UsageInfo {
  windows: { runtime: string; label: string; resets_at: string; utilization: number }[];
  updated_at: string;
}
