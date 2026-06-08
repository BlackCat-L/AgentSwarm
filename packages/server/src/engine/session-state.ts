// ============================================================
// SessionState — state machine with DB persistence
// Core logic in @agent-swarm/shared; this wraps with DB operations.
// Reference: PRD §0.7, agent-kanban session state machine
// ============================================================

import { getDb, saveDb } from "../db/connection.js";
import {
  transitionSession,
  classifyIteratorEnd,
  type SessionStatus,
  type SessionEvent,
  type IteratorEndResult,
  type SessionInfo,
  type TokenUsage,
} from "@agent-swarm/shared";

export { classifyIteratorEnd };
export type { SessionStatus, SessionEvent, IteratorEndResult, SessionInfo, TokenUsage };

// ── Persistence ────────────────────────────────────────────

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Create or update a session record in the DB.
 */
export function persistSession(info: SessionInfo): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO messages (id, from_agent_id, type, content, created_at)
     VALUES (?, ?, 'status', ?, datetime('now'))`,
    [sessionKey(info.sessionId), info.agentId, JSON.stringify(info)]
  );
  saveDb();
}

/**
 * Load a session record from the DB.
 */
export function loadSession(sessionId: string): SessionInfo | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT content FROM messages WHERE id = ?"
  );
  stmt.bind([sessionKey(sessionId)]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return JSON.parse(row.content as string) as SessionInfo;
}

// ── State Transition with Persistence ──────────────────────

/**
 * Apply a session event, persist the result, and return the new status.
 * Throws if the transition is invalid (no matching transition from current state).
 */
export function applyEvent(
  session: SessionInfo,
  event: SessionEvent
): SessionInfo {
  const newStatus = transitionSession(session.status, event);

  if (newStatus === session.status && event.type !== "cleanup_done") {
    throw new Error(
      `Invalid transition: ${session.status} → (${event.type}) is not allowed`
    );
  }

  const updated: SessionInfo = {
    ...session,
    status: newStatus,
    lastHeartbeatAt: new Date().toISOString(),
  };

  persistSession(updated);
  return updated;
}

// ── Factory ────────────────────────────────────────────────

/**
 * Create a new session in idle state.
 */
export function createSession(
  sessionId: string,
  agentId: string,
  taskId: string
): SessionInfo {
  const info: SessionInfo = {
    sessionId,
    agentId,
    taskId,
    status: "idle",
    startedAt: new Date().toISOString(),
    lastHeartbeatAt: null,
    costUsd: 0,
    tokenUsage: null,
  };
  persistSession(info);
  return info;
}

// ── Utility ────────────────────────────────────────────────

/**
 * Handle agent iterator completion: classify the end reason,
 * apply the resulting event, and return the updated session.
 */
export function handleSessionEnd(
  session: SessionInfo,
  result: IteratorEndResult
): SessionInfo {
  const event = classifyIteratorEnd(result);
  return applyEvent(session, event);
}

/**
 * Check if a session can be dispatched (is in an idle-like state).
 */
export function canDispatch(status: SessionStatus): boolean {
  return status === "idle" || status === "rate_limited" || status === "suspended";
}

/**
 * Check if a session is in a terminal state.
 */
export function isTerminal(status: SessionStatus): boolean {
  return status === "done" || status === "blocked";
}
