// ============================================================
// Orchestrator tests — complexity analysis + safety checks
// ============================================================

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { initDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { TaskGraph } from "../engine/task-graph.js";
import { CapabilityScorer } from "../engine/capability-scorer.js";
import { RuntimePool } from "../engine/runtime-pool.js";
import { RateLimiter } from "../engine/rate-limiter.js";
import { RuntimeCircuitBreaker } from "../engine/circuit-breaker.js";
import { Orchestrator } from "../engine/orchestrator.js";

const TEST_DB = "__test_orch.db";

let orchestrator: Orchestrator;
let taskGraph: TaskGraph;
let pool: RuntimePool;
let rateLimiter: RateLimiter;
let breaker: RuntimeCircuitBreaker;

beforeEach(async () => {
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
  await initDb(TEST_DB);
  migrate();

  // Seed a project + some agents
  const db = (await import("../db/connection.js")).getDb();
  db.run("INSERT OR REPLACE INTO projects (id, name, path) VALUES (?, ?, ?)",
    ["orch-proj", "Orch Test", "/tmp/orch"]);

  taskGraph = new TaskGraph();
  pool = new RuntimePool();
  rateLimiter = new RateLimiter();
  breaker = new RuntimeCircuitBreaker();
  const scorer = new CapabilityScorer();

  orchestrator = new Orchestrator(taskGraph, scorer, pool, rateLimiter, breaker, {
    maxGlobalAgents: 3,
    maxPerRuntime: 2,
    cycleIntervalMs: 1000,
  });
});

afterAll(async () => { await closeDb(); try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ } });

describe("Orchestrator complexity estimation", () => {
  it("should score simple fix as low (1-2)", () => {
    const score = orchestrator.estimateComplexity("fix typo in README", "typo");
    expect(score).toBeLessThanOrEqual(2);
  });

  it("should score full-stack app higher than simple fix", () => {
    const high = orchestrator.estimateComplexity(
      "Build a complete full-stack saas platform with real-time dashboard",
      "Enterprise SaaS Platform"
    );
    const low = orchestrator.estimateComplexity("fix typo in README", "typo");
    expect(high).toBeGreaterThan(low);
  });

  it("should score API backend as medium (3-6)", () => {
    const score = orchestrator.estimateComplexity("Implement REST API with database migration and auth", "Backend API");
    expect(score).toBeGreaterThanOrEqual(3);
    expect(score).toBeLessThanOrEqual(8);
  });

  it("should clamp between 1 and 10", () => {
    const minScore = orchestrator.estimateComplexity("fix", "fix");
    const maxScore = orchestrator.estimateComplexity(
      "full-stack platform saas enterprise real-time dashboard frontend backend docker kubernetes test security",
      "Full Platform"
    );
    expect(minScore).toBeGreaterThanOrEqual(1);
    expect(maxScore).toBeLessThanOrEqual(10);
  });
});

describe("Orchestrator parallelism", () => {
  it("complexity 1-2 → 1 agent", () => {
    expect(orchestrator.decideParallelism(1)).toBe(1);
    expect(orchestrator.decideParallelism(2)).toBe(1);
  });

  it("complexity 3-4 → 2 agents", () => {
    expect(orchestrator.decideParallelism(3)).toBe(2);
    expect(orchestrator.decideParallelism(4)).toBe(2);
  });

  it("complexity 5-7 → 3 agents", () => {
    expect(orchestrator.decideParallelism(5)).toBe(3);
    expect(orchestrator.decideParallelism(7)).toBe(3);
  });

  it("complexity 8-10 → up to maxGlobalAgents", () => {
    const p = orchestrator.decideParallelism(9);
    expect(p).toBeGreaterThanOrEqual(3);
    expect(p).toBeLessThanOrEqual(3); // maxGlobalAgents = 3
  });
});

describe("Orchestrator safety checks", () => {
  it("should allow work initially", () => {
    const result = orchestrator.canAcceptWork("claude-code");
    expect(result.allowed).toBe(true);
  });

  it("should block when circuit breaker is OPEN", () => {
    breaker.onFailure("claude-code");
    breaker.onFailure("claude-code");
    breaker.onFailure("claude-code");

    expect(breaker.getState("claude-code")).toBe("OPEN");
    const result = orchestrator.canAcceptWork("claude-code");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Circuit breaker");
  });

  it("should block when rate limited", () => {
    const futureReset = new Date(Date.now() + 3600000).toISOString();
    rateLimiter.onRateLimited("claude-code", futureReset);

    const result = orchestrator.canAcceptWork("claude-code");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limited");
  });
});

describe("Orchestrator stats", () => {
  it("should report cycle status", () => {
    const stats = orchestrator.getStats();
    expect(stats.cycleRunning).toBe(false);
    expect(stats.pool.activeCount).toBe(0);
    expect(stats.config.maxGlobalAgents).toBe(3);
  });

  it("should start and stop cycle", () => {
    orchestrator.startCycle();
    const stats1 = orchestrator.getStats();
    expect(stats1.cycleRunning).toBe(true);

    orchestrator.stopCycle();
    const stats2 = orchestrator.getStats();
    expect(stats2.cycleRunning).toBe(false);
  });
});

describe("Orchestrator result processing", () => {
  it("submitResult PASS should complete task", () => {
    const t = taskGraph.createTask({ project_id: "orch-proj", title: "Pass test" });
    const result = orchestrator.submitResult(t.id, true);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("Done");
  });

  it("submitResult FAIL should increment retry", () => {
    const t = taskGraph.createTask({
      project_id: "orch-proj",
      title: "Fail test",
      max_retries: 5,
    });
    const result = orchestrator.submitResult(t.id, false, "Test error");
    expect(result).not.toBeNull();
    expect(result!.retry_count).toBe(1);
    expect(result!.error_message).toBe("Test error");
  });
});
