// ============================================================
// Cost tracking types — 对齐 SQL cost_events 表
// ============================================================

/** 成本事件 */
export interface CostEvent {
  id: number;
  project_id: string;
  agent_id: string | null;
  task_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  timestamp: string;
}

/** 成本摘要（按维度聚合） */
export interface CostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  byAgent: Record<string, CostSummary>;
  byTask: Record<string, CostSummary>;
  byModel: Record<string, CostSummary>;
}

/** 上下文使用率级别 */
export type ContextUsageLevel = "green" | "yellow" | "red";

/** 上下文使用率 */
export interface ContextUsage {
  /** 已用 token 数 */
  usedTokens: number;
  /** 上限 token 数 */
  maxTokens: number;
  /** 使用率百分比 0-100 */
  utilizationPercent: number;
  /** 级别 */
  level: ContextUsageLevel;
}

/** 判断上下文使用率级别 */
export function classifyContextUsage(
  percent: number
): ContextUsageLevel {
  if (percent >= 85) return "red";
  if (percent >= 70) return "yellow";
  return "green";
}

/** 限流信息 */
export interface RateLimitInfo {
  /** 触发限流的 runtime */
  runtime: string;
  /** 重置时间 ISO */
  resetAt: string;
  /** 限流类型 */
  rateLimitType: string;
  /** 是否使用超额 */
  isUsingOverage: boolean;
}
