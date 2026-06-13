@echo off
setlocal enabledelayedexpansion
title Agent Swarm - Dark Factory
cd /d "%~dp0"

rem Force UTF-8 codepage
chcp 65001 >nul 2>&1

echo.
echo   Agent Swarm - Dark Factory
echo   ==========================
echo.

rem =================================================================
rem  Step 1: Node.js
rem =================================================================
echo   [1/5] Node.js...

where node >nul 2>&1
if %errorlevel% neq 0 goto install_node

for /f "tokens=*" %%i in ('node --version') do echo   SKIP Node %%i [already installed]
goto check_pnpm

:install_node
echo         Not found, trying auto-install...

where winget >nul 2>&1
if %errorlevel% equ 0 (
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! equ 0 (
        echo   DONE Node.js installed - Please re-run start.bat
        pause
        exit /b 0
    )
)

where choco >nul 2>&1
if %errorlevel% equ 0 (
    choco install nodejs-lts -y
    if !errorlevel! equ 0 (
        echo   DONE Node.js installed - Please re-run start.bat
        pause
        exit /b 0
    )
)

echo   FAIL Cannot auto-install Node.js
echo   Please install manually: https://nodejs.org/en/download
pause
exit /b 1

rem =================================================================
rem  Step 2: pnpm
rem =================================================================
:check_pnpm
echo   [2/5] pnpm...

where pnpm >nul 2>&1
if %errorlevel% neq 0 goto install_pnpm

for /f "tokens=*" %%i in ('pnpm --version') do echo   SKIP pnpm %%i [already installed]
goto sync_skills

:install_pnpm
echo         Installing pnpm...

call npm install -g pnpm 2>nul
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
    echo   DONE pnpm installed via npm
    goto sync_skills
)

echo         Trying corepack...
call corepack enable pnpm >nul 2>&1
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
    echo   DONE pnpm installed via corepack
    goto sync_skills
)

for /f "tokens=*" %%p in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%p"
if defined NPM_PREFIX (
    set "PATH=!NPM_PREFIX!;!PATH!"
    where pnpm >nul 2>&1
    if !errorlevel! equ 0 (
        echo   DONE pnpm found in npm prefix
        goto sync_skills
    )
)

echo   FAIL Cannot install pnpm
echo   Please run: npm install -g pnpm
pause
exit /b 1

rem =================================================================
rem  Step 3: Sync skills to global
rem =================================================================
:sync_skills
echo   [3/5] Skills...

set "GLOBAL_SKILLS=%USERPROFILE%\.claude\skills"
set "LOCAL_SKILLS=%~dp0.claude\skills"

if not exist "%GLOBAL_SKILLS%" mkdir "%GLOBAL_SKILLS%" 2>nul

set "SKILL_NEW=0"
set "SKILL_SKIP=0"

for /d %%d in ("%LOCAL_SKILLS%\*") do (
    set "SKILL_NAME=%%~nxd"
    set "DEST=%GLOBAL_SKILLS%\!SKILL_NAME!"
    if exist "!DEST!" (
        set /a SKILL_SKIP+=1
    ) else (
        xcopy "%%d\*" "!DEST!\" /E /I /Q /Y >nul 2>&1
        if !errorlevel! equ 0 set /a SKILL_NEW+=1
    )
)

if !SKILL_NEW! gtr 0 (
    echo   DONE !SKILL_NEW! new skills synced, !SKILL_SKIP! already present
) else (
    echo   SKIP All !SKILL_SKIP! skills already present [up to date]
)

rem =================================================================
rem  Step 4: Dependencies
rem =================================================================
echo   [4/5] Dependencies...

if not exist "node_modules" (
    echo         First run: pnpm install...
    call pnpm install
    if !errorlevel! neq 0 (
        echo   FAIL pnpm install failed - check network or run manually
        pause
        exit /b 1
    )
    echo   DONE dependencies installed
) else if not exist "node_modules\.pnpm" (
    echo         Partial install detected, repairing...
    call pnpm install
    echo   DONE dependencies repaired
) else (
    echo   SKIP node_modules present [already installed]
)

rem =================================================================
rem  Step 5: Start
rem =================================================================
echo   [5/5] Starting...
echo.
echo   API  http://localhost:5120
echo   Web  http://localhost:5173
echo   Ctrl+C to stop
echo.

start "" http://localhost:5173
call pnpm dev:stable
pause
