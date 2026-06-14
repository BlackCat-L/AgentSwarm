// ============================================================
// Task types — 对齐 SQL tasks 表 + TaskGraph DAG 引擎
// ============================================================

/** 看板7列状态 */
export type TaskStatus =
  | "Backlog"
  | "InDev"
  | "ReadyForTest"
  | "InFix"
  | "ReadyForDeploy"
  | "Done"
  | "Blocked"
  | "Cancelled";

/** 任务优先级 0（紧急）→ 4（低） */
export type TaskPriority = 0 | 1 | 2 | 3 | 4;

/** 复杂度评分 1（单行修复）→ 10（全栈项目） */
export type ComplexityScore = number;

/** 任务节点 — 对齐 tasks 表全部列 + 运行时扩展 */
export interface TaskNode {
  // ---- 主键 ----
  id: string;

  // ---- 归属 ----
  project_id: string;

  // ---- 内容 ----
  title: string;
  description: string;

  // ---- 状态 ----
  status: TaskStatus;
  priority: TaskPriority;
  complexity: ComplexityScore | null;

  // ---- 分配 ----
  owner_agent_id: string | null;
  parent_task_id: string | null;

  // ---- 输入/输出 ----
  input: string | null;
  expected_output: string | null;
  acceptance_criteria: string | null;

  // ---- 能力标签 ----
  required_capabilities: string[]; // e.g. ["backend","database"]

  // ---- 并发控制 ----
  version: number; // 乐观锁
  retry_count: number;
  max_retries: number;

  // ---- 超时 ----
  timeout_ms: number | null;

  // ---- 错误 ----
  error_message: string | null;

  // ---- 阶段 ----
  phase: string | null;

  // ---- 时间戳 ----
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** 任务依赖边 */
export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
}

/** 看板列定义 */
export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: TaskNode[];
}

/** 看板视图 */
export interface KanbanBoard {
  projectId: string;
  columns: KanbanColumn[];
}

/** 合法状态流转矩阵——禁止非法拖拽 */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Backlog: ["InDev"],
  InDev: ["ReadyForTest", "InFix", "Blocked", "Done"],  // 3-stage pipeline: InDev→Done when all evaluations pass
  ReadyForTest: ["InFix", "ReadyForDeploy", "InDev"],    // InDev: generator reset awaiting evaluators
  InFix: ["ReadyForTest", "InDev"],
  ReadyForDeploy: ["Done", "Blocked"],
  Done: [],
  Blocked: ["InDev"],
  Cancelled: [],
};

/** 判断流转是否合法 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 创建任务输入 */
export interface CreateTaskInput {
  project_id: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  complexity?: ComplexityScore;
  required_capabilities?: string[];
  depends_on?: string[];
  acceptance_criteria?: string;
  expected_output?: string;
  max_retries?: number;
  timeout_ms?: number;
  /** 所属阶段名称（来自 analyzeComplexity 的 estimatedPhases） */
  phase?: string;
  /** 父任务ID（3-stage pipeline：评估子任务指向生成器父任务） */
  parent_task_id?: string;
}

/** 更新任务输入 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  owner_agent_id?: string | null;
  version: number; // 乐观锁必需
  error_message?: string | null;
  retry_count?: number;
}
