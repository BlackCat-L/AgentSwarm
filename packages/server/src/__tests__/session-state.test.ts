// ============================================================
// SessionState machine tests — all transition paths
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import {
  createSession,
  applyEvent,
  handleSessionEnd,
  canDispatch,
  isTerminal,
  loadSession,
  classifyIteratorEnd,
} from "../engine/session-state.js";
import type { SessionInfo, IteratorEndResult } from "../engine/session-state.js";

const TEST_DB = "__test_session.db";

function makeSession(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    sessionId: "sess-001",
    agentId: "agent-001",
    taskId: "task-001",
    status: "idle",
    startedAt: new Date().toISOString(),
    lastHeartbeatAt: null,
    costUsd: 0,
    tokenUsage: null,
    ...overrides,
  };
}

beforeAll(async () => {
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
  await initDb(TEST_DB);
  migrate();
});

afterAll(async () => {
  await closeDb();
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
});

describe("SessionState — happy path", () => {
  it("idle → working (dispatched)", () => {
    const session = makeSession();
    const result = applyEvent(session, { type: "dispatched" });
    expect(result.status).toBe("working");
  });

  it("working → in_review (agent_done)", () => {
    const session = makeSession({ status: "working" });
    const result = applyEvent(session, { type: "agent_done" });
    expect(result.status).toBe("in_review");
  });

  it("in_review → completing (review_approved)", () => {
    const session = makeSession({ status: "in_review" });
    const result = applyEvent(session, { type: "review_approved" });
    expect(result.status).toBe("completing");
  });

  it("completing → done (cleanup_done)", () => {
    const session = makeSession({ status: "completing" });
    const result = applyEvent(session, { type: "cleanup_done" });
    expect(result.status).toBe("done");
  });

  it("in_review → working (review_rejected)", () => {
    const session = makeSession({ status: "in_review" });
    const result = applyEvent(session, { type: "review_rejected" });
    expect(result.status).toBe("working");
  });
});

describe("SessionState — error paths", () => {
  it("working → rate_limited", () => {
    const session = makeSession({ status: "working" });
    const result = applyEvent(session, {
      type: "rate_limited",
      resetAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(result.status).toBe("rate_limited");
  });

  it("working → suspended (agent_crashed transient)", () => {
    const session = makeSession({ status: "working" });
    const result = applyEvent(session, { type: "agent_crashed", transient: true });
    expect(result.status).toBe("suspended");
  });

  it("working → suspended (timeout)", () => {
    const session = makeSession({ status: "working" });
    const result = applyEvent(session, { type: "timeout" });
    expect(result.status).toBe("suspended");
  });

  it("suspended → working (dispatched again)", () => {
    const session = makeSession({ status: "suspended" });
    const result = applyEvent(session, { type: "dispatched" });
    expect(result.status).toBe("working");
  });

  it("rate_limited → working (dispatched after reset)", () => {
    const session = makeSession({ status: "rate_limited" });
    const result = applyEvent(session, { type: "dispatched" });
    expect(result.status).toBe("working");
  });

  it("blocked → working (dispatched after intervention)", () => {
    const session = makeSession({ status: "blocked" });
    const result = applyEvent(session, { type: "dispatched" });
    expect(result.status).toBe("working");
  });
});

describe("SessionState — cancellation", () => {
  it("working → idle (task_cancelled)", () => {
    const session = makeSession({ status: "working" });
    const result = applyEvent(session, { type: "task_cancelled" });
    expect(result.status).toBe("idle");
  });

  it("in_review → idle (task_cancelled)", () => {
    const session = makeSession({ status: "in_review" });
    const result = applyEvent(session, { type: "task_cancelled" });
    expect(result.status).toBe("idle");
  });
});

describe("SessionState — classifyIteratorEnd", () => {
  it("should classify rate_limit result", () => {
    const result: IteratorEndResult = {
      resultReceived: false,
      rateLimited: true,
      crashed: false,
      transient: false,
    };
    const event = classifyIteratorEnd(result);
    expect(event.type).toBe("rate_limited");
  });

  it("should classify transient crash", () => {
    const result: IteratorEndResult = {
      resultReceived: false,
      rateLimited: false,
      crashed: true,
      transient: true,
    };
    const event = classifyIteratorEnd(result);
    expect(event.type).toBe("agent_crashed");
    if (event.type === "agent_crashed") {
      expect(event.transient).toBe(true);
    }
  });

  it("should classify permanent crash", () => {
    const result: IteratorEndResult = {
      resultReceived: false,
      rateLimited: false,
      crashed: true,
      transient: false,
    };
    const event = classifyIteratorEnd(result);
    expect(event.type).toBe("agent_crashed");
    if (event.type === "agent_crashed") {
      expect(event.transient).toBe(false);
    }
  });

  it("should classify timeout (no result, no crash)", () => {
    const result: IteratorEndResult = {
      resultReceived: false,
      rateLimited: false,
      crashed: false,
      transient: false,
    };
    const event = classifyIteratorEnd(result);
    expect(event.type).toBe("timeout");
  });

  it("should classify normal completion", () => {
    const result: IteratorEndResult = {
      resultReceived: true,
      rateLimited: false,
      crashed: false,
      transient: false,
    };
    const event = classifyIteratorEnd(result);
    expect(event.type).toBe("agent_done");
  });
});

describe("SessionState — invalid transitions", () => {
  it("should throw on invalid transition (done → dispatched)", () => {
    const session = makeSession({ status: "done" });
    expect(() => applyEvent(session, { type: "dispatched" })).toThrow("Invalid transition");
  });

  it("should throw on invalid transition (idle → agent_done)", () => {
    const session = makeSession();
    expect(() => applyEvent(session, { type: "agent_done" })).toThrow("Invalid transition");
  });
});

describe("SessionState — utilities", () => {
  it("canDispatch should return true for idle", () => {
    expect(canDispatch("idle")).toBe(true);
  });

  it("canDispatch should return false for done", () => {
    expect(canDispatch("done")).toBe(false);
  });

  it("canDispatch should return false for working", () => {
    expect(canDispatch("working")).toBe(false);
  });

  it("isTerminal should return true for done", () => {
    expect(isTerminal("done")).toBe(true);
  });

  it("isTerminal should return false for idle", () => {
    expect(isTerminal("idle")).toBe(false);
  });
});

describe("SessionState — persistence", () => {
  it("createSession and loadSession round-trip", () => {
    const session = createSession("sess-persist", "agent-p1", "task-p1");
    expect(session.status).toBe("idle");
    expect(session.sessionId).toBe("sess-persist");

    const loaded = loadSession("sess-persist");
    expect(loaded).not.toBeNull();
    expect(loaded!.agentId).toBe("agent-p1");
    expect(loaded!.taskId).toBe("task-p1");
  });

  it("applyEvent should persist updated status", () => {
    const session = createSession("sess-persist2", "agent-p2", "task-p2");
    applyEvent(session, { type: "dispatched" });

    const loaded = loadSession("sess-persist2");
    expect(loaded!.status).toBe("working");
  });

  it("handleSessionEnd with rate_limit should set rate_limited status", () => {
    const session = createSession("sess-rl", "agent-rl", "task-rl");
    applyEvent(session, { type: "dispatched" }); // idle → working

    const working = loadSession("sess-rl")!;
    const result: IteratorEndResult = {
      resultReceived: false,
      rateLimited: true,
      crashed: false,
      transient: false,
    };
    const updated = handleSessionEnd(working, result);
    expect(updated.status).toBe("rate_limited");
  });
});
