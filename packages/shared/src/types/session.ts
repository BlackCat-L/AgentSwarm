// ============================================================
// Session state machine — 对齐 PRD §0.7
// ============================================================

/**
 * 会话状态机：
 * idle → working → in_review → completing → done
 *             ↘ rate_limited | suspended | blocked
 */
export type SessionStatus =
  | "idle"
  | "working"
  | "in_review"
  | "completing"
  | "done"
  | "rate_limited"
  | "suspended"
  | "blocked";

/** 会话事件——驱动状态转换 */
export type SessionEvent =
  | { type: "dispatched" }
  | { type: "agent_done" }
  | { type: "agent_crashed"; transient: boolean }
  | { type: "rate_limited"; resetAt: string }
  | { type: "submitted_for_review" }
  | { type: "review_approved" }
  | { type: "review_rejected" }
  | { type: "task_cancelled" }
  | { type: "timeout" }
  | { type: "cleanup_done" };

/** 状态流转表 */
export const SESSION_TRANSITIONS: Record<SessionStatus, Partial<Record<SessionEvent["type"], SessionStatus>>> = {
  idle:           { dispatched: "working" },
  working:        { agent_done: "in_review", agent_crashed: "suspended", rate_limited: "rate_limited", timeout: "suspended", task_cancelled: "idle" },
  in_review:      { review_approved: "completing", review_rejected: "working", task_cancelled: "idle" },
  completing:     { cleanup_done: "done" },
  done:           {},
  rate_limited:   { dispatched: "working", task_cancelled: "idle" },
  suspended:      { dispatched: "working", task_cancelled: "idle" },
  blocked:        { dispatched: "working", task_cancelled: "idle" },
};

/** 推进状态机 */
export function transitionSession(
  current: SessionStatus,
  event: SessionEvent
): SessionStatus {
  const next = SESSION_TRANSITIONS[current]?.[event.type];
  return next ?? current;
}

/**
 * Iterator 结束分类器——判断 Agent 退出的原因。
 * SDK for-await 循环结束时的统一分类入口。
 */
export interface IteratorEndResult {
  resultReceived: boolean;   // SDK 返回了 result 事件
  rateLimited: boolean;      // 触发了限流
  crashed: boolean;          // 迭代器异常退出
  transient: boolean;        // 暂态错误（可恢复）
}

/** 分类 iterator 结束 → SessionEvent */
export function classifyIteratorEnd(result: IteratorEndResult): SessionEvent {
  if (result.rateLimited) {
    return { type: "rate_limited", resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  }
  if (result.crashed) {
    return { type: "agent_crashed", transient: result.transient };
  }
  if (!result.resultReceived) {
    return { type: "timeout" };
  }
  return { type: "agent_done" };
}

/** 会话信息 */
export interface SessionInfo {
  sessionId: string;
  agentId: string;
  taskId: string;
  status: SessionStatus;
  startedAt: string;
  lastHeartbeatAt: string | null;
  costUsd: number;
  tokenUsage: TokenUsage | null;
  resumeToken?: string;
}

/** Token 用量 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
}
