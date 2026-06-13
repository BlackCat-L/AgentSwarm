---
name: mermaid
description: 当用户要求画流程图、架构图、时序图、状态图、甘特图、ER 图时触发。
---

# Mermaid

## 图类型选择

- 流程/分支 → `flowchart TD`
- 服务调用顺序 → `sequenceDiagram`
- 状态切换 → `stateDiagram-v2`
- 数据库实体 → `erDiagram`
- 排期/里程碑 → `gantt`
- 用户体验路径 → `journey`
- 对象/模块关系 → `classDiagram`
- Git 分支 → `gitGraph`

## 工作流

1. 选图类型（上表，用户指定优先）
2. 抽取 3-9 个关键节点和关系
3. 生成 Mermaid fenced code block
4. 自查：类型声明、节点 ID 唯一、连线闭合、`/` 开头文本加引号
5. 交付代码块 + 一句说明

节点 >12 建议拆图。详见 [references/diagram-selection.md](references/diagram-selection.md)
