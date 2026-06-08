#!/bin/bash
# Agent Swarm Skill 安装脚本
# 用法: ./install-skill.sh /path/to/your-project
# 在新项目中安装 swarm skill，之后就可以用 /swarm 调度任务了

TARGET="${1:-.}"

if [ ! -d "$TARGET" ]; then
  echo "用法: ./install-skill.sh /path/to/your-project"
  exit 1
fi

mkdir -p "$TARGET/.claude/skills/swarm"

cat > "$TARGET/.claude/skills/swarm/SKILL.md" << 'SKILL'
---
name: swarm
description: 一句话启动 Agent Swarm 全自动开发管道
version: 1.0.0
triggers:
  - swarm
  - /swarm
  - agent-swarm
  - 调度
---

# swarm — 一句话启动 Agent Swarm

> 输入需求，Agent Swarm 自动分析、拆解、分配、执行。打开看板查看进度。

## 用法

```
/swarm 开发一个用户管理系统
/swarm 帮我重构所有错误处理
/swarm 写一个 Python 脚本批量处理 CSV
```

## 流程

### Step 1: 确保 Agent Swarm 在运行

```bash
curl -s http://localhost:5120/api/health
```

如果返回 `{"status":"ok"}` 则就绪。否则需要先启动 Agent Swarm 服务器。

### Step 2: 获取项目 ID

```bash
curl -s http://localhost:5120/api/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else 'NONE')"
```

如果返回 `NONE`，创建项目：

```bash
curl -s -X POST http://localhost:5120/api/projects \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"name":"<当前项目名>","path":"<当前项目路径>"}'
```

### Step 3: 确保有 Agent

```bash
curl -s http://localhost:5120/api/agents | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
```

如果返回 0，注册默认 Agent 团队：

```bash
curl -s -X POST http://localhost:5120/api/agents \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"project_id":"<PROJECT_ID>","name":"后端工程师","role":"backend-architect","capabilities":["backend","api","python","database"]}'

curl -s -X POST http://localhost:5120/api/agents \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"project_id":"<PROJECT_ID>","name":"前端工程师","role":"frontend-developer","capabilities":["frontend","react","ui"]}'

curl -s -X POST http://localhost:5120/api/agents \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"project_id":"<PROJECT_ID>","name":"QA工程师","role":"testing-evidence-collector","capabilities":["testing","qa"]}'
```

### Step 4: 一键启动全自动管道

```bash
curl -s -X POST http://localhost:5120/api/auto \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"project_id\":\"<PROJECT_ID>\",\"title\":\"<用户的需求>\",\"description\":\"<详细描述>\"}"
```

### Step 5: 报告结果

告诉用户：
- 复杂度评分和建议并行数
- 拆解成的子任务列表
- **看板地址 http://localhost:5173** 实时查看进度
SKILL

echo "✅ swarm skill 已安装到 $TARGET"
echo ""
echo "在 VS Code Claude Code 中就可以用 /swarm 了"
echo "前提: Agent Swarm 服务器在 http://localhost:5120 运行中"
