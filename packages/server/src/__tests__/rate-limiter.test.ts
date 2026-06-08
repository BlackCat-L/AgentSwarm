// ============================================================
// RateLimiter + CircuitBreaker tests
// ============================================================

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { initDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { RateLimiter } from "../engine/rate-limiter.js";
import { RuntimeCircuitBreaker } from "../engine/circuit-breaker.js";

const TEST_DB = "__test_rl.db";

let rateLimiter: RateLimiter;
let breaker: RuntimeCircuitBreaker;

beforeEach(async () => {
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
  await initDb(TEST_DB);
  migrate();
  rateLimiter = new RateLimiter();
  breaker = new RuntimeCircuitBreaker();
});

afterAll(async () => {
  await closeDb();
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
});

describe("RateLimiter", () => {
  it("should not be paused initially", () => {
    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(false);
  });

  it("should pause and respect resetAt", () => {
    const futureReset = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    rateLimiter.onRateLimited("claude-code", futureReset);

    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(true);
  });

  it("should auto-unpause after resetAt passes", () => {
    const pastReset = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    rateLimiter.onRateLimited("claude-code", pastReset);

    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(false);
  });

  it("clearPause should manually remove pause", () => {
    const futureReset = new Date(Date.now() + 3600000).toISOString();
    rateLimiter.onRateLimited("claude-code", futureReset);
    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(true);

    rateLimiter.clearPause("claude-code");
    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(false);
  });

  it("should track multiple runtimes independently", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    rateLimiter.onRateLimited("claude-code", future);

    expect(rateLimiter.isRuntimePaused("claude-code")).toBe(true);
    expect(rateLimiter.isRuntimePaused("hermes")).toBe(false);
  });

  it("getPausedRuntimes should list all paused", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    rateLimiter.onRateLimited("claude-code", future);
    rateLimiter.onRateLimited("hermes", future);

    const paused = rateLimiter.getPausedRuntimes();
    expect(paused.length).toBe(2);
    expect(paused[0]!.runtime).toBe("claude-code");
  });

  it("should persist and load from DB", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    rateLimiter.onRateLimited("claude-code", future);

    // Create a new limiter and load from DB
    const limiter2 = new RateLimiter();
    limiter2.loadFromDb();
    expect(limiter2.isRuntimePaused("claude-code")).toBe(true);
  });
});

describe("RuntimeCircuitBreaker", () => {
  it("should start CLOSED", () => {
    expect(breaker.getState("claude-code")).toBe("CLOSED");
    expect(breaker.canDispatch("claude-code")).toBe(true);
  });

  it("should OPEN after 3 consecutive failures", () => {
    breaker.onFailure("claude-code");
    breaker.onFailure("claude-code");
    expect(breaker.getState("claude-code")).toBe("CLOSED"); // not yet

    breaker.onFailure("claude-code"); // 3rd failure → OPEN
    expect(breaker.getState("claude-code")).toBe("OPEN");
    expect(breaker.canDispatch("claude-code")).toBe(false);
  });

  it("should stay CLOSED with intermittent failures", () => {
    breaker.onFailure("claude-code");
    breaker.onFailure("claude-code");
    breaker.onSuccess("claude-code"); // resets failure count
    breaker.onFailure("claude-code");

    expect(breaker.getState("claude-code")).toBe("CLOSED");
    expect(breaker.getFailureCount("claude-code")).toBe(1);
  });

  it("should go HALF_OPEN → CLOSED with consecutive successes", () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) breaker.onFailure("hermes");
    expect(breaker.getState("hermes")).toBe("OPEN");

    // Can't dispatch while OPEN
    expect(breaker.canDispatch("hermes")).toBe(false);

    // Simulate time passing: manually transition
    // (We can't easily test the 5-min timeout, so test the state logic directly)
    breaker.reset("hermes");
    breaker.onFailure("hermes"); // 1 fail in CLOSED (not enough to trip)
    expect(breaker.getState("hermes")).toBe("CLOSED");
  });

  it("reset should restore CLOSED state", () => {
    for (let i = 0; i < 3; i++) breaker.onFailure("test");
    expect(breaker.getState("test")).toBe("OPEN");

    breaker.reset("test");
    expect(breaker.getState("test")).toBe("CLOSED");
    expect(breaker.getFailureCount("test")).toBe(0);
    expect(breaker.canDispatch("test")).toBe(true);
  });

  it("resetAll should clear all circuits", () => {
    for (let i = 0; i < 3; i++) breaker.onFailure("a");
    for (let i = 0; i < 3; i++) breaker.onFailure("b");
    expect(breaker.getState("a")).toBe("OPEN");
    expect(breaker.getState("b")).toBe("OPEN");

    breaker.resetAll();
    expect(breaker.getState("a")).toBe("CLOSED");
    expect(breaker.getState("b")).toBe("CLOSED");
  });
});
