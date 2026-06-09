@echo off
setlocal enabledelayedexpansion
title Agent Swarm - Dark Factory
cd /d "%~dp0"

echo.
echo   Agent Swarm - Dark Factory
echo   ==========================
echo.

rem --- Step 1: Node.js ------------------------------------
echo   [1/4] Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 goto install_node
for /f "tokens=*" %%i in ('node --version') do echo   OK Node %%i
goto check_pnpm

:install_node
echo   Node.js not found, trying auto-install...
where winget >nul 2>&1
if %errorlevel% equ 0 (
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! equ 0 (
        echo   Node.js installed! Please re-run start.bat.
        pause
        exit /b 0
    )
)
where choco >nul 2>&1
if %errorlevel% equ 0 (
    choco install nodejs-lts -y
    if !errorlevel! equ 0 (
        echo   Node.js installed! Please re-run start.bat.
        pause
        exit /b 0
    )
)
echo   Cannot auto-install, opening download page...
start https://nodejs.org/en/download
echo   Please install Node.js LTS, then re-run start.bat
pause
exit /b 1

rem --- Step 2: pnpm ---------------------------------------
:check_pnpm
echo   [2/4] pnpm...
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo   Installing pnpm...
    npm install -g pnpm
    if !errorlevel! neq 0 (
        echo   ERROR: Failed to install pnpm
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('pnpm --version') do echo   OK pnpm %%i

rem --- Step 3: Dependencies -------------------------------
echo   [3/4] Dependencies...
if not exist "node_modules" (
    echo   First run: installing packages...
    call pnpm install
    if !errorlevel! neq 0 (
        echo   ERROR: pnpm install failed
        pause
        exit /b 1
    )
) else (
    echo   OK dependencies ready
)

rem --- Step 4: Start --------------------------------------
echo   [4/4] Starting...
echo.
echo   API  http://localhost:5120
echo   Web  http://localhost:5173
echo   Ctrl+C to stop
echo.

start "" http://localhost:5173
call npx concurrently -n api,web -c cyan,green "pnpm dev:server" "pnpm dev:web"
pause
