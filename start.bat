@echo off
setlocal enabledelayedexpansion
title Agent Swarm - Dark Factory
cd /d "%~dp0"

rem ── Force UTF-8 codepage (prevents Chinese garbled text) ──
chcp 65001 >nul 2>&1

echo.
echo   Agent Swarm - Dark Factory
echo   ==========================
echo.

rem --- Step 1: Node.js ------------------------------------
echo   [1/5] Node.js...
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
echo   [2/5] pnpm...
where pnpm >nul 2>&1
if %errorlevel% equ 0 goto pnpm_ok

echo   Installing pnpm...

rem Method 1: npm global install
call npm install -g pnpm
where pnpm >nul 2>&1
if %errorlevel% equ 0 goto pnpm_ok

rem Method 2: corepack (built into Node.js 16+)
echo   Trying corepack...
call corepack enable pnpm >nul 2>&1
where pnpm >nul 2>&1
if %errorlevel% equ 0 goto pnpm_ok

rem Method 3: add npm global prefix to PATH, then retry
for /f "tokens=*" %%p in ('npm config get prefix') do set "NPM_PREFIX=%%p"
if defined NPM_PREFIX (
    set "PATH=!NPM_PREFIX!;!PATH!"
    where pnpm >nul 2>&1
    if !errorlevel! equ 0 goto pnpm_ok
)

echo   ERROR: Failed to install pnpm
echo   Please install manually: npm install -g pnpm
echo   Or enable via Node.js corepack: corepack enable pnpm
pause
exit /b 1

:pnpm_ok
for /f "tokens=*" %%i in ('pnpm --version') do echo   OK pnpm %%i

rem --- Step 3: Sync skills to global (~/.claude/skills/) ----
echo   [3/5] Skills...

set "GLOBAL_SKILLS=%USERPROFILE%\.claude\skills"
set "LOCAL_SKILLS=%~dp0.claude\skills"

if not exist "%GLOBAL_SKILLS%" mkdir "%GLOBAL_SKILLS%" 2>nul

echo     Syncing skills to global...
set "SKILL_COUNT=0"
for /d %%d in ("%LOCAL_SKILLS%\*") do (
    set "SKILL_NAME=%%~nxd"
    set "DEST=%GLOBAL_SKILLS%\!SKILL_NAME!"
    if not exist "!DEST!" (
        xcopy "%%d\*" "!DEST!\" /E /I /Q /Y >nul 2>&1
        if !errorlevel! equ 0 set /a SKILL_COUNT+=1
    )
)
echo   OK Synced !SKILL_COUNT! new skills to global (%GLOBAL_SKILLS%)

rem --- Step 4: Dependencies -------------------------------
echo   [4/5] Dependencies...
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

rem --- Step 5: Start --------------------------------------
echo   [5/5] Starting...
echo.
echo   API  http://localhost:5120
echo   Web  http://localhost:5173
echo   Ctrl+C to stop
echo.

start "" http://localhost:5173
call pnpm dev:stable
pause
