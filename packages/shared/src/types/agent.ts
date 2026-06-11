// ============================================================
// Agent types — 对齐 SQL agents + agent_capabilities 表 + Ed25519 身份
// ============================================================

/** Agent 内置角色 + 允许自定义 */
export type AgentRole =
  | "orchestrator"
  | "product-manager"
  | "software-architect"
  | "ui-designer"
  | "database-optimizer"
  | "backend-architect"
  | "frontend-developer"
  | "frontend-architect"
  | "devops-automator"
  | "testing-evidence-collector"
  | "testing-qa"
  | "security-engineer"
  | "code-reviewer"
  | "reality-checker"
  | "technical-writer"
  | "custom";

/** Agent 运行时 */
export type AgentRuntime = "claude-code" | "hermes" | "openclaw";

/** Agent 模型 */
export type AgentModel = "opus" | "sonnet" | "haiku";

/** Agent 会话状态（对齐 PRD §0.7 状态机） */
export type AgentStatus =
  | "idle"
  | "busy"
  | "offline"
  | "error"
  | "paused";

/** Agent 实例 — 对齐 agents 表 */
export interface AgentInstance {
  id: string;
  project_id: string;
  name: string;             // 中文名
  role: AgentRole;
  runtime: AgentRuntime;
  model: AgentModel;
  status: AgentStatus;
  worktree_path: string | null;
  current_task_id: string | null;
  capabilities: string[];
  last_heartbeat: string | null;
  permission_mode: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  pid: number | null;
  created_at: string;
}

/** Agent 能力统计 — 对齐 agent_capabilities 表 */
export interface AgentCapabilityStats {
  agent_id: string;
  capabilities: Record<string, number>;    // tag -> EMA 成功率
  success_rate: Record<string, number>;    // tag -> 成功率
  total_completed: number;
  total_failed: number;
  updated_at: string;
}

/** Ed25519 Agent 身份凭证 */
export interface AgentIdentity {
  agentId: string;
  fingerprint: string;       // SHA-256(公钥) 前16字符 hex
  publicKey: string;         // JWK 格式
  gpgSubkeyId?: string;      // GPG 子密钥ID（可选）
  created_at: string;
}

/** 角色到推荐模型的映射 */
export const ROLE_MODEL_MAP: Partial<Record<AgentRole, AgentModel>> & Record<string, AgentModel> = {
  orchestrator: "sonnet", "product-manager": "sonnet", "software-architect": "opus",
  "ui-designer": "sonnet", "database-optimizer": "sonnet", "backend-architect": "sonnet",
  "frontend-developer": "sonnet", "frontend-architect": "sonnet", "devops-automator": "sonnet",
  "testing-evidence-collector": "sonnet", "testing-qa": "sonnet", "security-engineer": "sonnet",
  "code-reviewer": "sonnet", "reality-checker": "opus", "technical-writer": "sonnet",
  custom: "sonnet",
};

/** 角色中文名 */
export const ROLE_LABEL_ZH: Record<AgentRole, string> = {
  orchestrator: "总指挥",
  "product-manager": "产品经理",
  "software-architect": "软件架构师",
  "ui-designer": "UI设计师",
  "database-optimizer": "数据库优化师",
  "backend-architect": "后端工程师",
  "frontend-developer": "前端工程师", "frontend-architect": "前端架构师",
  "devops-automator": "DevOps自动化", "testing-evidence-collector": "QA取证专家",
  "testing-qa": "QA测试员", "security-engineer": "安全工程师",
  "code-reviewer": "代码审查员", "reality-checker": "验收官",
  "technical-writer": "技术写手", custom: "自定义",
};

/** Agent 注册输入 */
export interface CreateAgentInput {
  project_id: string;
  name: string;
  role: AgentRole;
  runtime?: AgentRuntime;
  model?: AgentModel;
  capabilities?: string[];
  permission_mode?: AgentInstance["permission_mode"];
}
