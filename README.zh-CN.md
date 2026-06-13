# Agent Swarm — Dark Factory

> **输入需求，拿走可部署的代码。中间零人类参与。**

Agent Swarm 是一个本地优先的**全自主多 Agent 开发调度平台**。12 个 AI Agent 角色并行协作，从需求分析 → 任务分解 → 分配执行 → 质量门禁 → 代码交付全自动完成。48 个 Skills 为每个 Agent 提供专业工具能力。带 7 列看板实时追踪进度，支持 VS Code 一句话跨项目触发。

---

## 快速开始

### 一键启动（推荐）

**Windows**：双击 `start.bat`（自动安装 Node.js + pnpm + 全局 /swarm skill + 启动服务）

**Mac/Linux**：
```bash
./start.sh
```

### 手动启动

```bash
pnpm install
pnpm dev          # 同时启动 API (:5120) + Web 看板 (:5173)
```

> 浏览器自动打开 `http://localhost:5173`

### 单独启动组件

```bash
pnpm dev:server          # 仅 API（带 tsx watch 热重载，开发时用）
pnpm dev:server:stable   # 仅 API（无 watch，Swarm 生产模式——agent 改代码不会触发重启崩溃）
pnpm dev:web             # 仅 Web 看板
```

> 环境要求: Node.js ≥ 22, pnpm ≥ 11, Claude Code CLI 已安装

---

## 三种使用方式

### 方式 ① VS Code 一句话跨项目（推荐）

在**任意 VSCode Claude Code 项目**中输入：

```
/swarm 开发一个用户管理系统，支持注册、登录、密码修改、角色分配
```

Agent Swarm 自动：
1. 注册当前项目（自动检测路径）
2. 分析复杂度 → AI 拆解子任务 + DAG
3. 按能力评分分配 Agent（Planner → Generator → Evaluator）
4. 并行执行（最多 3 并发，批次间退避）
5. 4 道质量门禁验收
6. Agent 在**目标项目目录**下工作，代码直接写入目标项目

打开 `http://localhost:5173` 看进度。

### 方式 ② Web 看板手动操作

1. 按 N → 新建任务 → 填写标题和描述
2. 点卡片「查看详情」→ 下拉选 Agent → 状态变 InDev
3. 点绿色「▶ 执行」按钮 → Claude Code 开始工作
4. 等待 Done → 详情面板展示执行结果 + 质量门禁判定

### 方式 ③ API 程序化调用

```bash
# 一句话全自动（跨项目：project path 指向目标项目）
curl -X POST http://localhost:5120/api/auto \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"project_id":"<ID>","title":"开发一个登录API","description":"..."}'

# 创建跨项目记录
curl -X POST http://localhost:5120/api/projects \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"name":"我的项目","path":"F:/company/my-project"}'
```

---

## 看板状态流转

```
Backlog ─→ InDev ─→ ReadyForTest ─→ ReadyForDeploy ─→ Done
               ↓           ↓
            InFix ←─────────┘  (质量门禁未通过)
               ↓
           Blocked
```

- **Backlog → InDev**：必须走「分配 Agent」
- **InDev → ReadyForTest**：Agent 执行完成后自动流转
- **ReadyForTest → Done**：4 道质量门禁全部通过
- **ReadyForTest → InFix**：门禁未通过，退回修复
- **非法流转**：API 返回 422，看板拖拽自动回弹

---

## 12-Agent 角色体系

| # | 角色 | 模型 | 严格模式类别 | 职责 |
|---|------|------|------------|------|
| 1 | 编排官 | pro | Planner | 需求分析、任务分解、流程编排 |
| 2 | 产品经理 | pro | Planner | 用户故事、验收标准、产品决策 |
| 3 | 软件架构师 | pro | Planner | 系统设计、接口契约、模块划分 |
| 4 | 后端架构师 | pro | Generator | API 设计、数据模型、后端实现 |
| 5 | 前端架构师 | pro | Generator | 路由设计、组件树、性能策略 |
| 6 | 数据库优化师 | pro | Generator | 查询优化、索引设计、数据迁移 |
| 7 | 安全工程师 | pro | Evaluator | 威胁面扫描、漏洞检测、权限审计 |
| 8 | 代码审查师 | pro | Evaluator | 四维评分、代码质量、合规检查 |
| 9 | UI 设计师 | flash | Generator | 视觉设计、交互规范、无障碍 |
| 10 | 前端开发 | flash | Generator | 组件实现、状态管理、响应式 |
| 11 | DevOps 自动化 | flash | Generator | 部署脚本、CI/CD、环境管理 |
| 12 | 测试 QA | flash | Evaluator | 测试用例、验收验证、风险评估 |

> **模型分层**：8 个重角色用 `deepseek-v4-pro[1m]`（分析/设计/审查），4 个轻角色用 `deepseek-v4-flash`（实现/验证），分散 API 端点压力。

---

## 质量门禁系统

每个任务执行后，自动通过 4 道门禁：

| Gate | 触发条件 | 功能 | 模型 |
|------|---------|------|------|
| Acceptance | 始终 | 审查输出是否满足验收标准 | haiku |
| Review | 复杂任务 (>500 字描述) | 对抗性质量检查（逻辑/性能/安全/冗余） | sonnet |
| Simplify | 输出 >2000 行代码 | 检测重复代码和过度复杂逻辑 | haiku |
| Learn | 任何 Gate 失败 | 自动提炼学习规则写入 `.learnings/ERRORS.md` | haiku |

> 全部通过 → Done。任一失败 → InFix（附具体问题和修复建议）。

---

## Skill 生态系统

Agent 在执行任务时**主动调用**匹配的 Skill（非被动装饰）。`SKILL_USAGE_GUIDE` 注入每个 prompt 确保实际使用。

### 48 个全局 Skills（`~/.claude/skills/`）

| 类别 | Skills | 用途 |
|------|--------|------|
| **开发流程** | auto-agent, agent-optimizer, agent-md-advisor | 6 步法、12-Factor、CLAUDE.md 编写 |
| **代码质量** | code-review, simplify, code-review-unity | 审查、简化、Unity 专项 |
| **安全** | security-review, security-hardening | 安全审查、威胁面扫描 |
| **产品设计** | pm-perspective, game-designer-toolkit, huo15-mind-map | 产品决策、GDD、思维导图 |
| **工具** | git, mermaid, tavily, moark-doc-extraction, prompt-optimizer | 版本控制、流程图、搜索、文档提取 |
| **运维** | session-cleaner, skill-optimizer, find-skills, skill-vetter, claude-config-advisor | 会话清理、skill 管理 |
| **飞书** | lark-* (16 个) | IM、文档、日历、审批、OKR 等 |
| **其他** | accurate-assistant, github, netease-uu-booster | 准确率模式、GitHub、游戏加速 |

### Skill 使用机制

每个 Agent 的 prompt 包含 `SKILL_USAGE_GUIDE`——明确列出可用 skill 和触发条件：

```
| 场景 | 调用 Skill |
|------|-----------|
| 代码审查 | Skill("code-review") |
| 流程图 | Skill("mermaid") |
| Git 操作 | Skill("git") |
| 安全审查 | Skill("security-review") |
...
```

**铁律**：遇到上表场景不调用 Skill = 漏步骤 = Bug。

---

## AI 编排引擎

### 复杂度分析

AI 自动评分 1-10，决定并行 agent 数量和拆解粒度。AI 不可用时自动降级为关键词评分。

### 任务分解

大需求自动拆解为子任务 + DAG 依赖 + 能力标签。例如"开发用户管理系统"：

```
[0] 数据库设计 ──→ [1] 认证模块 ──→ [2] CRUD API ──→ [4] 前端界面
                                     ↓
                                  [3] 权限控制 ──→ [5] 集成测试
```

### 3 角色严格模式（复杂度 ≥ 6）

高复杂度任务自动激活角色分离，与 12-agent 蜂群对齐：

```
Planner（编排官/产品经理/软件架构师）
  → 输出 Sprint Contract → 交给 Generator

Generator（后端架构师/前端开发/数据库优化师/DevOps/UI设计师）
  → 读取契约，实现代码 → 交给 Evaluator

Evaluator（代码审查师/测试QA/安全工程师）
  → 独立验收，按评分矩阵打分 → PASS/FAIL
```

### 契约传递

上游任务完成后，输出自动注入为下游任务的上下文。架构师的 API_CONTRACT → 后端工程师的实现输入 → QA 的测试依据。

### 并发控制

`MAX_CONCURRENT_SPAWNS = 3`——同时最多 3 个 Claude Code 进程，批次间间隔 2 秒。防止 API 限流导致的进程崩溃（exit -1）。

### 崩溃诊断 + 自动重试

- `decodeExitCode()` 将 `4294967295` 翻译为可读原因（API key、网络、模型名、杀毒软件）
- `spawnClaudeWithRetry()` 瞬态失败自动重试 2 次（2s→4s 退避），配置错误不重试

---

## 全自动管道 `/api/auto`

```
一句话需求
  → AI 分析复杂度（askClaude）
    → AI 拆解子任务 + DAG 依赖（askClaude）
      → 能力评分匹配 Agent（EMA scoring）
        → 按依赖顺序并行执行（MAX 3 concurrent）
          → 4 道质量门禁（acceptance → review → simplify → learn）
            → 契约传递到下游
              → 全部 Done
```

---

## 架构

```
┌──────────────────────────────────────────────────┐
│  Web UI (React 19 + Tailwind 4 + @dnd-kit)       │  ← :5173
│  7列看板 · Agent面板 · 详情面板 · SSE 实时推送     │
├──────────────────────────────────────────────────┤
│  API Gateway (Hono 4, :5120)                     │
│  REST 30+ 端点 · CORS · UTF-8 charset            │
├──────────────────────────────────────────────────┤
│  Orchestrator v2                                 │
│  复杂度分析 · 任务分解 · 3角色分离 · 契约传递      │
│  并发控制 (MAX 3) · 自动重试 · 崩溃诊断           │
├──────────────────────────────────────────────────┤
│  Execution Service                               │
│  SKILL_USAGE_GUIDE 注入 · ROLE_SKILL_INJECTION   │
│  12 角色专属 prompt · Skill Modules 动态匹配      │
│  STRICT_MODE_BY_ROLE · AUTO_AGENT 6-step         │
├──────────────────────────────────────────────────┤
│  Quality Gate Service (4 gates)                  │
│  Acceptance → Review → Simplify → Learn          │
├──────────────────────────────────────────────────┤
│  Claude Spawn Layer                              │
│  spawnClaudeWithRetry · decodeExitCode · CWD     │
├──────────────────────────────────────────────────┤
│  Engine Layer                                    │
│  TaskGraph · SharedServices · CapabilityScorer   │
│  RuntimePool · RateLimiter · CircuitBreaker      │
├──────────────────────────────────────────────────┤
│  SQLite (sql.js WASM, 零配置)                    │
│  9 tables + 11 indexes · v7 schema               │
└──────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 5.x, strict mode |
| 运行时 | Node.js 22+ |
| 前端 | React 19 + Vite 7 + Tailwind 4 + @dnd-kit |
| 后端 | Hono 4.x |
| 数据库 | sql.js (SQLite WASM, 零配置) |
| Agent 执行 | `spawn("claude", ...)` 真实 Claude Code 进程 + CWD 跨项目支持 |
| Agent 身份 | Ed25519 密钥对 + JWT + SHA-256 fingerprint |
| 并发控制 | MAX_CONCURRENT_SPAWNS=3 + 批次退避 2s |
| Skills | 48 个全局 Skills + SKILL_USAGE_GUIDE 主动调用 |

---

## 跨项目 /swarm

`/swarm` skill v2.0 已安装到全局（`~/.claude/skills/swarm/`），**无需在每个项目重复安装**。

### 工作流

```
你在任意 VSCode 项目中输入 /swarm <需求>
  → Skill 自动检测当前项目路径 (os.getcwd())
  → 注册项目到 Agent Swarm（如未注册）
  → POST /api/auto 启动全自动管道
  → Agent 在目标项目目录下工作（CWD = 项目路径）
  → 代码直接写入目标项目
  → 看板 http://localhost:5173 实时追踪
```

### 前提条件

1. Agent Swarm 服务器运行中（双击 `start.bat`）
2. 48 个 Skills 已安装到全局（`start.bat` 自动完成）
3. Claude Code CLI 已安装

---

## API 参考

基础路径: `http://localhost:5120/api`

### 项目
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/projects` | 项目列表 |
| POST | `/projects` | 创建项目（`path` 指向目标项目根目录） |
| DELETE | `/projects/:id` | 删除项目（级联清理） |

### Agent
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | Agent 列表 (`?role=&status=&project_id=`) |
| POST | `/agents` | 注册 Agent（自动生成 Ed25519 身份） |
| POST | `/agents/:id/heartbeat` | 心跳上报 |
| PATCH | `/agents/:id` | 更新 Agent（状态/模型/权限） |
| DELETE | `/agents/:id` | 删除 Agent + 清理关联数据 |

### 任务
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks` | 任务列表（支持 `?status=&project_id=&agent_id=`） |
| POST | `/tasks` | 创建任务 |
| PATCH | `/tasks/:id` | 更新任务（乐观锁，需 version） |
| POST | `/tasks/:id/assign` | 分配 Agent |
| POST | `/tasks/:id/execute` | **真实执行**（调用 Claude Code + quality gate） |
| POST | `/tasks/:id/status` | 状态流转 |
| DELETE | `/tasks/:id` | 删除任务 |

### 编排 & 监控
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auto` | **一句话全自动**（分析→拆解→分配→执行→门禁） |
| POST | `/orchestrate` | 分析+拆解+创建 DAG（不自动执行） |
| GET | `/board` | 看板视图 (`?projectId=`) |
| GET | `/stats` | 统计数据 |
| GET | `/costs` | 费用统计 |
| GET | `/events` | SSE 实时事件流 |
| GET | `/health` | 健康检查 |
| POST | `/kill-switch` | 紧急停止所有 Agent |
| POST | `/cleanup` | 清理过期数据 |

---

## 开发

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器（API + Web）
pnpm typecheck        # TypeScript 编译检查
pnpm test             # 运行测试
pnpm build            # 生产构建
```

### 项目结构

```
packages/
├── shared/src/types/         # 共享类型定义
├── server/src/
│   ├── engine/               # 核心引擎
│   │   ├── orchestrator      # AI 编排 (分析+分解+契约+全自动+并发控制)
│   │   ├── execution-service # 执行管道 (role注入+skill引导+6步法+严格模式)
│   │   ├── claude-spawn      # 统一 spawn (诊断+重试+CWD)
│   │   ├── quality-gate      # 4道质量门禁
│   │   ├── task-graph        # 任务 DAG + 乐观锁
│   │   ├── capability-scorer # EMA 能力评分
│   │   ├── shared-services   # 服务单例
│   │   ├── runtime-pool      # 并发池
│   │   ├── rate-limiter      # 速率限制
│   │   └── circuit-breaker   # 断路器
│   ├── routes/               # REST API
│   ├── db/                   # SQLite schema v7 + migration + seed
│   └── sse/                  # SSE 事件推送
├── web/src/
│   ├── components/kanban/    # 看板 (Board, Column, Card)
│   ├── components/tasks/     # 任务 (CreateModal, DetailSheet)
│   └── pages/                # 页面
└── cli/src/                  # aswarm CLI
```

---

## 许可

MIT
