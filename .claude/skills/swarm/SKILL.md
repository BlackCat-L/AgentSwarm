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
/swarm 开发一个用户管理系统，支持注册、登录、密码修改、角色分配
/swarm 帮我重构所有的错误处理
/swarm 写一个 Python 脚本批量处理 CSV 文件
```

## 流程

当用户输入 `/swarm <需求>` 后，你必须执行以下步骤：

### Step 1: 获取项目 ID

```bash
curl -s http://localhost:5120/api/projects | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const p=JSON.parse(d.join(''));console.log(p[0]?.id||'none')})"
```

如果返回 `none`，先创建项目。

### Step 2: 确保有 Agent

```bash
curl -s http://localhost:5120/api/agents | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const a=JSON.parse(d.join(''));console.log(a.length||0)})"
```

如果没有 Agent（返回 0），注册默认团队：

```bash
curl -s -X POST http://localhost:5120/api/agents -H "Content-Type: application/json" -d '{"project_id":"<PROJECT_ID>","name":"后端工程师","role":"backend-architect","capabilities":["backend","api","python","database"]}'
curl -s -X POST http://localhost:5120/api/agents -H "Content-Type: application/json" -d '{"project_id":"<PROJECT_ID>","name":"前端工程师","role":"frontend-developer","capabilities":["frontend","react","ui"]}'
curl -s -X POST http://localhost:5120/api/agents -H "Content-Type: application/json" -d '{"project_id":"<PROJECT_ID>","name":"QA工程师","role":"testing-evidence-collector","capabilities":["testing","qa"]}'
```

### Step 3: 一键启动全自动管道

```bash
curl -s -X POST http://localhost:5120/api/auto \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"project_id\":\"<PROJECT_ID>\",\"title\":\"<用户的需求>\",\"description\":\"<用户的详细描述>\"}"
```

### Step 4: 返回结果

告诉用户：
- 复杂度评分
- 拆解成了几个子任务
- **看板地址 http://localhost:5173** 刷新看进度
