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

:: ── Step 1: Check/Install Node.js ─────────────────────
echo  [1/4] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  未检测到 Node.js，尝试自动安装...

    :: Try winget (Windows 10/11 built-in)
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo  使用 winget 安装 Node.js LTS...
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        if errorlevel 1 (
            echo  ❌ winget 安装失败，尝试 choco...
        ) else (
            echo  ✅ Node.js 安装完成，请重新运行 start.bat
            echo  （安装后需要重启终端使环境变量生效）
            pause
            exit /b 0
        )
    )

    :: Try chocolatey
    where choco >nul 2>&1
    if not errorlevel 1 (
        echo  使用 chocolatey 安装 Node.js...
        choco install nodejs-lts -y
        if not errorlevel 1 (
            echo  ✅ Node.js 安装完成，请重新运行 start.bat
            pause
            exit /b 0
        )
    )

    :: Fallback: open download page
    echo  无法自动安装，正在打开 Node.js 下载页面...
    start https://nodejs.org/zh-cn/download
    echo  请下载安装 Node.js LTS 版本后重新运行 start.bat
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
