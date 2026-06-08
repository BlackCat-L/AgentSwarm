---
name: skill-optimizer
description: 审查并优化现有 skill。当用户说"优化/检查/压缩/改进 skill"时触发。默认先审查，用户确认后才修改。
---

# Skill Optimizer

先审查，再规划，最后在确认后修改。

## 工作流

- Step 1: Scope — 确认目标 skill 和优化范围
- Step 2: Review — 读 SKILL.md 和 references/，用 [references/review-checklist.md](references/review-checklist.md) 做基线
- Step 3: Plan — 输出诊断 + 计划，等待明确确认（"按计划执行"/"开始修改"）
- Step 4: Implement — 确认后最小改动，补 README/索引/安装说明/确认门槛
- Step 5: Verify — 校验 frontmatter、触发语义、正文精简度、references 分工

## 核心原则

- 不在确认前改文件
- "我看看"/"有道理" 不算确认
- 发现敏感信息只描述类型和位置，不回显值
- 高副作用操作必须补确认门槛

Full reference: [references/skill-design-review-framework.md](references/skill-design-review-framework.md)
