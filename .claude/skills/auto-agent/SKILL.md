---
name: auto-agent
description: 全自动开发工作流 — 6 步标准流程（默认）+ 三代理严格模式（高级）。多文件/长程任务时自动触发。
version: 2.0.0
triggers:
  - 大型重构 / refactor
  - 新系统设计 / architecture
  - 复杂功能 / complex feature
  - 多文件修改 / multi-file
  - 长程任务 / long task
  - auto-agent
  - .auto-agent
---

# Auto-Agent — 全自动开发工作流

> **核心理念：让 AI 持续高效产出，上下文及时清空，状态外化到文件系统。**

---

## 快速开始

部署后 `.auto-agent/` 已包含所有模板：

```
项目/.auto-agent/
├── tasks.json              # 任务清单（AI 的待办清单）
├── progress.md             # 工作日志（AI 的工作周报）
├── handoff.md              # 会话交接
├── sprint-contract.md      # Sprint 契约
├── architecture.md         # 项目架构（部署后填写）
├── review-checklist.md     # 代码审查标准
├── scripts/
│   ├── run-task.ps1        # 单任务执行
│   └── run-agent.ps1       # 多任务自动化
└── templates/              # 代码模板
```

---

## 前置条件

使用 auto-agent 前确认：
1. **项目已是 git 仓库** — `git status` 能正常输出
2. **远程仓库已配置** — `git remote -v` 能看到 origin
3. **分支已关联远程** — `git branch -vv` 显示 `[origin/xxx]`

如果 `git push` 报 "No configured push destination"：
```bash
git remote add origin <你的仓库地址>
git push -u origin master
```

---

## 6 步标准流程（默认模式）

> **每个会话执行一个任务，完成后上下文清空，下个会话重新开始。**

### Step 1: 初始化环境 + 前置检查

```bash
./init.sh                     # 安装依赖、启动开发服务
git status                    # 确认状态干净
git remote -v                 # 确认远程仓库可达
```

**不要跳过此步。**

### Step 2: 领取任务

读取 `tasks.json`，选一个 `passes: false` 的任务：

```json
{
  "tasks": [
    {
      "description": "实现用户登录功能",
      "passes": false
    }
  ]
}
```

**选取优先级：**
1. `passes: false` 的任务
2. 有依赖的先做基础功能
3. 同一批次中选优先级最高的

**一次只做一个任务。** 聚焦完成，不贪多。

### Step 3: 实现

- 仔细阅读任务描述
- 遵循项目现有代码模式和架构
- 优先复用已有模块

### Step 4: 测试验证（必须）

**不测试不许标记完成。**

| 改动规模 | 验证方式 |
|---------|---------|
| 新页面 / 重写组件 / 核心交互 | **必须浏览器实测**（Playwright MCP） |
| 小修改 / bug 修复 / 工具函数 | lint + build + 有疑虑时浏览器验证 |
| 所有改动 | `lint` 无 error + `build` 成功 |

**测试清单：**
- [ ] 编译/语法检查通过
- [ ] lint 无 error
- [ ] build 成功
- [ ] 功能在真实环境正常工作（UI 改动必须浏览器验证）

### Step 5: 更新文件

**a) 更新 `progress.md`：**

```markdown
## YYYY-MM-DD — Task: [任务描述]

### What was done:
- [具体改动]

### Testing:
- [测试方式和结果]

### Notes:
- [给后续 AI 的备注]
```

**b) 更新 `tasks.json`：** 将当前任务的 `passes` 从 `false` 改为 `true`。

### Step 6: 提交

```bash
git add .                          # 代码 + progress.md + tasks.json 一起提交
git commit -m "[任务描述] - completed"
git push
```

> ⚠️ **一个任务 = 一个 commit。** 代码 + progress.md + tasks.json 必须在同一个 commit 中提交。用户调用 auto-agent = 已授权此工作流中的 git push。

**禁止：**
- 删除或修改已有任务描述
- 从列表中移除任务
- 多个任务合并为一个 commit

---

## 核心文件格式

### tasks.json — 标准格式

```json
{
  "tasks": [
    {
      "description": "实现用户登录功能",
      "passes": false
    }
  ]
}
```

**扩展字段（严格模式下使用）：**
```json
{
  "id": "TASK-001",
  "title": "简短标题",
  "description": "详细描述",
  "passes": false,
  "acceptance_criteria": ["可验证标准1", "可验证标准2"],
  "steps": ["步骤1", "步骤2"],
  "dependencies": [],
  "critical_files": ["path/to/file.cs"],
  "estimated_complexity": "low | medium | high"
}
```

### progress.md — 工作日志

每次完成任务的记录。Agent 不依赖对话历史——靠读 `tasks.json` + `progress.md` 恢复状态。

---

## 阻塞处理协议

**以下情况必须停止并请求人工介入：**

- 缺少环境配置（API 密钥、外部服务未开通）
- 外部依赖不可用（第三方 API 宕机、需人工授权的流程）
- 测试无法进行（需真实账号、特定硬件环境）
- 编译错误连续 3 轮迭代仍无法解决

### 阻塞时的正确操作

**DO（必须）：**
- ✅ 在 `progress.md` 中记录当前进度和阻塞原因
- ✅ 输出阻塞信息，说明需要人工做什么
- ✅ 停止任务，等待人工介入

**DO NOT（禁止）：**
- ❌ 提交 git commit
- ❌ 将 `passes` 设为 true
- ❌ 假装任务已完成

### 阻塞信息格式

```
🚫 任务阻塞 - 需要人工介入

当前任务: [任务描述]

已完成的工作:
- [已完成内容]

阻塞原因:
- [具体说明为什么无法继续]

需要人工帮助:
1. [具体步骤]
2. [具体步骤]

解除阻塞后:
- 运行 [命令] 继续任务
```

---

## 上下文管理

### 核心原则

**状态外化到文件，不依赖对话历史。** `tasks.json` + `progress.md` + `handoff.md` 是单一事实来源。

```
Sprint 1 → 完成 → 更新 tasks.json + progress.md → commit + push → 结束会话
         ↓
Sprint 2 → 新会话 → 读 tasks.json（知道做到哪了）→ 只加载当前任务需要的文件
         ↓
Sprint N → 同上，每一轮都是干净窗口
```

### 新会话恢复协议

按序读取恢复上下文：
1. `tasks.json` → 当前所有任务状态
2. `progress.md` → 最新进度和决策
3. `handoff.md`（如存在）→ 上次会话交接
4. `architecture.md` → 项目架构背景
5. 当前任务涉及的代码文件

---

## 严格模式（高级 — 5+ 文件复杂任务）

> 标准流程是默认。当任务 `estimated_complexity = high` 或涉及 5+ 文件跨模块改动时，启用严格模式。

### 三角色分离

| 角色 | 阶段 | 职责 | 约束 |
|------|------|------|------|
| **Planner** | Plan + Explore | 拆解任务、起草 Sprint Contract | 不写代码 |
| **Generator** | Implement + Test | 编码、自评估 | 不能审查自己 |
| **Evaluator** | Review | 独立验收、评分 | 禁止看 Generator 实现思路 |

**为什么分离：** Anthropic 实验数据——同一模型自写自审：20 分钟/$9/跑不通。三代理分离审查：6 小时/$200/16 个功能完全可玩。LLM 天然倾向对自己代码给正面评价。

### Sprint Contract

Generator 和 Evaluator 在编码前协商契约，写入 `sprint-contract.md`：

1. **目标** — 一句话
2. **验收标准** — 可验证的通过条件（"功能正常"不是验收标准）
3. **涉及文件** — 完整路径列表
4. **测试方式** — 编译检查 / 运行测试 / 手动验证

### 五阶段流程

```
Plan → Explore → Implement → Test → Review
 ↑                                    │
 └────────── 未通过，退回重来 ─────────┘
```

### 评估矩阵

| 维度 | Hard Threshold | 权重 |
|------|---------------|------|
| 功能正确性 | ≥ 4/5 | 40% |
| 架构合规 | ≥ 3/5 | 25% |
| 代码质量 | ≥ 3/5 | 20% |
| 复用性 | ≥ 3/5 | 15% |

**任一维度低于 threshold → VERDICT: FAIL → 退回修复 → 下一轮迭代。** 连续 3 轮 FAIL → `blocked`。

### Evaluator 必须

- 声明身份："切换为 Evaluator 角色，仅基于代码文件和 Sprint Contract 的独立评估"
- 每个评分附具体证据（文件:行号）
- 必须触碰真实环境（有 UI → Playwright 点开；有 API → 实际调）
- 反橡皮图章三问：①真的跑过代码？②找到至少一个问题？③有没有说服自己放水？
- 详细评分协议见 [review-checklist.md](.auto-agent/review-checklist.md)

---

## 安全规则

| 规则 | 说明 |
|------|------|
| 🔴 不无人值守 | 至少 Level 1 有人工验收 |
| 🔴 单独 commit | 每个任务独立提交，不合并 |
| 🟢 自动 push | 用户调用 auto-agent = 已授权，PASS 后自动 push |
| 🔴 不放水 | 未达标必须退回 |
| 🔴 不谎报 | 阻塞时不上报通过 |
| 🟡 一个任务一个会话 | 完成当前任务后 Context Reset |

---

## 安装

**通过 claude-workflow-kit（推荐）：**
```bash
./init.ps1 /path/to/your/project   # 部署完整 Harness（含 .auto-agent/ 模板）
```

**手动安装：**
```bash
mkdir -p ~/.claude/skills/auto-agent
cp SKILL.md ~/.claude/skills/auto-agent/
cp -r .auto-agent/ 你的项目/
```

部署后编辑 `architecture.md` 填入项目信息，在 `templates/` 下创建技术栈模板。
