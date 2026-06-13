# Agent Swarm 三阶段管道与 12-Agent 执行体系

> 输入需求 → Planner 分析拆解 → Generator 并行实现 → Evaluator 审查验证 → Done

---

## 1. 12-Agent 角色体系

### 完整列表

| # | 角色 | Role ID | 模型 | 能力标签 | 阶段 |
|---|------|---------|------|---------|:--:|
| 1 | 编排官 | `orchestrator` | pro | `architecture` | Planner |
| 2 | 产品经理 | `product-manager` | pro | `architecture` | Planner |
| 3 | 软件架构师 | `software-architect` | pro | `architecture`, `frontend` | Planner |
| 4 | 后端架构师 | `backend-architect` | pro | `architecture` | Generator |
| 5 | 前端架构师 | `frontend-architect` | pro | `frontend`, `architecture` | Generator |
| 6 | 数据库优化师 | `database-optimizer` | pro | `architecture`, `performance` | Generator |
| 7 | 安全工程师 | `security-engineer` | pro | `security` | Evaluator |
| 8 | 代码审查师 | `code-reviewer` | pro | `testing` | Evaluator |
| 9 | UI设计师 | `ui-designer` | flash | `frontend` | Generator |
| 10 | 前端开发 | `frontend-developer` | flash | `frontend` | Generator |
| 11 | DevOps自动化 | `devops-automator` | flash | `architecture` | Generator |
| 12 | 测试QA | `testing-qa` | flash | `testing` | Evaluator |

### 能力标签词汇（5 个规范标签）

| 标签 | 涵盖范围 | 匹配 Agent |
|------|---------|-----------|
| `frontend` | 前端/UI/组件/样式/交互 | UI设计师、前端开发、前端架构师 |
| `architecture` | 架构设计/后端逻辑/API/数据库/DevOps/模块划分 | 编排官、产品经理、软件架构师、后端架构师、数据库优化师、DevOps |
| `testing` | 测试/验证/QA/代码审查 | 测试QA、代码审查师 |
| `performance` | 性能优化/缓存/加速 | 数据库优化师 |
| `security` | 安全/认证/授权/加密/权限 | 安全工程师 |

### Agent → Skill 映射

每个 Agent 在 `ROLE_SKILL_INJECTION` 中绑定了专属 Skill 组合，同时在 `SKILL_USAGE_GUIDE` 中共享通用 Skill 表。

| # | Agent | 绑定 Skills | 阶段 |
|---|-------|------------|:--:|
| 1 | 编排官 | `swarm`, `agent-optimizer`, `pm-perspective`, `claude-config-advisor`, `auto-agent` | Planner |
| 2 | 产品经理 | `pm-perspective`, `auto-agent` (sprint-contract), `game-designer-toolkit`, `huo15-mind-map` | Planner |
| 3 | 软件架构师 | `agent-optimizer` (12-Factor), `auto-agent` (strict-mode), `mermaid`, `agent-md-advisor` | Planner |
| 4 | 后端架构师 | `auto-agent` (6-step), `agent-optimizer`, `review-agent` (evaluator), `moark-doc-extraction` | Generator |
| 5 | 前端架构师 | `auto-agent` (6-step), `agent-optimizer`, `claude-config-advisor`, `mermaid` | Generator |
| 6 | 数据库优化师 | `auto-agent` (6-step), `agent-optimizer` (verify) | Generator |
| 7 | 安全工程师 | `security-hardening`, `auto-agent` (verify), `review-agent`, `tavily` | Evaluator |
| 8 | 代码审查师 | `review-agent`, `code-review-unity`, `auto-agent` (strict-evaluator), `git` | Evaluator |
| 9 | UI设计师 | `auto-agent` (6-step), `pm-perspective` (user-stories) | Generator |
| 10 | 前端开发 | `auto-agent` (6-step), `code-review-unity` (principles), `review-agent` | Generator |
| 11 | DevOps自动化 | `auto-agent` (6-step), `security-hardening`, `claude-config-advisor`, `git` | Generator |
| 12 | 测试QA | `auto-agent` (strict-evaluator), `review-agent`, `pm-perspective` | Evaluator |

### 通用 Skill 表 (SKILL_USAGE_GUIDE)

注入到**每一个** Agent prompt 中，按场景主动触发：

| 场景 | Skill | 触发条件 |
|------|-------|---------|
| 代码审查 | `code-review` | 完成任何代码改动后 |
| 安全审查 | `security-review` | 涉及 auth/data/input 改动 |
| 代码简化 | `simplify` | 代码完成，检查冗余 |
| Git 操作 | `git` | commit/branch/merge/PR |
| 流程图/架构图 | `mermaid` | 画流程/架构/时序/ER 图 |
| 思维导图 | `huo15-mind-map` | 头脑风暴/知识整理 |
| 网络搜索 | `tavily` | 查资料/调研/最新信息 |
| 文档提取 | `moark-doc-extraction` | 读取 PDF/DOCX |
| 提示词优化 | `prompt-optimizer` | 优化 prompt/指令 |
| 产品设计 | `game-designer-toolkit` | 策划案/GDD/系统设计 |
| Agent 配置 | `agent-md-advisor` | 写 CLAUDE.md/AGENTS.md |
| 任务分解 | `auto-agent` | 复杂多步骤任务 |
| C盘清理 | `xiaoliu666` | C盘磁盘清理 |

### 动态技能模块 (SKILL_MODULES)

按任务能力标签自动匹配注入：

| 模块 | 触发标签 | 内容 |
|------|---------|------|
| database | `architecture` | 迁移脚本/主键时间戳/禁止 SELECT * |
| api | `architecture` | RESTful 路径/统一错误格式/分页 |
| security | `security` | 输入验证/二次鉴权/密码哈希 |
| testing | `testing` | 验收标准→测试用例/四类路径覆盖 |
| frontend-ui | `frontend` | 四状态覆盖/卸载监听/响应式 |
| devops | `architecture` | 脚本化/幂等部署/回滚同步 |
| performance | `performance` | 先测量再优化/缓存失效/N+1 |
| architecture | `architecture` | 模块边界/三相似才抽象/设计决策标注 |
| git | `architecture`, `frontend` | 每变更一commit/不amend已推送 |
| documentation | `architecture`, desc>800 | API文档同步/ADR/示例可执行 |
| research | `architecture`, `security`, desc>1000 | 新技术调研/许可证评估 |
| visualization | `architecture`, `frontend` | Mermaid图辅助说明 |
| product-design | 有验收标准 | 回答为谁解决什么问题/验收可验证 |

---

## 2. 三阶段管道

```
                    /swarm 需求
                        │
         ┌──────────────┼──────────────┐
         │              │              │
      Planner        Generator      Evaluator
    (3 agents)      (6 agents)     (3 agents)
         │              │              │
    Sprint Contract  实现代码      审查+验证+安全
```

### 阶段 1: Planner（规划）

**触发**: 自动（每次 `/swarm`）

**执行者**: 编排官（内置 `analyzeComplexity()` + `decomposeTask()`）
- 复杂度 ≥ 7 时，额外创建 **Sprint Contract 任务**分配给产品经理/软件架构师/编排官
- Sprint Contract 产出：需求分析、架构方案、接口契约、任务拆解确认

**流程**:
```
analyzeComplexity()
  → askClaude(deepseek-v4-flash) → 复杂度评分(1-10) + 阶段列表
  → extractJson() 4层策略提取

decomposeTask()
  → askClaude(deepseek-v4-flash) → 子任务列表 + DAG 依赖 + 能力标签
  → 失败时降级: _phaseBasedFallback() 用阶段名创建多任务

_createPlannerTask() [复杂度 ≥ 7]
  → 创建 Sprint Contract 任务 → 全部实现任务依赖此任务
```

### 阶段 2: Generator（生成）

**触发**: 自动（Planner 完成后）

**执行者**: 6 个实现 Agent
- 后端架构师、前端架构师、数据库优化师 → `architecture` 或 `frontend` 标签
- UI设计师、前端开发 → `frontend` 标签
- DevOps自动化 → `architecture` 标签

**分配规则**:
```
selectBestAgent(allAgents, task.required_capabilities)
  → rankAgents() 按 EMA 能力评分排序
  → 当前项目无空闲 Agent → 搜索全部项目
  → 分数相同时按列表顺序（编排官 > 产品经理 > ...）
```

**执行模式**:
- 复杂度 ≥ 3 → **交互模式**（无 `-p` flag），Agent 可调 `Skill()` 等全部工具
- 复杂度 < 3 → **print 模式**（`-p` flag），更快，适合简单任务

**并发控制**: `MAX_CONCURRENT_SPAWNS = 3`，批次间隔 2 秒

**Prompt 注入层级**:
```
Layer 1:  角色身份 (ROLE_SKILL_INJECTION) — 12 角色专属方法论+铁律
Layer 1.5: SKILL_USAGE_GUIDE — 可用 Skills 表 + 触发条件
Layer 2:  工作流 (复杂度选通):
            ≥6 → STRICT_MODE_BY_ROLE[planner|generator|evaluator]
           ≥3 → AUTO_AGENT_WORKFLOW (6步法)
           <3 → 简单纪律
Layer 3:  动态技能模块 (SKILL_MODULES) — 按能力标签匹配
Layer 4:  任务详情 (标题+描述+验收标准+能力标签)
Layer 5:  结构化输出格式
```

### 阶段 3: Evaluator（评估）

**触发**: Generator 任务执行完成后，`createEvaluationTasks()` 自动创建

**执行者**: 3 个评估 Agent

**审查链**:
```
Generator 任务 Done
  │
  ├── ① Code Review → 代码审查师
  │     条件: isGeneratorRole(agent) && complexity >= 3
  │     标准: 四维评分矩阵
  │     cap: testing
  │
  ├── ② Security Review → 安全工程师  [条件触发]
  │     条件: 任务含 security cap 或 auth/login/password 关键词
  │     标准: 威胁面扫描 + 五类检查
  │     cap: security
  │     依赖: Code Review 完成后
  │
  └── ③ QA 验证 → 测试QA
        条件: 同 Code Review
        标准: 验收标准逐条验证 + 四类路径覆盖
        cap: testing
        依赖: Code Review 完成后
```

**四维评分矩阵** (Evaluator 使用):

| 维度 | Hard Threshold | 权重 |
|------|---------------|------|
| 功能正确性 | ≥ 4/5 | 40% |
| 架构合规 | ≥ 3/5 | 25% |
| 代码质量 | ≥ 3/5 | 20% |
| 复用性 | ≥ 3/5 | 15% |

任一维度低于 threshold → FAIL → 退回 Generator 修复。

---

## 3. 质量门禁链

每个任务执行后，自动通过 4 道门禁（`QualityGateService.runGates()`）：

| Gate | 触发条件 | 模型 | 功能 |
|------|---------|------|------|
| Acceptance | 始终 | flash | 审查输出是否满足验收标准 |
| Review | 复杂任务 (>500 字描述) | pro | 对抗性质量检查（逻辑/性能/安全/冗余） |
| Simplify | 输出 >2000 行代码 | flash | 检测重复代码和过度复杂逻辑 |
| Learn | 任何 Gate 失败 | flash | 自动提炼学习规则写入 `.learnings/ERRORS.md` |

全部通过 → Done。任一失败 → InFix（附具体问题和修复建议）。

---

## 4. 完整执行流程

```
POST /api/auto { project_id, title, description }
  │
  ├── 1. Project 存在性检查
  │
  ├── 2. analyzeComplexity()         ← Claude Code (flash)
  │     └→ { score, reasoning, suggestedAgentCount, estimatedPhases }
  │
  ├── 3. autoExecute(complexity)     ← 传递已算复杂度，避免重复
  │     │
  │     ├── 3a. _orchestrateWithComplexity()
  │     │   ├── decomposeTask()      ← Claude Code (flash)
  │     │   ├── _createPlannerTask() [score ≥ 7]
  │     │   ├── createTask() × N (实现任务)
  │     │   └── 设置 DAG 依赖
  │     │
  │     ├── 3b. _getAgents(projectId)
  │     │   └→ 当前项目 0 idle → 搜索全部项目
  │     │
  │     ├── 3c. selectBestAgent() × N
  │     │   └→ rankAgents() → assignTask()
  │     │
  │     ├── 3d. 执行循环 (while remaining > 0)
  │     │   ├── 筛选 ready 任务 (InDev + 依赖满足)
  │     │   ├── 批次执行 (MAX 3 concurrent, 间隔 2s)
  │     │   │   └→ executeTask() → spawnClaudeWithRetry(2)
  │     │   ├── QualityGateService.runGates()
  │     │   ├── createEvaluationTasks() [Generator 任务]
  │     │   ├── 死锁检测 (30 idle loops → 重试 Backlog)
  │     │   └── propagateContext() [Done 任务 → 下游注入]
  │     │
  │     └── 3e. return { completed, blocked }
  │
  └── 4. 返回 { complexity, dashboard }
```

---

## 5. 关键机制

### 5.1 Agent 分配

```
selectBestAgent(candidates, requiredTags, projectId)
  → 过滤 idle agents
  → rankAgents() — EMA 能力评分 (α=0.3)
  → 最高分当选
  → 同分时按 seed 顺序 (编排官 > 产品经理 > ...)
```

### 5.2 契约传递

```
propagateContext(completedTaskId)
  → 提取 Done 任务输出 (### 执行结果)
  → 查找所有依赖此任务的下游任务
  → 注入 "### 上游契约: {title}" 到下游 description
```

### 5.3 死锁保护

```
执行循环 idleLoops ≥ 30 (60s 无进展)
  → 日志输出卡住的任务列表
  → 重试分配 Backlog 任务
  → 重置计数器
```

### 5.4 崩溃诊断

```
spawnClaudeOnce() 退出码解码:
  4294967295 (-1) → 诊断: API key / 网络 / 模型名 / 杀毒软件
  stderr 全量捕获 → 包含在错误信息中
  配置错误 (binary/API key) → 不重试
  瞬态错误 → 重试 2 次 (2s → 4s 退避)
```

### 5.5 跨项目执行

```
项目注册 → 路径校验 (目录存在 + 不是文件)
Agent seed → 每项目独立 12 agent
执行 CWD → resolveProjectCwd() → spawn 在目标项目目录
```

### 5.6 JSON 提取

```
extractJson() 4 策略:
  1. 去 markdown fences → JSON.parse
  2. 正则找 {"score":N...} 边界
  3. 任意 {...} → 修复尾逗号 → parse
  4. 正则逐字段提取 (score/reasoning/agentCount/phases)
```

---

## 6. 文件索引

| 文件 | 职责 |
|------|------|
| `packages/server/src/db/seed.ts` | Agent 种子数据 + 能力标签映射 |
| `packages/server/src/engine/orchestrator.ts` | 三阶段管道 + 复杂度分析 + 任务分解 + 评估任务创建 |
| `packages/server/src/engine/execution-service.ts` | Prompt 构建 + Agent 执行 + 角色注入 + 技能引导 |
| `packages/server/src/engine/capability-scorer.ts` | EMA 能力评分 + Agent 排序 |
| `packages/server/src/engine/quality-gate.ts` | 4 道质量门禁 |
| `packages/server/src/engine/claude-spawn.ts` | Claude Code 进程管理 + 重试 + 诊断 |
| `packages/server/src/routes/index.ts` | `/api/auto` 入口 |
| `packages/server/src/routes/tasks.ts` | 任务 CRUD + 状态流转守卫 |
| `.claude/skills/swarm/SKILL.md` | `/swarm` 技能定义 |
