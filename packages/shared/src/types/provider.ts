// ============================================================
// Provider types — 对齐 PRD §4.3 AgentProvider 接口体系
// ============================================================

import type { TokenUsage } from "./session.js";

// ---- Provider 检测 ----

export interface ProviderDetection {
  installed: boolean;
  version: string | null;
  path: string | null;
  authenticated: boolean;
  authMethod?: "oauth" | "api_key" | "none";
  error?: string;
}

// ---- Agent 启动配置 ----

export interface AgentSpawnConfig {
  prompt: string;
  worktreePath: string;
  model: "deepseek-v4-pro[1m]" | "deepseek-v4-flash";
  sessionId?: string;
  resume?: string; // resume token
  maxTurns?: number;
  allowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  env?: Record<string, string>;
  timeoutMinutes?: number;
  systemPromptFile?: string;
}

// ---- Agent 输出事件 ----

/** SDK 消息解析后的输出事件 */
export type AgentOutputEvent =
  | { type: "assistant"; content: string; usage?: TokenUsage }
  | { type: "tool_use"; toolName: string; toolId: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { type: "error"; message: string; code?: string }
  | { type: "cost"; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUSD: number }
  | { type: "completed"; stopReason: string }
  | { type: "thinking"; content: string }
  | { type: "message"; blocks: ContentBlock[] }
  | { type: "turn_start" }
  | { type: "turn_end"; text?: string; cost: number; usage?: Record<string, unknown> }
  | { type: "turn_error"; code: string; detail?: string }
  | { type: "turn_rate_limit"; status: string; resetAt?: string; rateLimitType?: string }
  | { type: "subtask_start"; tool_use_id: string; description?: string; kind?: string }
  | { type: "subtask_progress"; tool_use_id: string; summary?: string; tokens?: number; duration_ms?: number }
  | { type: "subtask_end"; tool_use_id: string; status: string; summary?: string; tokens?: number; duration_ms?: number }
  | { type: "message_user"; text: string };

/** 流式消息的内容块 */
export type ContentBlock =
  | { type: "text"; text: string; parent_id?: string | null }
  | { type: "thinking"; text: string; parent_id?: string | null }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; parent_id?: string | null }
  | { type: "tool_result"; tool_use_id: string; output?: string; error?: boolean; parent_id?: string | null };

// ---- Agent 句柄 ----

export interface AgentHandle {
  events: AsyncIterable<AgentOutputEvent>;
  abort(): Promise<void>;
  send(message: string): Promise<void>;
}

// ---- Provider 接口 ----

export interface AgentProvider {
  readonly name: string;
  readonly label: string;

  /** 检测 Provider 是否可用 */
  checkAvailability(): Promise<ProviderAvailability>;

  /** 列出支持的模型 */
  listModels?(): Promise<RuntimeModel[]>;

  /** 启动 Agent → 返回句柄 */
  execute(opts: AgentExecuteOpts): Promise<AgentHandle>;

  /** 获取用量信息 */
  fetchUsage?(): Promise<UsageInfo | null>;

  /** 获取历史消息 */
  getHistory?(sessionId: string): Promise<HistoryEvent[]>;
}

/** Provider 可用性 */
export type ProviderAvailability =
  | { status: "ready" }
  | { status: "unauthorized"; detail: string }
  | { status: "unavailable"; detail: string }
  | { status: "rate_limited"; detail: string; resetAt?: string };

/** execute() 调用参数 */
export interface AgentExecuteOpts {
  prompt: string;
  cwd: string;
  sessionId?: string;
  resume?: string;
  model?: string;
  env?: Record<string, string>;
  systemPromptFile?: string;
}

/** 运行时模型信息 */
export interface RuntimeModel {
  id: string;
  name: string;
  description?: string;
  supports: {
    effort: boolean;
    adaptive_thinking: boolean;
    fast_mode: boolean;
    auto_mode: boolean;
  };
  supported_reasoning_efforts?: string[];
}

/** 用量信息 */
export interface UsageInfo {
  windows: UsageWindow[];
  updated_at: string;
}

export interface UsageWindow {
  runtime: string;
  label: string;
  resets_at: string;
  utilization: number; // 0-100
}

/** 历史事件 */
export interface HistoryEvent {
  id: string;
  event: AgentOutputEvent;
  timestamp: string;
}
