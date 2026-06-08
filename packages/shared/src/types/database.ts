// ============================================================
// Database row types — 对齐 SQLite Schema (PRD §4.4)
// ============================================================

import type { AgentModel, AgentRole, AgentRuntime, AgentStatus } from "./agent.js";
import type { TaskPriority, TaskStatus } from "./task.js";
import type { PhaseId, WorkflowStatus, WorkflowType } from "./workflow.js";

// ---- projects ----
export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  worktree_base: string | null;
  claude_md: string | null;
  config: string; // JSON string of ProjectConfig
  created_at: string;
  updated_at: string;
}

// ---- agents ----
export interface AgentRow {
  id: string;
  project_id: string;
  name: string;
  role: AgentRole;
  runtime: AgentRuntime;
  model: AgentModel;
  status: AgentStatus;
  worktree_path: string | null;
  current_task_id: string | null;
  capabilities: string; // JSON string[]
  last_heartbeat: string | null;
  permission_mode: string;
  pid: number | null;
  created_at: string;
}

// ---- agent_capabilities ----
export interface AgentCapabilityRow {
  agent_id: string;
  capabilities: string;   // JSON Record<string,number>
  success_rate: string;   // JSON Record<string,number>
  total_completed: number;
  total_failed: number;
  updated_at: string;
}

// ---- tasks ----
export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  complexity: number | null;
  owner_agent_id: string | null;
  parent_task_id: string | null;
  input: string | null;
  expected_output: string | null;
  acceptance_criteria: string | null;
  required_capabilities: string; // JSON string[]
  version: number;
  retry_count: number;
  max_retries: number;
  timeout_ms: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ---- task_dependencies ----
export interface TaskDependencyRow {
  task_id: string;
  depends_on_id: string;
}

// ---- cost_events ----
export interface CostEventRow {
  id: number;
  project_id: string;
  agent_id: string | null;
  task_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  timestamp: string;
}

// ---- messages ----
export interface MessageRow {
  id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  type: "task" | "result" | "question" | "interrupt" | "status" | "broadcast";
  content: string;
  metadata: string; // JSON
  read_by: string;   // JSON string[]
  created_at: string;
}

// ---- workflows ----
export interface WorkflowRow {
  id: string;
  project_id: string;
  type: WorkflowType;
  current_phase: PhaseId;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

// ---- error_events ----
export interface ErrorEventRow {
  id: number;
  project_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  type: "agent_crash" | "db_error" | "heartbeat_timeout" | "worktree_error" | "provider_error";
  message: string;
  stack: string | null;
  timestamp: string;
}
