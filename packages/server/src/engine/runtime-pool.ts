// ============================================================
// RuntimePool — Concurrent agent process pool
// Manages AgentProcess lifecycles, per-runtime counts and timeouts.
// Reference: PRD §0.8 RuntimePool, agent-kanban runtimePool.ts
// ============================================================

import type { AgentHandle } from "@agent-swarm/shared";

// ── Types ──────────────────────────────────────────────────

export interface SpawnRequest {
  taskId: string;
  sessionId: string;
  agentId: string;
  providerName: string;
  cwd: string;
  handle: AgentHandle;
  timeoutMinutes?: number;
  onCleanup?: () => void;
}

export interface AgentProcess {
  taskId: string;
  sessionId: string;
  agentId: string;
  providerName: string;
  cwd: string;
  handle: AgentHandle;
  startedAt: string;
  timeoutTimer: ReturnType<typeof setTimeout>;
  rateLimited: boolean;
  resultReceived: boolean;
  lastCostUsd: number;
  aborted: boolean;
  onCleanup?: () => void;
}

export interface PoolStats {
  activeCount: number;
  byRuntime: Record<string, number>;
  taskIds: string[];
}

// ── Defaults ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES = 120; // 2 hours

// ── RuntimePool ────────────────────────────────────────────

export class RuntimePool {
  private agents = new Map<string, AgentProcess>();

  /** Total active agent count */
  get activeCount(): number {
    return this.agents.size;
  }

  /** Active count for a specific runtime */
  activeCountForRuntime(runtime: string): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.providerName === runtime) count++;
    }
    return count;
  }

  /** Check if a task is already being executed */
  hasTask(taskId: string): boolean {
    return this.agents.has(taskId);
  }

  /** Get list of active task IDs */
  getActiveTaskIds(): string[] {
    return [...this.agents.keys()];
  }

  /** Get pool statistics */
  getStats(): PoolStats {
    const byRuntime: Record<string, number> = {};
    for (const agent of this.agents.values()) {
      byRuntime[agent.providerName] = (byRuntime[agent.providerName] ?? 0) + 1;
    }
    return {
      activeCount: this.agents.size,
      byRuntime,
      taskIds: [...this.agents.keys()],
    };
  }

  /**
   * Spawn a new agent and register it in the pool.
   * Starts the event loop that consumes AgentOutputEvents.
   */
  async spawnAgent(req: SpawnRequest): Promise<AgentProcess> {
    if (this.agents.has(req.taskId)) {
      throw new Error(`Task ${req.taskId} is already running`);
    }

    const timeoutMinutes = req.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
    const startedAt = new Date().toISOString();

    const entry: AgentProcess = {
      taskId: req.taskId,
      sessionId: req.sessionId,
      agentId: req.agentId,
      providerName: req.providerName,
      cwd: req.cwd,
      handle: req.handle,
      startedAt,
      timeoutTimer: setTimeout(() => this._onTimeout(req.taskId), timeoutMinutes * 60_000),
      rateLimited: false,
      resultReceived: false,
      lastCostUsd: 0,
      aborted: false,
      onCleanup: req.onCleanup,
    };

    this.agents.set(req.taskId, entry);

    // Start consuming events in background (don't await)
    this._runEventLoop(req.taskId).catch(() => {
      // Error handled inside _runEventLoop
    });

    return entry;
  }

  /**
   * Kill a single task — abort the agent handle and clean up.
   */
  async killTask(taskId: string): Promise<boolean> {
    const entry = this.agents.get(taskId);
    if (!entry) return false;

    await this._cleanup(entry);
    return true;
  }

  /**
   * Kill all running agents — emergency stop (Kill Switch).
   */
  async killAll(): Promise<number> {
    const taskIds = [...this.agents.keys()];
    const promises = taskIds.map((id) => this.killTask(id));
    await Promise.allSettled(promises);
    return taskIds.length;
  }

  /**
   * Send a message to a running agent.
   */
  async sendToAgent(taskId: string, message: string): Promise<boolean> {
    const entry = this.agents.get(taskId);
    if (!entry || entry.aborted) return false;
    try {
      await entry.handle.send(message);
      return true;
    } catch {
      return false;
    }
  }

  // ── Internal ────────────────────────────────────────────

  /** Background event loop — consumes AsyncGenerator, handles errors. */
  private async _runEventLoop(taskId: string): Promise<void> {
    const entry = this.agents.get(taskId);
    if (!entry) return;

    try {
      for await (const event of entry.handle.events) {
        if (entry.aborted) break;

        // Track costs
        if (event.type === "turn_end" && typeof event.cost === "number") {
          entry.lastCostUsd += event.cost;
        }

        // Detect rate limiting
        if (event.type === "turn_rate_limit") {
          entry.rateLimited = true;
        }

        // Detect completion
        if (event.type === "completed") {
          entry.resultReceived = true;
        }

        // Subprocess error
        if (event.type === "error") {
          // Don't abort on first error — agent may recover
        }
      }
    } catch (err) {
      // Iterator error — mark as crashed
      if (!entry.aborted) {
        console.error(`[RuntimePool] Agent ${taskId} event loop error:`, err);
      }
    } finally {
      // Auto-cleanup when iterator ends
      if (this.agents.has(taskId)) {
        await this._cleanup(entry);
      }
    }
  }

  /** Timeout handler — aborts the agent and removes from pool. */
  private async _onTimeout(taskId: string): Promise<void> {
    const entry = this.agents.get(taskId);
    if (!entry) return;

    console.warn(`[RuntimePool] Task ${taskId} timed out after ${DEFAULT_TIMEOUT_MINUTES} minutes`);
    await this._cleanup(entry);
  }

  /** Clean up an agent entry — abort, clear timer, remove from pool. */
  private async _cleanup(entry: AgentProcess): Promise<void> {
    if (entry.aborted) return;
    entry.aborted = true;

    // Clear timeout
    clearTimeout(entry.timeoutTimer);

    // Abort the agent handle
    try {
      await entry.handle.abort();
    } catch {
      // Best-effort abort
    }

    // Call cleanup callback (e.g., worktree removal)
    if (entry.onCleanup) {
      try {
        entry.onCleanup();
      } catch {
        // Best-effort cleanup
      }
    }

    // Remove from pool
    this.agents.delete(entry.taskId);
  }
}
