---
name: self-improving-agent
description: 自主进化引擎 — 错误捕获、模式检测、自动沉淀到 memory/。每次犯错都让 Agent 变得更聪明。
triggers:
  - 错误/纠正
  - 新发现
  - 自我改进
  - self-improving
---

# Self-Improving Agent — 自主进化引擎

> 核心原则：**每次 Agent 犯错，修复不仅要改代码，还要沉到 memory/ 里，让它永远不会再犯同样的错误。**
> — Mitchell Hashimoto "My AI Adoption Journey" (2026.2)

---

## 三层学习架构

```
.learnings/ERRORS.md          ← 原始错误日志（会话级）
         │
         ▼ 检测到同一模式 ≥3 次
memory/feedback-xxx.md        ← 持久化规则（Why + How to apply）
         │
         ▼ 定期审查
记忆合并（curator 式）         ← 相似规则合并为 umbrella 规则
```

---

## Phase 1: 即时捕获

**触发条件（任一满足）：**
- 命令/操作失败（编译错误、运行时异常、API 调用失败）
- 用户纠正（"不对"、"应该是"、"你错了"、"实际上..."）
- 发现知识过时或错误
- 发现比预期更好的方案

**动作：**
1. 立即追加到 `.learnings/ERRORS.md` 或 `.learnings/LEARNINGS.md`（按类型）
2. 格式：`[ERR/LRN-YYYYMMDD-XXX]` + 一句话描述 + 根因 + 修复

---

## Phase 2: 模式检测 & 自动升级

**每次写入 .learnings/ 后，执行此检查：**

```
1. 扫描 .learnings/ERRORS.md 和 .learnings/LEARNINGS.md
2. 用关键词聚类（同类型错误、同模块、同根因）
3. 同一模式出现 ≥3 次 → 自动升级到 memory/feedback-xxx.md
```

**升级判定标准：**

| 条件 | 动作 |
|------|------|
| 同模式 < 3 次 | 留在 .learnings/ |
| 同模式 ≥ 3 次 + 跨 ≥2 个不同会话 | 创建 `memory/feedback-xxx.md` |
| 同模式 ≥ 5 次 | 紧急升级，加 `Priority: critical` |

**升级时创建的 feedback 文件必须包含：**
```yaml
---
name: feedback-<描述性短名>
description: 一句话描述
metadata:
  node_type: memory
  type: feedback
---
**核心规则：...**
**Why:** 这个规则的存在理由（引用至少一个具体错误案例）
**How to apply:** 何时触发、怎么执行
参见 [[related-memory-name]]
```

---

## Phase 3: 记忆审查协议（Curator 式）

> 灵感来自 Hermes Agent curator.py — 定期扫描 memory/，合并散乱的窄规则为 umbrella 规则。

**触发时机：**
- 每完成 5 个 Sprint（或每 3 天，以先到为准）
- Agent 在完成主要任务后主动自问："memory/ 里有没有该合并的规则？"

**审查步骤：**

1. **列出所有 feedback 文件**
   ```
   扫描 memory/feedback-*.md
   ```

2. **按主题聚类**
   ```
   Git 安全相关: feedback-git-safety, feedback-xxx-push, ...
   代码质量相关: feedback-code-quality, feedback-xxx-review, ...
   ```

3. **对每一组，问三个问题：**
   - 这些规则描述的是同一个领域的问题吗？
   - 如果是一个人类维护者，会写成一个规则还是 N 个？
   - 包含的子规则是否都可以作为 umbrella 规则的 subsection？

4. **合并操作：**
   - **MERGE**：挑最宽的作为 umbrella → 把其他规则的核心内容作为 subsection 加入 → 归档其他文件
   - **KEEP**：如果规则已经足够独立且互不重叠 → 保留原样
   - **NEVER DELETE**：归档的文件移到 `.learnings/archive/`，不删除

5. **更新 MEMORY.md 索引**，确保 `[[name]]` 交叉引用正确

**审查结束后输出结构化报告：**
```markdown
## 记忆审查报告 — YYYY-MM-DD

### 合并
- `feedback-old-name` → 并入 `feedback-umbrella-name`（原因：xxx）

### 保留
- `feedback-xxx` — 独立规则，不与任何其他规则重叠

### 新增
- `feedback-new-name` — 从 .learnings/ 升级（出现 3+ 次）

### 更新
- MEMORY.md 索引已同步
```

---

## 日志格式

### .learnings/ERRORS.md

```markdown
## [ERR-YYYYMMDD-XXX] 简短描述

**时间**: ISO-8601
**优先级**: low | medium | high | critical
**根因**: 一句话
**修复**: 一句话
**相关文件**: path/to/file

---
```

### .learnings/LEARNINGS.md

```markdown
## [LRN-YYYYMMDD-XXX] category

**时间**: ISO-8601
**类别**: correction | insight | knowledge_gap | best_practice
**摘要**: 一句话
**详情**: 发生了什么、什么是对的、为什么
**操作**: 具体的改进措施

---
```

### ID 生成规则

`TYPE-YYYYMMDD-XXX`，TYPE = `ERR` | `LRN`，XXX = 当天序号（001, 002...）或随机 3 字符。

---

## 升级决策树

```
发现错误/纠正/新知识
    │
    ├─ 是已知问题的重复吗？
    │   ├─ 是 → 在已有 .learnings/ 条目上加 Recurrence-Count
    │   │       ├─ ≥3 次 → 自动创建 memory/feedback-xxx.md
    │   │       └─ <3 次 → 仅更新 .learnings/
    │   └─ 否 → 新建 .learnings/ 条目
    │
    └─ 涉及安全问题或阻断性 bug？
        └─ 是 → 立即升级，Priority: critical
```
