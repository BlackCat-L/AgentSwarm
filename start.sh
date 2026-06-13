#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║     Agent Swarm — Dark Factory          ║"
echo "║     全自主多 Agent 开发调度平台           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

STAMP="$HOME/.claude/.swarm-deploy-stamp"

# =================================================================
#  Step 1: Node.js — skip if already installed
# =================================================================
echo "[1/5] Node.js..."
if command -v node &>/dev/null; then
  echo "  SKIP Node $(node --version) (already installed)"
else
  echo "  未检测到 Node.js，尝试自动安装..."

  if command -v brew &>/dev/null; then
    echo "  使用 Homebrew..."
    brew install node@22
  elif command -v apt-get &>/dev/null; then
    echo "  使用 apt..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    echo "  使用 dnf..."
    sudo dnf module install -y nodejs:22
  elif command -v yum &>/dev/null; then
    echo "  使用 yum..."
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
    sudo yum install -y nodejs
  elif command -v pacman &>/dev/null; then
    echo "  使用 pacman..."
    sudo pacman -S --noconfirm nodejs
  fi

  if command -v node &>/dev/null; then
    echo "  DONE Node.js 安装完成 — 请重新运行 start.sh"
    exit 0
  else
    echo "  FAIL 无法自动安装，请手动安装: https://nodejs.org"
    exit 1
  fi
fi

# =================================================================
#  Step 2: pnpm — skip if already installed
# =================================================================
echo "[2/5] pnpm..."
if command -v pnpm &>/dev/null; then
  echo "  SKIP pnpm $(pnpm --version) (already installed)"
else
  echo "  安装 pnpm..."

  npm install -g pnpm 2>/dev/null && echo "  DONE pnpm installed via npm" && true
  if ! command -v pnpm &>/dev/null; then
    corepack enable pnpm 2>/dev/null && echo "  DONE pnpm installed via corepack" && true
  fi
  if ! command -v pnpm &>/dev/null; then
    npm_prefix="$(npm config get prefix 2>/dev/null)" && [ -n "$npm_prefix" ] && export PATH="$npm_prefix/bin:$PATH"
  fi

  if command -v pnpm &>/dev/null; then
    echo "  DONE pnpm $(pnpm --version)"
  else
    echo "  FAIL 无法安装 pnpm — 请手动运行: npm install -g pnpm"
    exit 1
  fi
fi

# =================================================================
#  Step 3: Sync skills to global (~/.claude/skills/)
# =================================================================
echo "[3/5] Skills..."

GLOBAL_SKILLS="$HOME/.claude/skills"
LOCAL_SKILLS="$(dirname "$0")/.claude/skills"
mkdir -p "$GLOBAL_SKILLS" 2>/dev/null

SKILL_NEW=0
SKILL_SKIP=0

for skill_dir in "$LOCAL_SKILLS"/*/; do
  skill_name="$(basename "$skill_dir")"
  if [ -d "$GLOBAL_SKILLS/$skill_name" ]; then
    SKILL_SKIP=$((SKILL_SKIP + 1))
  else
    cp -r "$skill_dir" "$GLOBAL_SKILLS/$skill_name" 2>/dev/null && SKILL_NEW=$((SKILL_NEW + 1))
  fi
done

if [ "$SKILL_NEW" -gt 0 ]; then
  echo "  DONE $SKILL_NEW new skills synced, $SKILL_SKIP already present"
else
  echo "  SKIP All $SKILL_SKIP skills already present (up to date)"
fi

# =================================================================
#  Step 4: Dependencies — skip if unchanged
# =================================================================
echo "[4/5] Dependencies..."

if [ ! -d "node_modules" ]; then
  echo "  First run: pnpm install..."
  pnpm install
  echo "  DONE dependencies installed"
elif [ "pnpm-lock.yaml" -nt "node_modules/.pnpm" ] 2>/dev/null || [ "package.json" -nt "node_modules/.pnpm" ] 2>/dev/null; then
  echo "  Dependencies changed, updating..."
  pnpm install
  echo "  DONE dependencies updated"
else
  echo "  SKIP node_modules up to date (already installed)"
fi

# =================================================================
#  Step 5: Start services
# =================================================================
echo "[5/5] Starting..."
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  后端 API  http://localhost:5120        │"
echo "│  前端看板  http://localhost:5173        │"
echo "│                                         │"
echo "│  按 Ctrl+C 停止所有服务                  │"
echo "└─────────────────────────────────────────┘"
echo ""

# Save deploy stamp
echo "$(date)" > "$STAMP"

# Open browser
if command -v open &>/dev/null; then
  open http://localhost:5173
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173
fi

pnpm dev:stable
