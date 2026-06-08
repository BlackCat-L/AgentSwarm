// ── Kill Switch — emergency stop all agents ────────────────

import { RuntimePool } from "./runtime-pool.js";
import { TaskGraph } from "./task-graph.js";
import { eventBus } from "../sse/event-bus.js";

export class KillSwitch {
  private isKilled = false;

  constructor(private pool: RuntimePool, private graph: TaskGraph) {}

  /** Check if kill switch is active */
  get activated(): boolean { return this.isKilled; }

  /** Activate kill switch — stop all agents and release tasks */
  async activate(reason: string = "manual"): Promise<number> {
    if (this.isKilled) return 0;
    this.isKilled = true;

    const taskIds = this.pool.getActiveTaskIds();
    const killed = await this.pool.killAll();

    // Release tasks from blocked agents
    for (const taskId of taskIds) {
      try {
        const task = this.graph.getTask(taskId);
        if (task && task.status === "InDev") {
          this.graph.updateTask(taskId, {
            status: "Backlog",
            owner_agent_id: null,
            version: task.version,
            error_message: `Kill switch activated: ${reason}`,
          });
        }
      } catch { /* continue */ }
    }

    // Broadcast kill-switch event
    eventBus.broadcast("kill-switch", { reason, killed, timestamp: new Date().toISOString() });

    return killed;
  }

  /** Deactivate kill switch */
  deactivate(): void {
    this.isKilled = false;
  }
}
