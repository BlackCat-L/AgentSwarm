---
name: prompt-optimizer
description: 当用户说"优化提示词"、"改进 prompt"、"写提示词"、"提示框架"时触发。
---

# Prompt Optimizer

根据任务场景匹配合适框架，生成更清晰、更可执行的 prompt。

## 工作流

- Step 1: 分析用户输入（原始 prompt / 任务描述 / 模糊想法）
- Step 2: 读 [references/Frameworks_Summary.md](references/Frameworks_Summary.md)，按复杂度和领域匹配框架
- Step 3: 读对应框架文件 `references/frameworks/XX_FrameworkName_Framework.md`
- Step 4: 追问缺失信息（目标、受众、格式、约束）
- Step 5: 生成优化后的 prompt
- Step 6: 说明选框架的原因，按反馈迭代

## 框架速查

- 简单（≤3要素）：APE, ERA, TAG, RTF, BAB
- 中等（4-5要素）：RACE, CRISPE, SPEAR, SMART
- 复杂（6+要素）：RISEN, RASCEF, CRISPE, Atomic Prompting

不要为简单 prompt 强套复杂框架。信息不足先追问。

Full reference: [references/Frameworks_Summary.md](references/Frameworks_Summary.md)
