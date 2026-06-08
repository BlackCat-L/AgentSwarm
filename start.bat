@echo off
chcp 65001 >nul
title Agent Swarm — Dark Factory

echo.
echo  ⬛ Agent Swarm — Dark Factory 黑灯工厂
echo  ─────────────────────────────────────
echo.

cd /d "%~dp0"

echo  [1/2] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ 未找到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)
echo  ✅ Node.js %node_version%

echo  [2/2] 启动服务...
echo  ─────────────────────────────────────
echo  后端 API : http://localhost:5120
echo  前端看板 : http://localhost:5173
echo  ─────────────────────────────────────
echo.

start http://localhost:5173

npx concurrently -n server,web -c cyan,green "pnpm dev:server" "pnpm dev:web"

pause
