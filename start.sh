#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║     Agent Swarm — Dark Factory          ║"
echo "║     全自主多 Agent 开发调度平台           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# 1. Check/Install Node.js
echo "[1/5] 检查 Node.js..."
if ! command -v node &>/dev/null; then
  echo "  未检测到 Node.js，尝试自动安装..."

  # macOS
  if command -v brew &>/dev/null; then
    echo "  使用 Homebrew 安装 Node.js..."
    brew install node@22
  # Linux (apt)
  elif command -v apt-get &>/dev/null; then
    echo "  使用 apt 安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  # Linux (yum/dnf)
  elif command -v dnf &>/dev/null; then
    echo "  使用 dnf 安装 Node.js..."
    sudo dnf module install -y nodejs:22
  elif command -v yum &>/dev/null; then
    echo "  使用 yum 安装 Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
    sudo yum install -y nodejs
  # Arch
  elif command -v pacman &>/dev/null; then
    echo "  使用 pacman 安装 Node.js..."
    sudo pacman -S --noconfirm nodejs
  fi

  if command -v node &>/dev/null; then
    echo "✅ Node.js 安装完成"
  else
    echo "❌ 无法自动安装，请手动安装: https://nodejs.org"
    exit 1
  fi
fi
echo "✅ Node.js $(node --version)"

# 2. Install pnpm
echo "[2/5] 检查 pnpm..."
if ! command -v pnpm &>/dev/null; then
  echo "  正在安装 pnpm..."

  # Method 1: npm global install
  npm install -g pnpm 2>/dev/null || true
  if command -v pnpm &>/dev/null; then
    :
  # Method 2: corepack (built into Node.js 16+)
  elif corepack enable pnpm 2>/dev/null; then
    :
  # Method 3: add npm global prefix to PATH
  elif npm_prefix="$(npm config get prefix 2>/dev/null)" && [ -n "$npm_prefix" ]; then
    export PATH="$npm_prefix/bin:$PATH"
  fi

  if ! command -v pnpm &>/dev/null; then
    echo "❌ 无法安装 pnpm"
    echo "  请手动安装: npm install -g pnpm"
    echo "  或通过 corepack 启用: corepack enable pnpm"
    exit 1
  fi
fi
echo "✅ pnpm $(pnpm --version)"

# 3. Global /swarm skill
echo "[3/5] 安装全局 /swarm skill..."
SKILL_DIR="$HOME/.claude/skills/swarm"
SKILL_FILE="$SKILL_DIR/SKILL.md"
if [ ! -f "$SKILL_FILE" ]; then
  mkdir -p "$SKILL_DIR" 2>/dev/null
  if cp "$(dirname "$0")/.claude/skills/swarm/SKILL.md" "$SKILL_FILE" 2>/dev/null; then
    echo "✅ 已安装全局 /swarm skill"
  else
    echo "⚠️  无法安装全局 skill"
  fi
else
  echo "✅ 全局 /swarm skill 已安装"
fi

# 4. Install dependencies
echo "[4/5] 安装依赖..."
if [ ! -d "node_modules" ]; then
  echo "  首次运行，正在安装依赖..."
  pnpm install
else
  echo "✅ 依赖已就绪"
fi

# 5. Start
echo "[5/5] 启动服务..."
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
