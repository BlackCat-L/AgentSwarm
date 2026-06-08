---
description: Sprint 结束时强制自检 — 每个检查项必须产生文件证据
---

# Sprint 自检协议

> 不做橡皮图章。每个检查项必须有可验证的文件证据才算通过。

## Sprint 结束时必须完成

每完成一个 Sprint（或一段实质性编码工作后），Agent 必须在结束前完成此清单：

| # | 检查项 | 怎么验证 | 证据 |
|---|--------|---------|------|
| 1 | 代码已编译？ | `dotnet build` 或等效编译命令 | 编译输出无 error |
| 2 | 审查已跑？ | 调用了 `code-review-unity` 或 `simplify` | 审查输出文件或对话日志 |
| 3 | 验收标准全过？ | Sprint Contract 逐条核对 | `progress.md` 中更新状态 |
| 4 | 没有遗漏 TODO/FIXME？ | `grep -r "TODO\|FIXME" --include="*.cs"` | 输出为空或有合理解释 |
| 5 | 只有预期的文件变更？ | `git diff --name-only HEAD` | 列表与 Sprint Contract `critical_files` 一致 |
| 6 | 今天的错误已记录？ | `.learnings/ERRORS.md` 今天有更新，或今天没遇到错误 | 文件时间戳或内容 |
| 7 | git 状态干净？ | 改动已提交或明确记录到 `progress.md` | `git status --porcelain` |

## 会话结束前

在 `Stop` hook (quality-gate.sh) 运行后，Agent 应在对话中输出：

```
Sprint 自检结果:
✅ 1. 编译通过
✅ 2. 审查已跑
✅ 3. 验收: 3/3 PASS
✅ 4. 无遗漏 TODO
✅ 5. 改动: init.ps1, CLAUDE.md (2 files, 与预期一致)
✅ 6. 今日无新错误
✅ 7. git 已提交 (commit abc123)
```

## 如果某项未通过

- 标记为 ❌ 并说明原因
- 写入 `progress.md` 作为下次会话的待办项
- **禁止**在未完成全部检查项的情况下说"任务完成"

## 下一轮验证

`session-start.sh` 自动读取上轮的审计结果。如果检测到跳过项，注入警告到上下文。
