// ============================================================
// Workflow types — 11 Phase 全自主工作流引擎
// ============================================================

/** 工作流类型 */
export type WorkflowType = "standard-dev-team";

/** 工作流状态 */
export type WorkflowStatus = "running" | "paused" | "completed" | "failed";

/** 11 Phase 定义 */
export type PhaseId = number; // 0-11

export interface WorkflowPhase {
  id: PhaseId;
  name: string;              // 中文名称
  agentRole: string;         // 负责的 Agent 角色
  description: string;
  /** 依赖的 Phase ID（完成后方可启动） */
  dependsOn: PhaseId[];
  /** 可并行的 Phase ID */
  parallelWith: PhaseId[];
  /** 是否自动推进 */
  autoAdvance: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}

/** 工作流实例 */
export interface Workflow {
  id: string;
  project_id: string;
  type: WorkflowType;
  current_phase: PhaseId;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

/** Phase 状态 */
export type PhaseStatus = "pending" | "running" | "completed" | "failed" | "blocked";

/** Phase 进度 */
export interface PhaseProgress {
  phaseId: PhaseId;
  phaseName: string;
  status: PhaseStatus;
  agentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  errorMessage: string | null;
}

/** 标准 11 Phase 定义 */
export const STANDARD_PHASES: WorkflowPhase[] = [
  { id: 0,  name: "创建项目目录",     agentRole: "orchestrator",     description: "初始化项目目录+契约文件占位",         dependsOn: [],      parallelWith: [],    autoAdvance: true, maxRetries: 1 },
  { id: 1,  name: "产品需求文档",     agentRole: "product-manager",   description: "自动生成PRD.md",                      dependsOn: [0],     parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 2,  name: "技术架构契约",     agentRole: "software-architect",description: "API_CONTRACT/DB_SCHEMA/TECH_SPEC",   dependsOn: [1],     parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 2.5,name: "UI设计系统",       agentRole: "ui-designer",       description: "DESIGN_SYSTEM.md + CSS变量",         dependsOn: [1],     parallelWith: [4],   autoAdvance: true, maxRetries: 2 },
  { id: 3,  name: "任务拆分",         agentRole: "orchestrator",      description: "自动拆解任务清单+分配Agent",         dependsOn: [2],     parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 4,  name: "数据库Migration",  agentRole: "database-optimizer",description: "数据库迁移脚本",                     dependsOn: [2],     parallelWith: [2.5], autoAdvance: true, maxRetries: 3 },
  { id: 5,  name: "后端实现+QA",      agentRole: "backend-architect", description: "后端API实现+契约逐条验证",           dependsOn: [3,4],   parallelWith: [6],   autoAdvance: true, maxRetries: 3 },
  { id: 6,  name: "前端实现+QA",      agentRole: "frontend-developer",description: "前端UI实现+接口调用验证",           dependsOn: [3,2.5], parallelWith: [5],   autoAdvance: true, maxRetries: 3 },
  { id: 7,  name: "安全审查",         agentRole: "security-engineer", description: "OWASP扫描+密钥泄露检测",            dependsOn: [5,6],   parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 8,  name: "代码审查",         agentRole: "code-reviewer",     description: "正确性+可维护性+性能审查",           dependsOn: [7],     parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 9,  name: "DevOps部署",       agentRole: "devops-automator",  description: "Dockerfile+部署路径检查",            dependsOn: [8],     parallelWith: [],    autoAdvance: true, maxRetries: 2 },
  { id: 10, name: "最终验收",         agentRole: "reality-checker",   description: "PRD 100%功能对照+端到端验证",       dependsOn: [9],     parallelWith: [],    autoAdvance: true, maxRetries: 1 },
  { id: 11, name: "文档生成",         agentRole: "technical-writer",  description: "README + API文档 + 部署指南",        dependsOn: [10],    parallelWith: [],    autoAdvance: true, maxRetries: 2 },
];

/** 全自主门禁规则 */
export interface GateRule {
  phaseId: PhaseId;
  gateName: string;
  agentRole: string;
  failAction: "retry" | "escalate" | "block";
  maxRetries: number;
  escalateModel?: string;
}
