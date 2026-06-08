---
name: security-hardening
description: 保护 Claude Code 工作区免受提示注入、数据外泄、恶意 Skill 和工作区篡改。安装/获取 Skill、安全扫描/审计时触发。
version: 1.0.0
tags: [安全, 加固, 审计, 保护]
---

# 安全加固

一套综合安全工具箱，保护工作区免受恶意 Skill、提示注入、数据外泄和工作区篡改的攻击。

## 威胁模型

| 威胁 | 说明 | 对应工具 |
|------|------|----------|
| **提示注入** | 恶意 Skill 覆盖系统提示、无视安全规则、操控行为 | `scan-skills.sh` |
| **数据外泄** | Skill 让 Agent 把敏感数据发到外部 | `audit-outbound.sh` |
| **Skill 篡改** | 已安装 Skill 在审查后被偷偷修改 | `integrity-check.sh` |
| **工作区暴露** | 敏感文件权限不对、缺少 .gitignore | `harden-workspace.sh` |
| **供应链攻击** | 新装 Skill 包含隐藏恶意代码 | `install-guard.sh` |

## 快速开始

```bash
# 扫描所有已安装 Skill 的恶意代码
./scripts/scan-skills.sh

# 审计数据外连风险
./scripts/audit-outbound.sh

# 初始化完整性基线
./scripts/integrity-check.sh --init

# 加固工作区
./scripts/harden-workspace.sh --fix

# 安装新 Skill 前检查
./scripts/install-guard.sh /path/to/new-skill/
```

## 推荐配置流程

1. **初次安装：**
   ```bash
   ./scripts/scan-skills.sh              # 扫描现有 Skill
   ./scripts/audit-outbound.sh           # 审计外连风险
   ./scripts/integrity-check.sh --init   # 创建完整性基线
   ./scripts/harden-workspace.sh --fix   # 加固工作区
   ```

2. **安装新 Skill 前：**
   ```bash
   ./scripts/install-guard.sh /path/to/new-skill/
   ```

3. **定期巡检：**
   ```bash
   ./scripts/integrity-check.sh          # 检测篡改
   ./scripts/scan-skills.sh              # 用新规则重新扫描
   ```
