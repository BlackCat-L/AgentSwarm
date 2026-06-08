---
name: session-cleaner
description: 当用户提到清理 sessions、删除旧 session、session 文件膨胀时触发。
---

# Session Cleaner

## 触发条件

- 用户说"清理 session"、"删 session"、"session 太多"
- 自动检查触发（session 文件 >200 或总大小 >500MB）

## 操作流程

### Step 1: 检查现状

```bash
# Claude Code sessions
ls ~/.claude/sessions/*.jsonl 2>/dev/null | wc -l
du -sh ~/.claude/sessions/ 2>/dev/null

# 项目级 sessions
ls .claude/sessions/*.jsonl 2>/dev/null | wc -l
du -sh .claude/sessions/ 2>/dev/null
```

### Step 2: 确认清理范围

- **保留**：当前活跃 session + 最近 7 天有更新的 session
- **清理**：旧 cron session、30 天以上的非活跃 session

### Step 3: 执行清理

```bash
# 清理 Claude Code 全局旧 session
find ~/.claude/sessions/ -name "*.jsonl" -mtime +30 -type f -delete 2>/dev/null

# 清理项目级旧 session
find .claude/sessions/ -name "*.jsonl" -mtime +30 -type f -delete 2>/dev/null
```

### Step 4: 验证并报告

```bash
ls ~/.claude/sessions/*.jsonl 2>/dev/null | wc -l
```

输出格式：
```
Session 清理完成
- 清理前: X 文件, Y MB
- 清理后: A 文件, B MB
- 已删除: C 个旧 session
```

## 安全规则

- 永远不删当前活跃的 session
- 删除前先 `ls` 确认文件列表
- 用 `find ... -delete` 而非 `rm -rf`
- 磁盘空间足够时不激进清理
