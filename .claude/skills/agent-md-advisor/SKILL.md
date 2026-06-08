---
name: agent-md-advisor
description: 当用户询问 AGENTS.md/CLAUDE.md 的格式、结构、最佳实践，或审查/优化/创建 AI coding 指令文件时触发。不适用于通用 README 或 agent 系统架构设计。
---

# Agent Markdown Advisor

## 工作模式

- **问答**：解释格式、章节、最佳实践
- **诊断**：指出已有文件的问题（不改文件）
- **优化**：用户明确要求时才修改文件
- **创建**：根据项目描述生成新文件

## 工作流

1. 识别模式和目标文件（AGENTS.md 通用 / CLAUDE.md Claude 专属）
2. 按需读取 references/（best-practices / review-rubric / templates）
3. 读取最小必要项目上下文（README、package.json、现有 AI 配置）
4. 输出诊断/方案/草稿
5. 用户要求落地时才修改文件

## 核心原则

- AGENTS.md 理想 150 行内，CLAUDE.md 优先 80-120 行，超 200 行必须拆分
- 每行回答："删掉这行，agent 会更容易犯错吗？"
- 只写项目特有、非显然、可执行的规则
- 不要凭空发明命令，先看 package.json / Makefile 等可验证来源

Full reference: [references/best-practices.md](references/best-practices.md)
