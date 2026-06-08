@echo off
chcp 65001 >nul
title Agent Swarm — Dark Factory

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     Agent Swarm — Dark Factory          ║
echo  ║     全自主多 Agent 开发调度平台           ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── Step 1: Check Node.js ──────────────────────────────
echo  [1/4] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ 未找到 Node.js
    echo  请访问 https://nodejs.org 下载安装 Node.js 22+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  ✅ Node.js %NODE_VER%

:: ── Step 2: Install pnpm ───────────────────────────────
echo  [2/4] 检查 pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo  正在安装 pnpm...
    npm install -g pnpm
    if errorlevel 1 (
        echo  ❌ pnpm 安装失败，请手动执行: npm install -g pnpm
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VER=%%i
echo  ✅ pnpm %PNPM_VER%

:: ── Step 3: Install dependencies ───────────────────────
echo  [3/4] 安装依赖...
if not exist "node_modules" (
    echo  首次运行，正在安装依赖（可能需要2-3分钟）...
    pnpm install
    if errorlevel 1 (
        echo  ❌ 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo  ✅ 依赖已就绪
)

:: ── Step 4: Start services ─────────────────────────────
echo  [4/4] 启动服务...
echo.
echo  ┌─────────────────────────────────────────┐
echo  │  后端 API  http://localhost:5120        │
echo  │  前端看板  http://localhost:5173        │
echo  │                                         │
echo  │  按 Ctrl+C 停止所有服务                  │
echo  └─────────────────────────────────────────┘
echo.

:: Open browser after a short delay
start "" http://localhost:5173

:: Start both servers
npx concurrently -n api,web -c cyan,green "pnpm dev:server" "pnpm dev:web"

pause
