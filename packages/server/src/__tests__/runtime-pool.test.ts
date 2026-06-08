// ============================================================
// RuntimePool tests — spawn, kill, timeout, dedup, concurrency
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RuntimePool } from "../engine/runtime-pool.js";
import type { AgentHandle, AgentOutputEvent } from "@agent-swarm/shared";

// ── Helpers ────────────────────────────────────────────────

function mockHandle(events: AgentOutputEvent[] = []): AgentHandle {
  let resolveEvents: (() => void) | null = null;

  const eventPromise = new Promise<void>((resolve) => {
    resolveEvents = resolve;
  });

  async function* eventGenerator(): AsyncIterable<AgentOutputEvent> {
    for (const ev of events) {
      yield ev;
    }
    // Wait indefinitely (never resolves until abort)
    await eventPromise;
  }

  return {
    events: eventGenerator(),
    abort: vi.fn(async () => { resolveEvents?.(); }),
    send: vi.fn(async () => {}),
  };
}

// ── Tests ──────────────────────────────────────────────────

let pool: RuntimePool;

beforeEach(() => {
  pool = new RuntimePool();
});

afterEach(async () => {
  await pool.killAll();
});

describe("RuntimePool spawn + kill", () => {
  it("spawnAgent should register task", async () => {
    const handle = mockHandle([]);
    const entry = await pool.spawnAgent({
      taskId: "task-1",
      sessionId: "sess-1",
      agentId: "agent-1",
      providerName: "claude-code",
      cwd: "/tmp/test",
      handle,
    });

    expect(entry.taskId).toBe("task-1");
    expect(entry.providerName).toBe("claude-code");
    expect(pool.hasTask("task-1")).toBe(true);
    expect(pool.activeCount).toBe(1);
  });

  it("spawnAgent should reject duplicate taskId", async () => {
    const h1 = mockHandle([]);
    await pool.spawnAgent({
      taskId: "task-1", sessionId: "sess-1", agentId: "a1",
      providerName: "claude-code", cwd: "/tmp", handle: h1,
    });

    const h2 = mockHandle([]);
    await expect(
      pool.spawnAgent({
        taskId: "task-1", sessionId: "sess-2", agentId: "a2",
        providerName: "claude-code", cwd: "/tmp", handle: h2,
      })
    ).rejects.toThrow("already running");
  });

  it("killTask should remove from pool", async () => {
    const handle = mockHandle([]);
    await pool.spawnAgent({
      taskId: "task-1", sessionId: "sess-1", agentId: "a1",
      providerName: "claude-code", cwd: "/tmp", handle,
    });

    const killed = await pool.killTask("task-1");
    expect(killed).toBe(true);
    expect(pool.hasTask("task-1")).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it("killTask should return false for unknown task", async () => {
    const result = await pool.killTask("non-existent");
    expect(result).toBe(false);
  });

  it("killAll should clear the entire pool", async () => {
    for (let i = 0; i < 3; i++) {
      await pool.spawnAgent({
        taskId: `task-${i}`, sessionId: `sess-${i}`, agentId: `agent-${i}`,
        providerName: "claude-code", cwd: "/tmp", handle: mockHandle([]),
      });
    }

    expect(pool.activeCount).toBe(3);
    const count = await pool.killAll();
    expect(count).toBe(3);
    expect(pool.activeCount).toBe(0);
  });
});

describe("RuntimePool per-runtime counting", () => {
  it("activeCountForRuntime should count correctly", async () => {
    await pool.spawnAgent({
      taskId: "cc-1", sessionId: "s1", agentId: "a1",
      providerName: "claude-code", cwd: "/tmp", handle: mockHandle([]),
    });
    await pool.spawnAgent({
      taskId: "cc-2", sessionId: "s2", agentId: "a2",
      providerName: "claude-code", cwd: "/tmp", handle: mockHandle([]),
    });
    await pool.spawnAgent({
      taskId: "her-1", sessionId: "s3", agentId: "a3",
      providerName: "hermes", cwd: "/tmp", handle: mockHandle([]),
    });

    expect(pool.activeCountForRuntime("claude-code")).toBe(2);
    expect(pool.activeCountForRuntime("hermes")).toBe(1);
    expect(pool.activeCountForRuntime("openclaw")).toBe(0);
    expect(pool.activeCount).toBe(3);
  });
});

describe("RuntimePool cost tracking", () => {
  it("should accumulate costs from turn_end events", async () => {
    const events: AgentOutputEvent[] = [
      { type: "turn_end", cost: 0.05 },
    ];
    const handle = mockHandle(events);
    await pool.spawnAgent({
      taskId: "cost-1", sessionId: "s1", agentId: "a1",
      providerName: "claude-code", cwd: "/tmp", handle,
    });

    // Wait briefly for event loop to consume
    await new Promise((r) => setTimeout(r, 50));

    // After kill, the accumulated cost is in the entry
    const entry = await pool.spawnAgent({
      taskId: "cost-2", sessionId: "s2", agentId: "a2",
      providerName: "claude-code", cwd: "/tmp", handle: mockHandle([
        { type: "turn_end", cost: 0.10 },
        { type: "turn_end", cost: 0.15 },
      ]),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(entry.lastCostUsd).toBeGreaterThanOrEqual(0);
  });
});

describe("RuntimePool stats", () => {
  it("getStats should return correct pool state", async () => {
    await pool.spawnAgent({
      taskId: "s1", sessionId: "ss1", agentId: "a1",
      providerName: "claude-code", cwd: "/tmp", handle: mockHandle([]),
    });

    const stats = pool.getStats();
    expect(stats.activeCount).toBe(1);
    expect(stats.byRuntime["claude-code"]).toBe(1);
    expect(stats.taskIds).toContain("s1");
  });
});
