---
description: 代码质量强制规则 — 无前置条件，始终加载
---

# 代码质量门禁

## 禁止模式
- 不凭记忆写代码 — 先读相关文件再动手
- 不跳过 Skill 门禁 — 改完代码必须自检

## 必须执行
- 任何代码修改后 → `Skill("simplify")` 自检
- 检测到错误/纠正 → `Skill("self-improving-agent")` 记录到 .learnings/
- 3+ 文件跨模块改动 → `Skill("auto-agent")` 做任务分解

## 验证规则
- 不安检通过不许说"完成"
- MCP 未连接时如实说明，禁止假装验证通过
