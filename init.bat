@echo off
title Workflow Kit - Deploy
setlocal

set "F=%~dp0init.ps1"
set "CACHE=%USERPROFILE%\.claude-workflow-kit"

:: Download URLs (GitHub primary, Gitee fallback for mainland China)
set "URL_GH=https://github.com/BlackCat-L/claude-workflow-kit/raw/master/init.ps1"
set "URL_GEE=https://gitee.com/weifeng_code/claude-workflow-kit/raw/master/init.ps1"

echo.
echo ========================================
echo   Workflow Kit - Deploy
echo ========================================
echo.

:: Step 1: ensure init.ps1 is available
:: Priority: cache > local > GitHub download > Gitee download

:: Cache exists — always prefer it (updated by each successful download)
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

:: No local, no cache — try download
:: ── Try GitHub ──
echo [..] Trying GitHub ...
powershell -Command "$u='%URL_GH%'; $f='%F%'; $ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ok=$false; try { & curl.exe -L -o $f $u -A $ua --connect-timeout 15 --max-time 30 2>$null; if ($LASTEXITCODE -eq 0 -and (Test-Path $f) -and (Get-Item $f).Length -gt 0) { $ok=$true } } catch {}; if (-not $ok) { try { Invoke-WebRequest $u -OutFile $f -UseBasicParsing -TimeoutSec 30 -Headers @{'User-Agent'=$ua}; if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) { $ok=$true } } catch {} }; if ($ok) { exit 0 } else { exit 1 }"
if exist "%F%" (
    echo [OK] Downloaded from GitHub
    goto :run
)

:: ── GitHub failed, try Gitee ──
echo [..] GitHub unreachable, trying Gitee ...
powershell -Command "$u='%URL_GEE%'; $f='%F%'; $ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64)'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ok=$false; try { & curl.exe -L -o $f $u -A $ua --connect-timeout 15 --max-time 30 2>$null; if ($LASTEXITCODE -eq 0 -and (Test-Path $f) -and (Get-Item $f).Length -gt 0) { $ok=$true } } catch {}; if (-not $ok) { try { Invoke-WebRequest $u -OutFile $f -UseBasicParsing -TimeoutSec 30 -Headers @{'User-Agent'=$ua}; if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) { $ok=$true } } catch {} }; if ($ok) { exit 0 } else { exit 1 }"
if exist "%F%" (
    echo [OK] Downloaded from Gitee
    goto :run
)

:: All failed
echo.
echo ========================================
echo   DEPLOY FAILED - No network, no cache
echo ========================================
echo.
echo Cannot reach GitHub or Gitee, and no local cache found.
echo.
echo To fix:
echo   1. Check your internet connection
echo   2. Or manually download and save init.ps1 from:
echo      GitHub: %URL_GH%
echo      Gitee:  %URL_GEE%
echo   3. Place it next to init.bat, then double-click again
echo.
pause
exit /b 1

:run
echo.
powershell -ExecutionPolicy Bypass -File "%F%" %*
