---
description: Git 安全规则 — 无前置条件，始终加载
---

# Git 安全规则

## 禁止（等用户明确指令）
- `git push` — 等用户说"推送"/"push"
- `git commit` — 等用户明确要求
- `git push --force` 到 master/main

## 安全操作
- 提交前先 stash，拉取后再 pop
- 冲突时保留 stash 不删
- 新建 commit 而非 amend（除非用户明确要求）
- 不跳过 hooks（--no-verify）除非用户明确要求

## 提交规范
- 一个 commit 一个逻辑变更
- Message 写 WHY 不写 WHAT
