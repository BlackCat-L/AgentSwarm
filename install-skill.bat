@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

if "%~1"=="" (
    echo 用法: install-skill.bat C:\path\to\your-project
    exit /b 1
)

set TARGET=%~1

if not exist "%TARGET%" (
    echo 目录不存在: %TARGET%
    exit /b 1
)

mkdir "%TARGET%\.claude\skills\swarm" 2>nul
copy /Y "%~dp0.claude\skills\swarm\SKILL.md" "%TARGET%\.claude\skills\swarm\SKILL.md"

echo ✅ swarm skill 已安装到 %TARGET%
echo 在 VS Code Claude Code 中就可以用 /swarm 了
