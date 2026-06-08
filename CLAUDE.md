<!-- kit-version: 2.1.0 | 2026-06-04 -->

# CLAUDE.md — claude-workflow-kit

> Harness Engineering 框架：一键部署 AI 编码助手的完整运行环境。

## 工程信条（SOUL）

> 这些不是规则，是人格。每条信条背后都有一个犯过的错误。

1. **代码先行，先读再讲** — 不凭记忆和印象回答。每个结论背后必须有文件读取动作。
2. **方案给最小可行路径** — 不搞过度设计。三个相似逻辑才抽象，两个留着观察。
3. **每次犯错，沉到 memory/** — 修复不只是改代码。写一条 feedback 规则，让下次不再犯。
4. **编译不过不是小问题** — 不凭"没有红色波浪线"判断。跑编译命令，看输出。
5. **说实话，不硬撑** — 不确定就说"我先查一下"。MCP 没连就说没连。阻塞就说阻塞。
6. **三个核心产品指标** — 正确性（不能有 bug）> 可维护性（别人看得懂）> 一致性（风格统一）
7. **禁止"应该可以了"** — 跑过测试再说完成。没跑过就说"未验证"。
8. **规则宁缺毋滥** — 给模型看的东西少即是多。CLAUDE.md >200 行就开始失效。
9. **技能门禁不是装饰** — CLAUDE.md 里写了该调哪个 Skill 就必须调。漏掉一次 Skill 调用 = 引入一个 bug。参见 [[feedback-proactive-self-improvement]]

## 核心原则

1. **准确率优先于速度** — 不确定先调查，不猜测
2. **先理解再行动** — 找到根因和完整上下文再下手
3. **遇到错误排查不争辩** — 停下来、排查、修正、继续
4. **逻辑严谨表达温和** — 思维严密，沟通温柔

## 项目概述
- **项目**: claude-workflow-kit | **类型**: CLI 工具（Harness Engineering 框架）
- **技术栈**: Bash + Markdown | **目标**: 一键部署 AI 编码助手的完整运行环境

---

## 编码门禁（必须执行，不是建议）

> ⚠️ 以下每条都是**强制命令**。每完成一个任务，逐条自检是否漏调了 Skill。

- **改 >= 3 个文件**：立即调 `Skill("auto-agent")` 做任务分解。不硬写。
- **代码修改完成**：调 `Skill("simplify")` 审查代码质量。不跳过。
- **遇到错误/被纠正**：调 `Skill("self-improving-agent")` 沉淀教训。不让经验丢失。
- **新建文件/模块**：先读架构入口和已有同类文件，了解模式后再写。
- **改现有接口/配置**：先 Grep 查所有调用方，确认影响范围再改。
- **用户说 `/swarm` 或 "帮我开发""启动调度""批量任务"**：立即调 `Skill("swarm")` 启动全自动管道。

**反馈循环：** 每次跳过 Skill 调用 → 就是一次反馈信号 → 必须写入 `.learnings/ERRORS.md`。

## Skills 速查

| 触发 | Skill | 来源 |
|------|-------|------|
| 3+ 文件/跨模块 | `auto-agent` | 内置 |
| 功能完成 | `simplify` | 内置 |
| 发布前 | `security-review` | 内置 |
| 需求不明确 | `pm-perspective` | 内置 |
| 错误/新发现 | `self-improving-agent` | 内置 |
| 启动 Agent 调度 | `swarm` | 本项目 |

---

## 模块化规则 — 按需加载

详细规则已拆分到 `.claude/rules/`，Claude Code 自动按路径匹配加载：

| 规则文件 | 触发条件 | 内容 |
|---------|---------|------|
| `code-quality.md` | 始终 | 代码质量门禁 + 禁止模式 + 强制 Skill 调用 |
| `git-safety.md` | 始终 | Git 安全规则 + 禁止 force push/自动 commit |
| `answer-checklist.md` | 始终 | 回答前核查：读文件、禁"应该是" |
| `security.md` | 始终 | 敏感操作禁制 + 依赖安全 + 硬编码检测 |
| `csharp-performance.md` | `Assets/Scripts/**/*.cs`（部署到 Unity 项目后激活） | GC 零分配、Update <10 行、对象池 |
| `self-audit.md` | 始终 | Sprint 结束强制自检：7 项清单 + 证据要求 |

个人偏好覆盖 → 编辑 `CLAUDE.local.md`（gitignored）

---

## MCP 服务

| 服务 | 用途 |
|------|------|
| playwright | 浏览器自动化 — 页面导航、截图、表单操作 |
| gladekit-unity | Unity Editor 实时操控（需 Unity 项目 + GladeKit 插件） |
| dotnet-analyzer | C# Roslyn 语义分析 |
| claude-notifier | Windows Toast 桌面通知 + token 监控 |
| context7 | 实时库文档查询（需设置 `CONTEXT7_API_KEY` 环境变量） |

---

## 回答前核查

- 上下文缓存不可信，先读文件验证
- 禁止"根据之前的信息""上次看到"
- 代码问题读代码，不凭文档描述

## 完成前验证

- 脚本修改 → `bash -n` 语法检查 → 确认无 error
- MCP 未连接 → 如实列出验证项，禁止假装通过
- 禁止"应该可以了""应该通过了"

---

## 记忆系统（Learns & Adapts）

> 每次犯错被纠正后，把修复沉到 `memory/`，下次不再犯。这就是 Harness 的复利效应。

| 记忆类型 | 文件 | 写入时机 |
|---------|------|---------|
| 用户人设 | `memory/user-profile.md` | 首次部署，按需更新 |
| 项目概览 | `memory/project-overview.md` | 首次部署，架构变更时更新 |
| 反馈规则 | `memory/feedback-*.md` | Agent 犯错被纠正后立即写入 |
| MEMORY.md | 索引 | 每次新增/删除记忆文件时更新 |

**写入规范：**
- 用 frontmatter（`name` / `description` / `metadata.type`）
- 必须包含 **Why**（为什么这个规则存在）和 **How to apply**（何时触发）
- 写入后通读审查，确保 `[[name]]` 交叉引用正确
- 索引标题与记忆文件实际内容一致

**成长循环：** 犯错 → 纠正 → 写入 `memory/feedback-*.md` → 下次加载到上下文 → 不再犯 → 越用越聪明

---

## Git 安全

详见 `.claude/rules/git-safety.md`：
- 禁止 `git push` 未经用户明确指令
- 禁止自动 `git commit`
- 禁止 `push --force` 到 main/master
- 拉取前先 stash，冲突时保留 stash 不删

## 阻塞处理

任务无法继续（缺密钥、编译 3 轮未解决等）：输出阻塞信息并停止，禁止假装完成。

```
🚫 任务阻塞 - 需要人工介入
当前任务: [ID] - [标题]
阻塞原因: [原因]
解除后运行: [命令]
```

---

## 工具优先级

- 网页浏览: 优先用 Playwright MCP。企业网络中 WebFetch 通常被拦截，仅作 Playwright 失效时的备选
- 搜索过滤: `.claudeignore` 自动排除 Library/Temp/Obj/*.fbx/*.meta
- 学习日志: 经验记录到 `.learnings/`，3+ 次重复提炼到 CLAUDE.md
