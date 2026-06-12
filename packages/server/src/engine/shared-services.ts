// ── Shared Services Singleton ───────────────────────────────
// All routes share the same TaskGraph, Orchestrator, and services.
// This prevents the 5-isolated-instance anti-pattern where /auto and
// /orchestrate endpoints created their own TaskGraph instances.
//
// TaskGraph reads/writes SQLite directly — no in-memory cache — so
// multiple instances did share data, but it wasted resources and could
// cause race conditions when two instances updated the same task row.

import { TaskGraph } from "./task-graph.js";
import { CapabilityScorer } from "./capability-scorer.js";
import { RuntimePool } from "./runtime-pool.js";
import { RateLimiter } from "./rate-limiter.js";
import { RuntimeCircuitBreaker } from "./circuit-breaker.js";
import { Orchestrator } from "./orchestrator.js";

export const sharedGraph = new TaskGraph();

let _orch: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!_orch) {
    _orch = new Orchestrator(
      sharedGraph,
      new CapabilityScorer(),
      new RuntimePool(),
      new RateLimiter(),
      new RuntimeCircuitBreaker(),
    );
  }
  return _orch;
}

/** Reset singleton (for tests) */
export function resetSharedServices(): void {
  _orch?.stopCycle();
  _orch = null;
}
