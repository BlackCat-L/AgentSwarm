#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║     Agent Swarm — Dark Factory          ║"
echo "║     全自主多 Agent 开发调度平台           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# 1. Check Node.js
echo "[1/4] 检查 Node.js..."
if ! command -v node &>/dev/null; then
  echo "❌ 未找到 Node.js，请安装 Node.js 22+: https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node --version)"

# 2. Install pnpm
echo "[2/4] 检查 pnpm..."
if ! command -v pnpm &>/dev/null; then
  echo "  正在安装 pnpm..."
  npm install -g pnpm
fi
echo "✅ pnpm $(pnpm --version)"

# 3. Install dependencies
echo "[3/4] 安装依赖..."
if [ ! -d "node_modules" ]; then
  echo "  首次运行，正在安装依赖..."
  pnpm install
else
  echo "✅ 依赖已就绪"
fi

# 4. Start
echo "[4/4] 启动服务..."
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  后端 API  http://localhost:5120        │"
echo "│  前端看板  http://localhost:5173        │"
echo "│                                         │"
echo "│  按 Ctrl+C 停止所有服务                  │"
echo "└─────────────────────────────────────────┘"
echo ""

# Open browser
if command -v open &>/dev/null; then
  open http://localhost:5173
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173
fi

pnpm dev
