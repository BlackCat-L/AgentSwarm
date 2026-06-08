@echo off
title Workflow Kit - Deploy
setlocal

set "F=%~dp0init.ps1"
set "U=https://github.com/BlackCat-L/claude-workflow-kit/raw/master/init.ps1"
set "CACHE=%USERPROFILE%\.claude-workflow-kit"

echo.
echo ========================================
echo   Workflow Kit - Deploy
echo ========================================
echo.

:: Step 1: ensure init.ps1 is available
:: Priority: cache > local > GitHub download

:: Cache exists — always prefer it (updated by each successful GitHub download)
if exist "%CACHE%\init.ps1" (
    echo [OK] Using cached init.ps1 ^(from %CACHE%^)
    copy "%CACHE%\init.ps1" "%F%" >nul 2>&1
    goto :run
)

:: No cache — use local if exists
if exist "%F%" (
    echo [OK] init.ps1 found locally
    goto :run
)

:: No local, no cache — try GitHub
echo [..] Fetching latest init.ps1 from GitHub ...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $j = Start-Job { Invoke-WebRequest '%U%' -OutFile '%F%' -UseBasicParsing }; $j | Wait-Job -Timeout 30 | Out-Null; if ($j.State -ne 'Completed') { Stop-Job $j; Remove-Job $j; exit 1 }; Remove-Job $j"
if exist "%F%" (
    echo [OK] Latest init.ps1 downloaded
    goto :run
)

:: All failed
echo.
echo ========================================
echo   DEPLOY FAILED - No network, no cache
echo ========================================
echo.
echo Cannot reach GitHub and no local cache found.
echo.
echo To fix:
echo   1. Check your internet connection
echo   2. Or manually download and save init.ps1:
echo      %U%
echo   3. Then double-click init.bat again
echo.
pause
exit /b 1

:run
echo.
powershell -ExecutionPolicy Bypass -File "%F%" %*
