// ── Workflow Engine — Dark Factory 11-Phase automation ─────
// Auto-advances phases, dispatches agents, handles gates

import { getDb, saveDb } from "../db/connection.js";
import { TaskGraph } from "./task-graph.js";
import { STANDARD_PHASES, type PhaseId, type PhaseProgress } from "@agent-swarm/shared";

export class WorkflowEngine {
  constructor(private graph: TaskGraph) {}

  /** Start a new workflow for a project */
  startWorkflow(projectId: string, type: string = "standard-dev-team"): { id: string; phases: PhaseProgress[] } {
    const db = getDb();
    const id = `wf-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    db.run("INSERT INTO workflows (id, project_id, type, current_phase, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      [id, projectId, type, 0, "running", now, now]);
    saveDb();

    const phases = STANDARD_PHASES.map(p => ({
      phaseId: p.id, phaseName: p.name,
      status: (p.id === 0 ? "running" : "pending") as PhaseProgress["status"],
      agentId: null, startedAt: p.id === 0 ? now : null,
      completedAt: null, retryCount: 0, errorMessage: null,
    }));

    return { id, phases };
  }

  /** Get current workflow status */
  getWorkflow(workflowId: string) {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM workflows WHERE id = ?");
    stmt.bind([workflowId]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject(); stmt.free();
    return row;
  }

  /**
   * Advance a workflow phase — called when a phase completes.
   * Checks if the next phase(s) can start based on dependency resolution.
   */
  advancePhase(workflowId: string, completedPhaseId: PhaseId): PhaseProgress[] {
    const wf = this.getWorkflow(workflowId);
    if (!wf || (wf as any).status !== "running") return [];

    const completedPhase = STANDARD_PHASES.find(p => p.id === completedPhaseId);
    if (!completedPhase) return [];

    // Find phases whose dependencies are now all met
    const allCompleted = new Set<PhaseId>([completedPhaseId]);
    // Get already-completed phases from DB
    const db = getDb();
    const stmt = db.prepare("SELECT current_phase FROM workflows WHERE id = ?");
    stmt.bind([workflowId]);
    if (stmt.step()) (stmt.getAsObject().current_phase as number); // current completed set
    stmt.free();

    const nextPhases = STANDARD_PHASES.filter(p => {
      if (p.id === completedPhaseId) return false;
      // Check if all dependencies are met
      return p.dependsOn.every(depId => allCompleted.has(depId));
    });

    return nextPhases.map(p => ({
      phaseId: p.id, phaseName: p.name, status: "running" as const,
      agentId: null, startedAt: new Date().toISOString(),
      completedAt: null, retryCount: 0, errorMessage: null,
    }));
  }

  /**
   * Create tasks for a phase — decomposes the phase work into trackable tasks.
   */
  createPhaseTasks(projectId: string, phaseId: PhaseId): string[] {
    const phase = STANDARD_PHASES.find(p => p.id === phaseId);
    if (!phase) return [];

    const taskIds: string[] = [];

    // Create a task for the phase's agent role
    const task = this.graph.createTask({
      project_id: projectId,
      title: `[Phase ${phaseId}] ${phase.name}`,
      description: phase.description,
      priority: 1,
      required_capabilities: [phase.agentRole],
      max_retries: phase.maxRetries,
    });
    taskIds.push(task.id);

    return taskIds;
  }

  /** Check if a phase can be auto-advanced (all deps met) */
  canAdvancePhase(phaseId: PhaseId, completedPhaseIds: Set<PhaseId>): boolean {
    const phase = STANDARD_PHASES.find(p => p.id === phaseId);
    if (!phase) return false;
    return phase.dependsOn.every(depId => completedPhaseIds.has(depId));
  }

  /** Get all phases with their dependency/parallelism info */
  getPhasePlan() {
    return STANDARD_PHASES.map(p => ({
      ...p,
      parallelOpportunities: p.parallelWith.length,
    }));
  }
}
