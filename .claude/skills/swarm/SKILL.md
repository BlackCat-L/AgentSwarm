---
name: swarm
description: 一句话启动 Agent Swarm 全自动开发管道
version: 1.1.0
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

## ⚠️ 编码铁律

**所有 API 调用必须用 Python，禁止 bash curl 传中文！** Windows 上 bash → curl 链路会经过 GBK codepage 破坏 UTF-8 数据。使用以下 Python 封装或 `PYTHONIOENCODING=utf-8 python3 tools/seed_agents.py`。

## 流程

当用户输入 `/swarm <需求>` 后，你必须执行以下步骤：

### Step 1: 获取项目 ID

```bash
python3 -c "
import urllib.request, json
proj = json.loads(urllib.request.urlopen('http://localhost:5120/api/projects').read())
print(proj[0]['id'] if proj else 'none')
"
```

如果返回 `none`，创建项目：

```bash
python3 -c "
import urllib.request, json
data = json.dumps({'name':'Agent Swarm 默认项目','path':'.'}, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request('http://localhost:5120/api/projects', data=data, method='POST')
req.add_header('Content-Type', 'application/json; charset=utf-8')
resp = json.loads(urllib.request.urlopen(req).read())
print(resp['id'])
"
```

### Step 2: 确保有 Agent

```bash
python3 -c "
import urllib.request, json
agents = json.loads(urllib.request.urlopen('http://localhost:5120/api/agents').read())
print(len(agents))
"
```

如果返回 0（服务器 auto-seed 已涵盖新装，此处为安全兜底）：

```bash
PYTHONIOENCODING=utf-8 python3 tools/seed_agents.py
```

### Step 3: 一键启动全自动管道

**必须用 Python！** bash curl 传中文会损坏编码，导致编排器收到乱码。

```bash
python3 -c "
import urllib.request, json

title = '<用户的需求>'
desc = '<用户的详细描述>'
pid = '<PROJECT_ID>'

body = json.dumps({'project_id': pid, 'title': title, 'description': desc}, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request('http://localhost:5120/api/auto', data=body, method='POST')
req.add_header('Content-Type', 'application/json; charset=utf-8')
resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
print(json.dumps(resp, ensure_ascii=False, indent=2))
"
```

### Step 4: 等待执行，展示看板

告诉用户：
- 复杂度评分（来自 `complexity.score`）
- 拆解结果（`complexity.estimatedPhases`）
- **看板地址 http://localhost:5173** 刷新看板查看进度
- 等待约 15-30 秒后，调用 `/api/tasks` 检查任务是否已创建并展示状态
