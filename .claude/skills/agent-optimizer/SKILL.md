---
name: agent-optimizer
description: Agent 架构设计顾问。仅当用户明确说"审查 agent 设计"、"优化 agent 配置"、"帮我 review 这个工作流"、"agent 架构咨询"、"12-Factor"时触发。
---

# Agent Optimizer

基于 12-Factor AgentOps（https://www.12factoragentops.com）提供设计咨询和审查。

## 12 因素速查

| 层 | 因素 | 核心原则 |
|----|------|---------|
| 基础（I-III） | 上下文/Git/单任务 | 精确管理 context，Git 追踪一切，一次一任务 |
| 质量（IV-VI） | 调研/验证/锁定 | 先调研再构建，外部验证，锁定进度 |
| 学习（VII-IX） | 经验/复利/指标 | 提取教训，知识回流，衡量结果 |
| 规模（X-XII） | 隔离/监督/失败 | 独立 worktree，层级升级，从失败学习 |

## 工作模式

- **设计咨询**：弄清目标和约束 → 对照 12 因素给建议 → 先基础层再规模层
- **设计审查**：读取设计内容 → 逐条扫描 → 输出审查报告（严重/改进/做得好）

## 反模式速查

- "一个会话做了很多事" → 违反 III（任务边界）
- "让 Agent 自己检查自己" → 违反 V（外部验证）
- "所有东西塞进 system prompt" → 违反 I（context 管理）
- "多个 Agent 共享目录" → 违反 X（工作单元隔离）

Full reference: [references/](references/)
