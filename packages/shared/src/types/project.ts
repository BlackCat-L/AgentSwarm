// ============================================================
// Project types — 对齐 SQL projects 表
// ============================================================

/** 项目配置 */
export interface Project {
  id: string;
  name: string;
  path: string;              // 工作目录绝对路径
  worktree_base: string | null;
  claude_md: string | null;
  config: ProjectConfig;
  created_at: string;
  updated_at: string;
}

/** 项目配置项 */
export interface ProjectConfig {
  /** 全局并发上限 */
  maxAgents?: number;
  /** per-runtime 上限 */
  maxPerRuntime?: number;
  /** Agent 默认超时（分钟） */
  defaultTimeoutMinutes?: number;
  /** 成本预算上限（USD） */
  budgetLimitUsd?: number;
  /** 成本数据保留天数 */
  costRetentionDays?: number;
  /** 自动清理 worktree 天数 */
  worktreeCleanupDays?: number;
  /** 默认运行时 */
  defaultRuntime?: "claude-code" | "hermes" | "openclaw";
  /** 默认模型 */
  defaultModel?: "opus" | "sonnet" | "haiku";
  /** 通知 webhook URL */
  webhookUrl?: string;
}

/** 创建项目输入 */
export interface CreateProjectInput {
  name: string;
  path: string;
  worktree_base?: string;
  config?: Partial<ProjectConfig>;
}

/** 更新项目输入 */
export interface UpdateProjectInput {
  name?: string;
  config?: Partial<ProjectConfig>;
}
