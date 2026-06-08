// ── Agent Runner — lifecycle manager ──────────────────────
// start/stop/killAll + crash recovery (exponential backoff) + heartbeat SSE

import { ProviderRegistry } from "../providers/registry.js";
import { RuntimePool } from "./runtime-pool.js";
import { eventBus } from "../sse/event-bus.js";
import type { SpawnRequest } from "./runtime-pool.js";

const HEARTBEAT_MS = 30_000;
const MAX_RESTART = 3;
const BACKOFF_BASE = 1000;

export interface RunConfig {
  taskId: string; sessionId: string; agentId: string; projectId: string;
  prompt: string; cwd: string; model?: string; timeoutMinutes?: number;
  onCleanup?: () => void;
}

export class AgentRunner {
  private heartbeats = new Map<string, ReturnType<typeof setInterval>>();
  private restartCounts = new Map<string, number>();

  constructor(
    private registry: ProviderRegistry,
    private pool: RuntimePool
  ) {}

  async start(config: RunConfig): Promise<SpawnRequest> {
    const resolved = await this.registry.resolveProvider();
    if (!resolved) throw new Error("No available provider");

    const handle = await resolved.provider.execute({
      prompt: config.prompt, cwd: config.cwd,
      sessionId: config.sessionId, model: config.model,
    });

    const req: SpawnRequest = {
      taskId: config.taskId, sessionId: config.sessionId,
      agentId: config.agentId, providerName: resolved.provider.name,
      cwd: config.cwd, handle, timeoutMinutes: config.timeoutMinutes,
      onCleanup: config.onCleanup,
    };

    await this.pool.spawnAgent(req);
    this._startHeartbeat(config);
    this.restartCounts.set(config.taskId, 0);

    // Async crash monitoring
    this._monitorCrash(config, resolved.provider.name).catch(() => {});

    eventBus.publish(config.projectId, "agent-status", {
      agentId: config.agentId, taskId: config.taskId, status: "started",
    });
    return req;
  }

  async stop(taskId: string): Promise<boolean> {
    this._stopHeartbeat(taskId);
    return this.pool.killTask(taskId);
  }

  async killAll(): Promise<number> {
    for (const [taskId] of this.heartbeats) this._stopHeartbeat(taskId);
    return this.pool.killAll();
  }

  // ── Crash recovery ──────────────────────────────────────

  private async _monitorCrash(config: RunConfig, _providerName: string): Promise<void> {
    // After a short delay, check if the agent is still in the pool
    await new Promise((r) => setTimeout(r, 5000));
    const count = this.restartCounts.get(config.taskId) ?? 0;
    if (!this.pool.hasTask(config.taskId) && count < MAX_RESTART) {
      await this._attemptRestart(config, count);
    }
  }

  private async _attemptRestart(config: RunConfig, prevCount: number): Promise<void> {
    const newCount = prevCount + 1;
    const delay = BACKOFF_BASE * Math.pow(2, prevCount);
    console.warn(`[AgentRunner] Restart ${config.taskId} attempt ${newCount}/${MAX_RESTART} in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));

    const resolved = await this.registry.resolveProvider();
    if (!resolved) return;

    this.restartCounts.set(config.taskId, newCount);
    const handle = await resolved.provider.execute({
      prompt: config.prompt, cwd: config.cwd,
      sessionId: config.sessionId, model: config.model,
    });

    await this.pool.spawnAgent({
      taskId: config.taskId, sessionId: config.sessionId, agentId: config.agentId,
      providerName: resolved.provider.name, cwd: config.cwd, handle,
      timeoutMinutes: config.timeoutMinutes, onCleanup: config.onCleanup,
    });

    eventBus.publish(config.projectId, "agent-status", {
      agentId: config.agentId, taskId: config.taskId, status: "restarted", attempt: newCount,
    });
  }

  private _startHeartbeat(config: RunConfig): void {
    this.heartbeats.set(config.taskId, setInterval(() => {
      if (this.pool.hasTask(config.taskId)) {
        eventBus.publish(config.projectId, "agent-heartbeat", {
          agentId: config.agentId, taskId: config.taskId, timestamp: new Date().toISOString(),
        });
      } else this._stopHeartbeat(config.taskId);
    }, HEARTBEAT_MS));
  }

  private _stopHeartbeat(taskId: string): void {
    const t = this.heartbeats.get(taskId);
    if (t) { clearInterval(t); this.heartbeats.delete(taskId); }
  }
}
