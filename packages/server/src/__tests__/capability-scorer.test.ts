// ============================================================
// CapabilityScorer tests — EMA convergence + scoring + ranking
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { CapabilityScorer } from "../engine/capability-scorer.js";

const TEST_DB = "__test_scorer.db";

let scorer: CapabilityScorer;

beforeAll(async () => {
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
  await initDb(TEST_DB);
  migrate();
  scorer = new CapabilityScorer();
});

afterAll(async () => {
  await closeDb();
  try { const fs = await import("node:fs"); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch { /* ok */ }
});

describe("CapabilityScorer EMA basics", () => {
  it("upsertCapabilityProfile should initialize tags with default reliability", () => {
    const stats = scorer.upsertCapabilityProfile("agent-001", ["backend", "database"]);

    expect(stats.capabilities.backend).toBe(0.5);
    expect(stats.capabilities.database).toBe(0.5);
    expect(stats.total_completed).toBe(0);
    expect(stats.total_failed).toBe(0);
  });

  it("upsertCapabilityProfile should preserve existing tags", () => {
    scorer.upsertCapabilityProfile("agent-002", ["frontend"]);
    scorer.recordTaskOutcome("agent-002", ["frontend"], true);

    // Upsert again with new tag — should keep frontend score
    const stats = scorer.upsertCapabilityProfile("agent-002", ["frontend", "css"]);

    // Initial EMA: 0.3 * 1 + 0.7 * 0.5 = 0.3 + 0.35 = 0.65
    expect(stats.capabilities.frontend).toBeCloseTo(0.65, 2);
    expect(stats.capabilities.css).toBe(0.5); // new tag
    expect(stats.total_completed).toBe(1); // preserved
  });
});

describe("CapabilityScorer EMA convergence", () => {
  it("should converge > 0.9 after 10 consecutive successes", () => {
    scorer.upsertCapabilityProfile("agent-converge-up", ["backend"]);

    for (let i = 0; i < 10; i++) {
      scorer.recordTaskOutcome("agent-converge-up", ["backend"], true);
    }

    const score = scorer.scoreAgent("agent-converge-up", ["backend"]);
    // After 10 successes with α=0.3:
    // EMA formula: each update = 0.3*1 + 0.7*old
    // Starting from 0.5: after 10 steps ≈ 0.5*0.7^10 + 0.3*(1-0.7^10)/0.3 ≈ 0.5*0.028 + 0.9719 ≈ 0.9859
    expect(score).toBeGreaterThan(0.9);
  });

  it("should converge < 0.3 after 10 consecutive failures", () => {
    scorer.upsertCapabilityProfile("agent-converge-down", ["frontend"]);

    for (let i = 0; i < 10; i++) {
      scorer.recordTaskOutcome("agent-converge-down", ["frontend"], false);
    }

    const score = scorer.scoreAgent("agent-converge-down", ["frontend"]);
    // After 10 failures: EMA from 0.5 with outcome=0
    // = 0.5 * 0.7^10 ≈ 0.5 * 0.028 = 0.0141
    expect(score).toBeLessThan(0.3);
  });

  it("should mix successes and failures and converge accordingly", () => {
    scorer.upsertCapabilityProfile("agent-mixed", ["test"]);

    // 5 successes
    for (let i = 0; i < 5; i++) {
      scorer.recordTaskOutcome("agent-mixed", ["test"], true);
    }
    const midHigh = scorer.getTagScore("agent-mixed", "test");
    // After 5 successes from 0.5: ≈ 0.5*0.7^5 + (1-0.7^5) ≈ 0.084 + 0.832 = 0.916
    // Actually exact calc: EMA_5 = 0.3 * sum(0.7^k for k=0..4) + 0.5 * 0.7^5
    // = 0.3 * (1-0.7^5)/0.3 + 0.5*0.7^5 = 0.8319 + 0.084 = 0.9159
    expect(midHigh).toBeGreaterThan(0.8);

    // 5 failures
    for (let i = 0; i < 5; i++) {
      scorer.recordTaskOutcome("agent-mixed", ["test"], false);
    }
    const afterMix = scorer.getTagScore("agent-mixed", "test");
    // After 5 failures from ~0.916: the EMA decays back down
    expect(afterMix).toBeLessThan(midHigh);
  });
});

describe("CapabilityScorer scoring", () => {
  it("scoreAgent with no tags should return reliability score", () => {
    scorer.upsertCapabilityProfile("agent-reliability", ["sql"]);
    scorer.recordTaskOutcome("agent-reliability", ["sql"], true);
    scorer.recordTaskOutcome("agent-reliability", ["sql"], true);
    scorer.recordTaskOutcome("agent-reliability", ["sql"], false);

    const score = scorer.scoreAgent("agent-reliability", []);
    // 2 completed / 3 total = 0.667
    expect(score).toBeCloseTo(2 / 3, 1);
  });

  it("scoreAgent with no matching tags should fall back to reliability", () => {
    scorer.upsertCapabilityProfile("agent-nomatch", ["kotlin"]);
    scorer.recordTaskOutcome("agent-nomatch", ["kotlin"], true);

    const score = scorer.scoreAgent("agent-nomatch", ["javascript"]);
    // No matching tags → reliability: 1/1 = 1.0
    expect(score).toBe(1.0);
  });

  it("scoreAgent should average EMA scores across matched tags", () => {
    scorer.upsertCapabilityProfile("agent-multi", ["backend", "database"]);

    // 5 successes for backend, 5 failures for database
    for (let i = 0; i < 5; i++) {
      scorer.recordTaskOutcome("agent-multi", ["backend"], true);
      scorer.recordTaskOutcome("agent-multi", ["database"], false);
    }

    const backendScore = scorer.getTagScore("agent-multi", "backend"); // high
    const dbScore = scorer.getTagScore("agent-multi", "database"); // low
    const avg = scorer.scoreAgent("agent-multi", ["backend", "database"]);

    // Average should be between the two
    expect(avg).toBeGreaterThan(dbScore);
    expect(avg).toBeLessThan(backendScore);
    expect(avg).toBeCloseTo((backendScore + dbScore) / 2, 5);
  });

  it("rankAgents should order by score descending", () => {
    // Setup: agent-good has all successes, agent-bad has all failures
    scorer.upsertCapabilityProfile("agent-good", ["api"]);
    scorer.upsertCapabilityProfile("agent-bad", ["api"]);

    for (let i = 0; i < 8; i++) {
      scorer.recordTaskOutcome("agent-good", ["api"], true);
      scorer.recordTaskOutcome("agent-bad", ["api"], false);
    }

    const ranked = scorer.rankAgents(["agent-good", "agent-bad"], ["api"]);
    expect(ranked[0]!.agentId).toBe("agent-good");
    expect(ranked[1]!.agentId).toBe("agent-bad");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });
});

describe("CapabilityScorer edge cases", () => {
  it("getProfile should return null for unknown agent", () => {
    expect(scorer.getProfile("non-existent")).toBeNull();
  });

  it("new agent reliability should be 0.5", () => {
    scorer.upsertCapabilityProfile("agent-fresh", []);
    expect(scorer.reliabilityScore("agent-fresh")).toBe(0.5);
  });

  it("single outcome should produce expected EMA value", () => {
    scorer.upsertCapabilityProfile("agent-single", ["rust"]);
    scorer.recordTaskOutcome("agent-single", ["rust"], true);
    // EMA: 0.3 * 1 + 0.7 * 0.5 = 0.3 + 0.35 = 0.65
    expect(scorer.getTagScore("agent-single", "rust")).toBeCloseTo(0.65, 3);
  });
});
