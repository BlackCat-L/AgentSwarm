# Agent Swarm — Dark Factory

> **输入需求，拿走可部署的代码。中间零人类参与。**

Agent Swarm 是一个本地优先的**全自主多 Agent 开发调度平台**。12 个 AI Agent 角色并行协作，从需求分析到代码交付全自动完成。带 7 列看板实时追踪进度，支持 VS Code 一句话触发。

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 一键启动（自动打开浏览器）
pnpm dev
```

浏览器打开 `http://localhost:5173`，看到看板即就绪。

**Windows 用户**可以直接双击项目根目录的 `start.bat`。

> 环境要求: Node.js ≥ 22, pnpm ≥ 11, Claude Code CLI 已安装并登录

---

## 三种使用方式

### 方式 ① VS Code 一句话（推荐）

在 VS Code 的 Claude Code 中输入：

```
/swarm 开发一个用户管理系统，支持注册、登录、密码修改、角色分配
```

Agent Swarm 自动：分析复杂度 → 拆解成子任务 → 创建 DAG 依赖 → 分配 Agent → 并行执行 → 完成。你打开 `http://localhost:5173` 看进度就行。

### 方式 ② Web 看板手动操作

```
① 按 N → 新建任务 → 填写标题和描述
② 点卡片「查看详情」→ 下拉选 Agent → 状态变 InDev
③ 点绿色「▶ 执行」按钮 → Claude Code 开始工作
④ 等待 Done → 详情面板展示执行结果
```

### 方式 ③ API / CLI 程序化调用

```bash
# 一句话全自动
curl -X POST http://localhost:5120/api/auto \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"project_id":"<ID>","title":"开发一个登录API"}'

# CLI
npx tsx packages/cli/src/index.ts get agents
npx tsx packages/cli/src/index.ts create task -t "任务标题"
```

---

## 看板状态流转

```
Backlog ─→ InDev ─→ ReadyForTest ─→ ReadyForDeploy ─→ Done
               ↓           ↓
            InFix ←─────────┘
               ↓
           Blocked
```

- **Backlog → InDev**：不能拖拽，必须走「分配 Agent」
- **InDev → ReadyForTest**：执行完成后自动流转
- **非法流转**：API 返回 422，拖拽自动回弹

---

## Agent 角色体系

每个 Agent 是一种**角色**（不是每个任务创建一个 Agent）。一个 Agent 可以做无数个同类任务。能力评分引擎（EMA）自动匹配最合适的 Agent。

| 角色 | role | 能力标签示例 |
|------|------|-------------|
| 后端工程师 | `backend-architect` | `backend, api, database, python, security` |
| 前端工程师 | `frontend-developer` | `frontend, react, ui, css` |
| 软件架构师 | `software-architect` | `architecture, api-design, database` |
| QA 取证专家 | `testing-evidence-collector` | `testing, qa, curl` |
| 安全工程师 | `security-engineer` | `security, owasp, audit` |
| DevOps | `devops-automator` | `devops, docker, ci` |
| 产品经理 | `product-manager` | `product, planning` |

> 不需要为临时任务注册 Agent。比如排序任务的能力标签 `["backend", "sorting"]` 会自动匹配到后端工程师（因为他的能力集包含 `sorting`）。

---

## AI 编排引擎

### 复杂度分析

输入需求后，AI 自动分析任务复杂度（1-10 分），决定并行 Agent 数量。

### 任务分解

大需求自动拆解为子任务 + DAG 依赖关系。例如"开发用户管理系统"自动拆成：

```
[0] 数据库设计 ──→ [1] 认证模块 ──→ [2] CRUD API ──→ [4] 前端界面
                                     ↓
                                  [3] 权限控制 ──→ [5] 集成测试
```

### 契约传递

上游任务完成后，输出自动注入为下游任务的上下文。例如架构师的 API_CONTRACT 自动传给后端工程师。

### 全自动管道 `/api/auto`

```
一句话需求
  → AI 分析复杂度
    → AI 拆解子任务 + DAG
      → 能力评分匹配 Agent
        → 按依赖顺序并行执行
          → 契约传递到下游
            → 全部 Done
```

---

## 架构

```
┌────────────────────────────────────────┐
│  Web UI (React 19 + Tailwind + dnd-kit)│  ← http://localhost:5173
│  7列看板 · Agent面板 · 终端 · 详情面板  │
├────────────────────────────────────────┤
│  API Gateway (Hono, :5120)             │
│  REST 30+ 端点 · SSE 事件推送           │
├────────────────────────────────────────┤
│  Orchestrator (AI 编排引擎)             │
│  复杂度分析 · 任务分解 · 契约传递         │
├────────────────────────────────────────┤
│  Engine Layer                          │
│  TaskGraph · RuntimePool · CapScorer   │
│  AgentRunner · ExecutionService        │
├────────────────────────────────────────┤
│  Provider Layer                        │
│  Claude Code SDK / CLI / Hermes        │
├────────────────────────────────────────┤
│  SQLite (sql.js, WAL)                  │
│  9 tables + 11 indexes                 │
└────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 5.x, strict mode |
| 运行时 | Node.js 22+ |
| 前端 | React 19 + Vite 7 + Tailwind 4 + @dnd-kit |
| 后端 | Hono 4.x |
| 数据库 | sql.js (SQLite WASM, 零配置) |
| Agent 执行 | `spawn("claude", ...)` — 真实 Claude Code 进程 |
| Agent 身份 | Ed25519 密钥对 + JWT + SHA-256 fingerprint |
| 并发控制 | RuntimePool + per-runtime 限流 + 断路器 |

---

## API 参考

基础路径: `http://localhost:5120/api`

### 项目
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/projects` | 项目列表 |
| POST | `/projects` | 创建项目 |
| DELETE | `/projects/:id` | 删除项目（级联） |

### Agent
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | Agent 列表 (`?role=&status=&project_id=`) |
| POST | `/agents` | 注册 Agent（自动生成 Ed25519 身份） |
| POST | `/agents/:id/heartbeat` | 心跳上报 |
| DELETE | `/agents/:id` | 删除 Agent |

### 任务
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks` | 任务列表（支持多维过滤） |
| POST | `/tasks` | 创建任务 |
| PATCH | `/tasks/:id` | 更新任务（乐观锁，需 version） |
| POST | `/tasks/:id/assign` | 分配 Agent |
| POST | `/tasks/:id/execute` | **真实执行**（调用 Claude Code） |
| POST | `/tasks/:id/status` | 状态流转 |
| DELETE | `/tasks/:id` | 删除任务 |

### 编排 & 监控
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auto` | **一句话全自动**：分析→拆解→分配→执行 |
| POST | `/orchestrate` | 分析+拆解+创建 DAG（不自动执行） |
| GET | `/board` | 看板 7 列视图 (`?projectId=`) |
| GET | `/stats` | 统计数据 |
| GET | `/events` | SSE 实时事件流 |
| GET | `/health` | 健康检查 |
| POST | `/kill-switch` | 紧急停止所有 Agent |
| POST | `/cleanup` | 清理过期数据 |

---

## CLI

```bash
npx tsx packages/cli/src/index.ts <command>

# 查询
get agents              # 列出所有 Agent
get agents -p <id>      # 按项目筛选
get projects            # 列出项目
get tasks               # 列出任务
get tasks -s InDev      # 按状态筛选

# 创建
create project -n "名称" -p /path
create task --project-id <id> -t "标题" -p 0

# 系统
doctor                  # 环境诊断
kill-switch             # 紧急停止
cleanup                 # 清理过期数据
```

---

## 在新项目中使用 /swarm

Agent Swarm 作为常驻服务运行。任何新项目只需安装 swarm skill，即可在 VS Code Claude Code 中用 `/swarm` 触发调度。

### 安装

```bash
# 从 Agent Swarm 目录执行
# Linux/Mac
./install-skill.sh /path/to/your-project

# Windows
install-skill.bat C:\path\to\your-project
```

### 手动安装

把这两个文件复制到新项目：

```
你的新项目/
├── .claude/skills/swarm/SKILL.md    ← 从 Agent Swarm 复制
└── CLAUDE.md                        ← 加一行 skills 引用
```

CLAUDE.md 里加：

```markdown
## Skills 速查
| 触发 | Skill | 来源 |
|------|-------|------|
| 启动 Agent 调度 | `swarm` | Agent Swarm |
```

### 使用

确保 Agent Swarm 服务器在运行（`pnpm dev`），然后在新项目的 VS Code Claude Code 中说：

```
/swarm 帮我重构所有错误处理
```

Agent Swarm 会自动在新项目中创建对应的项目记录、注册 Agent、拆解任务并执行。

> 原理：`/swarm` skill 通过 HTTP API 调用 Agent Swarm 服务器（`localhost:5120`），任务在 Agent Swarm 中管理，Claude Code 在新项目的工作目录下执行。

---

## Docker 部署

```bash
docker compose up -d
# → http://localhost:5120
```

---

## 开发

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
pnpm typecheck        # TypeScript 编译检查
pnpm test             # 运行测试 (121 tests)
pnpm build            # 生产构建
```

### 项目结构

```
packages/
├── shared/src/types/      # 共享类型定义 (8 domain files)
├── server/src/
│   ├── engine/            # 13 个引擎模块
│   │   ├── orchestrator   # AI 编排 (复杂度分析+任务分解+契约传递+全自动)
│   │   ├── task-graph     # 任务 DAG + 乐观锁 + BFS 循环检测
│   │   ├── execution-service # 真实 Claude Code 执行管道
│   │   ├── capability-scorer # EMA 能力评分
│   │   ├── agent-identity # Ed25519 + JWT + fingerprint
│   │   ├── runtime-pool   # 并发 Agent 池
│   │   ├── rate-limiter   # 速率限制
│   │   ├── circuit-breaker # 断路器
│   │   └── ...
│   ├── routes/            # REST API (7 route groups)
│   ├── providers/         # Claude SDK / CLI / Hermes / OpenClaw
│   ├── sse/               # SSE 事件推送
│   ├── db/                # SQLite schema + migration
│   └── agents/            # 12 个 Agent 角色定义 (.md)
├── web/src/
│   ├── components/kanban/ # Board, Column, Card, FilterBar
│   ├── components/tasks/  # TaskCreateModal, TaskDetailSheet
│   ├── components/terminal/ # xterm.js 终端面板
│   └── pages/             # Projects 页面
└── cli/src/               # aswarm CLI (Commander.js)
```

---

## 许可

MIT
