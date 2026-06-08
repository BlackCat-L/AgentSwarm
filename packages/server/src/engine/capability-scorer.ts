// ============================================================
// CapabilityScorer — EMA-based agent capability scoring
// Uses Exponential Moving Average (α=0.3) for per-tag success rates.
// Reference: PRD §0.8 AgentManager capability scoring
// ============================================================

import { getDb, saveDb } from "../db/connection.js";

const ALPHA = 0.3;
const DEFAULT_RELIABILITY = 0.5;

/** In-memory stats object: capability → EMA score */
interface CapabilityStats {
  capabilities: Record<string, number>;
  total_completed: number;
  total_failed: number;
}

// ── Helpers ────────────────────────────────────────────────

function deserializeStats(agentId: string): CapabilityStats {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT capabilities, total_completed, total_failed FROM agent_capabilities WHERE agent_id = ?"
  );
  stmt.bind([agentId]);

  if (!stmt.step()) {
    stmt.free();
    return { capabilities: {}, total_completed: 0, total_failed: 0 };
  }

  const row = stmt.getAsObject();
  stmt.free();

  return {
    capabilities: JSON.parse((row.capabilities as string) || "{}") as Record<string, number>,
    total_completed: (row.total_completed as number) ?? 0,
    total_failed: (row.total_failed as number) ?? 0,
  };
}

function persistStats(agentId: string, stats: CapabilityStats): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO agent_capabilities (agent_id, capabilities, total_completed, total_failed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(agent_id) DO UPDATE SET
       capabilities = excluded.capabilities,
       total_completed = excluded.total_completed,
       total_failed = excluded.total_failed,
       updated_at = excluded.updated_at`,
    [
      agentId,
      JSON.stringify(stats.capabilities),
      stats.total_completed,
      stats.total_failed,
      now,
    ]
  );
  saveDb();
}

// ── Public API ─────────────────────────────────────────────

export class CapabilityScorer {
  /**
   * Upsert an agent's capability profile — initializes or merges tags.
   * Call this when a new agent is registered.
   */
  upsertCapabilityProfile(agentId: string, initialCapabilities: string[]): CapabilityStats {
    const existing = deserializeStats(agentId);
    const merged = { ...existing.capabilities };

    for (const tag of initialCapabilities) {
      if (!(tag in merged)) {
        merged[tag] = DEFAULT_RELIABILITY;
      }
    }

    const stats: CapabilityStats = {
      capabilities: merged,
      total_completed: existing.total_completed,
      total_failed: existing.total_failed,
    };

    persistStats(agentId, stats);
    return stats;
  }

  /**
   * Record a task outcome — updates EMA scores for each capability tag used.
   * @param agentId - The agent that executed the task
   * @param capabilityTags - Tags used in this task (e.g. ["backend", "database"])
   * @param success - Whether the task passed QA/acceptance
   */
  recordTaskOutcome(
    agentId: string,
    capabilityTags: string[],
    success: boolean
  ): CapabilityStats {
    const stats = deserializeStats(agentId);
    const outcome = success ? 1 : 0;

    // Ensure tags exist (initialize if missing)
    for (const tag of capabilityTags) {
      if (!(tag in stats.capabilities)) {
        stats.capabilities[tag] = DEFAULT_RELIABILITY;
      }
    }

    // Update EMA for each tag
    for (const tag of capabilityTags) {
      const oldScore = stats.capabilities[tag]!;
      stats.capabilities[tag] = ALPHA * outcome + (1 - ALPHA) * oldScore;
    }

    // Increment global counters
    if (success) {
      stats.total_completed++;
    } else {
      stats.total_failed++;
    }

    persistStats(agentId, stats);
    return stats;
  }

  /**
   * Score an agent for a given set of capability tags.
   * Returns the average EMA success rate across all requested tags.
   * If no tags match, falls back to the overall reliability score.
   */
  scoreAgent(agentId: string, requiredTags: string[]): number {
    const stats = deserializeStats(agentId);

    if (requiredTags.length === 0) {
      // No tags → use reliability score (completed / total)
      return this.reliabilityScore(agentId);
    }

    // Collect EMA scores for matching tags
    const matchedScores: number[] = [];
    for (const tag of requiredTags) {
      if (tag in stats.capabilities) {
        matchedScores.push(stats.capabilities[tag]!);
      }
    }

    if (matchedScores.length === 0) {
      // No matching tags at all → fallback to reliability
      return this.reliabilityScore(agentId);
    }

    // Average of matched tag EMA scores
    const sum = matchedScores.reduce((a, b) => a + b, 0);
    return sum / matchedScores.length;
  }

  /**
   * Overall reliability score — completed / (completed + failed).
   * Returns 0.5 if the agent hasn't completed any tasks yet (Jeffreys prior).
   */
  reliabilityScore(agentId: string): number {
    const stats = deserializeStats(agentId);
    const total = stats.total_completed + stats.total_failed;
    if (total === 0) return DEFAULT_RELIABILITY;
    return stats.total_completed / total;
  }

  /**
   * Get full capability profile for an agent.
   */
  getProfile(agentId: string): CapabilityStats | null {
    const stats = deserializeStats(agentId);
    if (Object.keys(stats.capabilities).length === 0 && stats.total_completed === 0 && stats.total_failed === 0) {
      return null;
    }
    return stats;
  }

  /**
   * Rank multiple agents by their score for the given capability tags.
   * Returns agents sorted from highest to lowest score, with their scores.
   */
  rankAgents(
    agentIds: string[],
    requiredTags: string[]
  ): { agentId: string; score: number }[] {
    const ranked = agentIds.map((id) => ({
      agentId: id,
      score: this.scoreAgent(id, requiredTags),
    }));
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  /**
   * Get the EMA score for a specific tag (for testing/diagnostics).
   */
  getTagScore(agentId: string, tag: string): number {
    const stats = deserializeStats(agentId);
    return stats.capabilities[tag] ?? DEFAULT_RELIABILITY;
  }
}
