// ── Cost Tracker — token usage + USD cost aggregation ─────

import { getDb, saveDb } from "../db/connection.js";
import { eventBus } from "../sse/event-bus.js";
// ── Pricing (per 1M tokens) ────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // DeepSeek
  "deepseek-v4-pro[1m]": { input: 0.55, output: 2.19, cacheRead: 0.05, cacheWrite: 0.55 },
  "deepseek-v4-flash":   { input: 0.27, output: 1.10, cacheRead: 0.03, cacheWrite: 0.27 },
  // Legacy Anthropic aliases (kept for reference, not used)
  "sonnet": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "opus":  { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  "haiku": { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },
};

// ── Cost Tracker ───────────────────────────────────────────

export class CostTracker {
  /** Record a cost event */
  recordCost(params: {
    projectId: string; agentId?: string; taskId?: string;
    model?: string; inputTokens: number; outputTokens: number;
    cacheReadTokens?: number; cacheWriteTokens?: number;
  }): void {
    const db = getDb();
    const pricing = MODEL_PRICING[params.model ?? "deepseek-v4-pro[1m]"] ?? MODEL_PRICING["deepseek-v4-pro[1m]"]!;
    const costUsd =
      (params.inputTokens / 1_000_000) * pricing.input +
      (params.outputTokens / 1_000_000) * pricing.output +
      ((params.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheRead +
      ((params.cacheWriteTokens ?? 0) / 1_000_000) * pricing.cacheWrite;

    db.run(
      `INSERT INTO cost_events (project_id, agent_id, task_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [params.projectId, params.agentId ?? null, params.taskId ?? null,
       params.model ?? "deepseek-v4-pro[1m]", params.inputTokens, params.outputTokens,
       params.cacheReadTokens ?? 0, params.cacheWriteTokens ?? 0, costUsd]
    );
    saveDb();

    eventBus.publish(params.projectId, "cost-update", {
      projectId: params.projectId, agentId: params.agentId, costUsd,
      model: params.model, timestamp: new Date().toISOString(),
    });
  }

  /** Get total cost for a project */
  getTotalCost(projectId: string): number {
    const db = getDb();
    const stmt = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE project_id = ?");
    stmt.bind([projectId]);
    stmt.step();
    const total = stmt.getAsObject().total as number;
    stmt.free();
    return total;
  }

  /** Get cost breakdown by agent */
  getCostByAgent(projectId: string): Record<string, number> {
    const db = getDb();
    const stmt = db.prepare(
      "SELECT agent_id, COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE project_id = ? GROUP BY agent_id"
    );
    stmt.bind([projectId]);
    const breakdown: Record<string, number> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      breakdown[(row.agent_id as string) || "unknown"] = row.total as number;
    }
    stmt.free();
    return breakdown;
  }
}
