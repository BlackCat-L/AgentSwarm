// ============================================================
// RateLimiter — per-runtime pause/resume with persistence
// Reference: PRD §0.8 并发控制策略
// ============================================================

import { getDb, saveDb } from "../db/connection.js";

interface RuntimeState {
  paused: boolean;
  pausedAt: string | null;
  resetAt: string | null;
}

const KEY_PREFIX = "rate_limit:";

export class RateLimiter {
  private state = new Map<string, RuntimeState>();

  /** Load saved state from DB on startup */
  loadFromDb(): void {
    const db = getDb();
    const stmt = db.prepare(
      "SELECT content FROM messages WHERE id LIKE ? AND type = 'rate_limit'"
    );
    stmt.bind([`${KEY_PREFIX}%`]);

    const results: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row.content as string);
    }
    stmt.free();

    if (results.length === 0) return;

    for (const raw of results) {
      try {
        const data = JSON.parse(raw) as {
          runtime: string;
          paused: boolean;
          pausedAt: string | null;
          resetAt: string | null;
        };
        if (data.paused && data.resetAt) {
          // If reset time has passed, auto-unpause
          if (new Date(data.resetAt) <= new Date()) {
            data.paused = false;
            data.pausedAt = null;
            data.resetAt = null;
          }
        }
        this.state.set(data.runtime, {
          paused: data.paused,
          pausedAt: data.pausedAt,
          resetAt: data.resetAt,
        });
      } catch { /* skip malformed rows */ }
    }
  }

  /** Check if a runtime is currently paused (rate limited) */
  isRuntimePaused(runtime: string): boolean {
    const entry = this.state.get(runtime);
    if (!entry || !entry.paused) return false;

    // Auto-unpause if reset time has passed
    if (entry.resetAt && new Date(entry.resetAt) <= new Date()) {
      this.clearPause(runtime);
      return false;
    }

    return true;
  }

  /** Pause a runtime due to rate limiting */
  onRateLimited(runtime: string, resetAt: string): void {
    const now = new Date().toISOString();
    const entry: RuntimeState = {
      paused: true,
      pausedAt: now,
      resetAt,
    };
    this.state.set(runtime, entry);
    this._persist(runtime, entry);
  }

  /** Clear pause state (manual or auto after resetAt) */
  clearPause(runtime: string): void {
    this.state.delete(runtime);
    this._removePersist(runtime);
  }

  /** Get all paused runtimes with their reset times */
  getPausedRuntimes(): { runtime: string; resetAt: string }[] {
    const result: { runtime: string; resetAt: string }[] = [];
    for (const [runtime, entry] of this.state) {
      if (entry.paused && entry.resetAt) {
        result.push({ runtime, resetAt: entry.resetAt });
      }
    }
    return result;
  }

  private _persist(runtime: string, state: RuntimeState): void {
    const db = getDb();
    db.run(
      `INSERT OR REPLACE INTO messages (id, type, content, created_at)
       VALUES (?, 'rate_limit', ?, datetime('now'))`,
      [`${KEY_PREFIX}${runtime}`, JSON.stringify({ runtime, ...state })]
    );
    saveDb();
  }

  private _removePersist(runtime: string): void {
    const db = getDb();
    db.run("DELETE FROM messages WHERE id = ?", [`${KEY_PREFIX}${runtime}`]);
    saveDb();
  }
}
