---
description: 安全规则 — 始终加载
---

# 安全规则

## 敏感操作禁令
- 不生成/猜测 URL，除非用户提供
- 不修改 .env / .pem / credentials / secrets
- 不执行用户未授权的网络请求

## 依赖安全
- 安装任何 skill 前必须审查（skill-vetter）
- 不引入未经验证的第三方包
- 优先用项目已有依赖

## 代码安全
- 无硬编码密钥/token/密码
- 无 SQL 拼接（用参数化查询）
- 无命令注入（不拼接用户输入到 shell 命令）
- 输入验证在系统边界

## 安全审查
- 发布前运行 `security-review`
- 涉及 auth/data/input 的改动必须额外审查
