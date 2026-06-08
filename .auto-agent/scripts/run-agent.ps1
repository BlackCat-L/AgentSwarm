# run-agent.ps1
# 持续执行多个任务（自动化模式，需人工监控）
# 用法: .\run-agent.ps1 -MaxIterations 5
#
# 部署后请修改 $ProjectName。

param(
    [int]$MaxIterations = 5,
    [string]$ProjectPath = ".."
)

$ProjectName = (Split-Path (Resolve-Path $ProjectPath) -Leaf)
$TasksFile = Join-Path $ProjectPath ".auto-agent\tasks.json"
$LogDir = Join-Path $ProjectPath ".auto-agent\automation-logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "automation-$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

function Write-Log {
    param([string]$Level, [string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "$timestamp [$Level] $Message" | Add-Content $LogFile
    switch ($Level) {
        "INFO"    { Write-Host "[INFO] $Message" -ForegroundColor Blue }
        "SUCCESS" { Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
        "WARNING" { Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
        "ERROR"   { Write-Host "[ERROR] $Message" -ForegroundColor Red }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "$ProjectName — 自动化任务执行器" -ForegroundColor Cyan
Write-Host "警告: 此模式会连续执行多个任务，请保持监控!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
Write-Log "INFO" "日志文件: $LogFile"

for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Log "INFO" "--- 迭代 $i / $MaxIterations ---"

    if (-not (Test-Path $TasksFile)) {
        Write-Log "ERROR" "任务文件不存在: $TasksFile"
        exit 1
    }

    $TasksJson = Get-Content $TasksFile -Encoding UTF8 | ConvertFrom-Json

    $NextTask = $null
    foreach ($Task in $TasksJson.tasks) {
        if ($Task.status -ne "planned") { continue }
        $allDepsPass = $true
        if ($Task.dependencies) {
            foreach ($DepId in $Task.dependencies) {
                $Dep = $TasksJson.tasks | Where-Object { $_.id -eq $DepId }
                if (-not $Dep -or $Dep.passes -ne $true) {
                    $allDepsPass = $false
                    break
                }
            }
        }
        if ($allDepsPass) { $NextTask = $Task; break }
    }

    if (-not $NextTask) {
        Write-Log "SUCCESS" "没有可执行的 planned 任务，全部完成。"
        break
    }

    Write-Log "INFO" "下一个任务: $($NextTask.id) - $($NextTask.title)"
    Write-Host "任务描述: $($NextTask.description)" -ForegroundColor Gray

    $Response = Read-Host "按 Enter 继续，输入 'skip' 跳过，输入 'exit' 退出"
    if ($Response -eq "exit") { Write-Log "WARNING" "用户退出。"; break }
    if ($Response -eq "skip") { Write-Log "WARNING" "跳过任务 $($NextTask.id)。"; continue }

    Write-Log "INFO" "开始执行任务 $($NextTask.id)..."
    # 在此处调用 run-task.ps1 或其他执行逻辑
    # & "$PSScriptRoot\run-task.ps1" -TaskId $NextTask.id -ProjectPath $ProjectPath
}

Write-Log "INFO" "自动化执行结束。日志: $LogFile"
Write-Host "========================================" -ForegroundColor Cyan
