#!/usr/bin/env bash
# ============================================================
# 项目环境初始化脚本
#
# 用法: bash init.sh
#
# 每次新会话开始时，auto-agent 自动运行此脚本。
# 根据项目实际情况修改以下内容。
# ============================================================
set -euo pipefail

echo "━━━ 环境初始化 ━━━"

# ── 安装依赖 ──────────────────────────────────────────────
# 示例（Node.js 项目）:
# npm install
#
# 示例（Python 项目）:
# pip install -r requirements.txt
# 或: uv sync
#
# 示例（Unity 项目）:
# 跳过，Unity Editor 自行管理依赖

# ── 启动开发服务 ──────────────────────────────────────────
# 示例（Next.js）:
# npm run dev &
#
# 示例（Python API）:
# uvicorn main:app --reload &

echo "✅ 环境就绪"
