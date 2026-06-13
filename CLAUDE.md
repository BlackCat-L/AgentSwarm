# CLAUDE.md — Agent Swarm

> 12-agent 全自主开发调度平台。本文件是主会话（非蜂群模式）的指令集。

## 工程信条

1. **代码先行，先读再讲** — 每个结论背后必须有文件读取动作
2. **方案给最小可行路径** — 三个相似逻辑才抽象，两个留着观察
3. **每次犯错，沉到 memory/** — 写 feedback 规则，让下次不再犯
4. **编译不过不是小问题** — 跑编译命令，看输出，不凭 IDE 红线判断
5. **说实话，不硬撑** — 不确定就说"我先查一下"
6. **禁止"应该可以了"** — 跑过测试/编译再说完成
7. **规则宁缺毋滥** — CLAUDE.md >200 行开始失效，用 `.claude/rules/` 按需加载

## 项目概述

- **项目**: Agent Swarm — Dark Factory
- **类型**: 全自主多 Agent 开发调度平台（Hono API + React 看板 + SQLite）
- **入口**: `pnpm dev:stable`（API :5120 + Web :5173）或双击 `start.bat`
- **技术栈**: TypeScript + Hono 4 + React 19 + Vite 7 + Tailwind 4 + sql.js + Claude Code CLI

---

## Skills 速查（所有可用 Skills）

> 遇到匹配场景**必须调 Skill**，不是可选项。

| 场景 | Skill | 触发条件 |
|------|-------|---------|
| Git 操作 | `git` | commit、branch、merge、rebase、PR、push |
| 代码审查 | `code-review` | 完成任何代码改动后 |
| 代码简化 | `simplify` | 代码完成，检查冗余/可读性 |
| 安全审查 | `security-review` | 涉及 auth/data/input/api 改动 |
| 流程图/架构图 | `mermaid` | 画流程、架构、时序、ER 图 |
| 思维导图 | `huo15-mind-map` | 头脑风暴、知识整理 |
| 网络搜索 | `tavily` | 查最新资料、API 文档、调研 |
| 文档提取 | `moark-doc-extraction` | 读取 PDF/DOCX 文件 |
| 提示词优化 | `prompt-optimizer` | 优化 prompt/指令 |
| 产品设计 | `pm-perspective` | 产品决策、用户故事 |
| Agent 配置 | `agent-md-advisor` | 写 CLAUDE.md/AGENTS.md |
| 多文件任务 | `auto-agent` | 涉及 3+ 文件或跨模块改动 |
| 错误学习 | `self-improving-agent` | 被纠正/发现错误后 |
| 蜂群调度 | `swarm` | 用户说 /swarm 或"启动调度" |
| C盘清理 | `xiaoliu666` | C盘满了、磁盘清理 |

---

## 强制门禁

- **Git 操作** → 必须调 `Skill("git")`，禁止直接 Bash git 命令
- **改 >= 3 个文件** → 调 `Skill("auto-agent")` 做任务分解
- **代码修改完成** → 调 `Skill("simplify")` 自检
- **涉及安全** → 调 `Skill("security-review")`
- **遇到错误/被纠正** → 调 `Skill("self-improving-agent")` 沉淀教训
- **改接口/配置** → 先 Grep 所有调用方，确认影响范围

---

## 服务器生命周期

```bash
# 启动（稳定模式，agent 改代码不会触发重启崩溃）
pnpm dev:stable          # API + Web
pnpm dev:server:stable   # 仅 API

# 开发模式（带热重载，仅改服务器自身代码时用）
pnpm dev

# 编译检查
pnpm --filter @agent-swarm/server build

# 重启（先杀端口）
powershell -Command "Get-NetTCPConnection -LocalPort 5120,5173 -EA SilentlyContinue | ForEach-Object { Stop-Process -Id \`$_.OwningProcess -Force }"
pnpm dev:stable
```

---

## MCP 服务

| 服务 | 用途 |
|------|------|
| playwright | 浏览器自动化 — 页面导航、截图、表单操作 |
| filesystem | 文件系统操作（限定目录） |
| midjourney | AI 图片生成 |
| claude-notifier | Windows Toast 桌面通知 |

---

## Git 安全

- 禁止未经用户指令 `git push`
- 禁止 `push --force` 到 main/master
- 禁止自动 `git commit`（用户说"提交"或"推送"才做）
- 提交前先 `git diff --staged` 自查

## 阻塞处理

任务无法继续时输出阻塞信息并停止，禁止假装完成：

```
🚫 任务阻塞 - 需要人工介入
当前任务: [标题]
阻塞原因: [原因]
解除后运行: [命令]
```
