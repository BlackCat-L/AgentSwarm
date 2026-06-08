# run-task.ps1
# 执行单个任务（推荐模式）
# 用法: .\run-task.ps1 -TaskId "TASK-001"
#
# 部署后请修改 $ProjectName 和 $InitCmd。

param(
    [Parameter(Mandatory=$true)]
    [string]$TaskId,

    [string]$ProjectPath = "..",

    [switch]$MarkInProgress,

    [string]$InitCmd = "./init.sh"
)

$ProjectName = (Split-Path (Resolve-Path $ProjectPath) -Leaf)
$TasksFile = Join-Path $ProjectPath ".auto-agent\tasks.json"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "$ProjectName — 任务执行器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: 环境初始化
Write-Host ""
Write-Host "━━━ Step 1: 初始化环境 ━━━" -ForegroundColor Cyan
Write-Host "运行: $InitCmd" -ForegroundColor Yellow
Write-Host "    确保依赖安装、服务启动。不要跳过此步。" -ForegroundColor DarkGray
Write-Host ""

# 读取任务
if (-not (Test-Path $TasksFile)) {
    Write-Error "任务文件不存在: $TasksFile"
    exit 1
}

$TasksJson = Get-Content $TasksFile -Encoding UTF8 | ConvertFrom-Json
$Task = $TasksJson.tasks | Where-Object { $_.id -eq $TaskId }

if (-not $Task) {
    # 尝试按 description 匹配
    $Task = $TasksJson.tasks | Where-Object { $_.description -eq $TaskId }
}
if (-not $Task) {
    Write-Error "未找到任务: $TaskId"
    Write-Host "可用任务:" -ForegroundColor Yellow
    $TasksJson.tasks | Where-Object { -not $_.passes } | ForEach-Object {
        $id = if ($_.id) { $_.id } else { ($_.description -replace '\s+', '-').Substring(0, [Math]::Min(40, $_.description.Length)) }
        Write-Host "  [$id] $($_.description)"
    }
    exit 1
}

# Step 2: 领取任务
Write-Host "━━━ Step 2: 领取任务 ━━━" -ForegroundColor Cyan
$displayId = if ($Task.id) { $Task.id } else { "TASK" }
Write-Host "任务: $displayId — $($Task.description)" -ForegroundColor Green
Write-Host "状态: passes=$($Task.passes)" -ForegroundColor Yellow
Write-Host ""

# 检查依赖
if ($Task.dependencies -and $Task.dependencies.Count -gt 0) {
    Write-Host "依赖检查:" -ForegroundColor Yellow
    foreach ($DepId in $Task.dependencies) {
        $Dep = $TasksJson.tasks | Where-Object { $_.id -eq $DepId }
        if (-not $Dep -or $Dep.passes -ne $true) {
            Write-Error "依赖任务未完成: $DepId"
            exit 1
        }
        Write-Host "  [OK] $DepId" -ForegroundColor Green
    }
    Write-Host ""
}

# 显示验收标准
if ($Task.acceptance_criteria) {
    Write-Host "验收标准:" -ForegroundColor Cyan
    foreach ($Criteria in $Task.acceptance_criteria) {
        Write-Host "  [ ] $Criteria" -ForegroundColor White
    }
    Write-Host ""
}

# 显示执行步骤
if ($Task.steps) {
    Write-Host "执行步骤:" -ForegroundColor Cyan
    $i = 1
    foreach ($Step in $Task.steps) {
        Write-Host "  $i. $Step" -ForegroundColor White
        $i++
    }
    Write-Host ""
}

# -MarkInProgress
if ($MarkInProgress) {
    $TasksJson.tasks | Where-Object {
        ($_.id -and $_.id -eq $TaskId) -or ($_.description -eq $Task.description)
    } | ForEach-Object {
        $_.status = "in_progress"
    }
    $TasksJson | ConvertTo-Json -Depth 10 | Set-Content $TasksFile -Encoding UTF8
    Write-Host "[OK] 任务状态已更新为 in_progress" -ForegroundColor Green
    Write-Host ""
}

# 6 步流程总览
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  6 步标准流程" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Step 1: 运行 $InitCmd 初始化环境" -ForegroundColor White
Write-Host "  Step 2: 领取任务（当前: $displayId）" -ForegroundColor White
Write-Host "  Step 3: 实现功能，遵循项目架构" -ForegroundColor White
Write-Host "  Step 4: 测试验证（lint + build + 浏览器实测）" -ForegroundColor White
Write-Host "  Step 5: 更新 progress.md + tasks.json" -ForegroundColor White
Write-Host "  Step 6: git add . && git commit && git push" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# 完成强制规则
Write-Host "========================================" -ForegroundColor Red
Write-Host "  任务完成后必须执行（强制）" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host "  1. 编译/语法验证通过（无 error）" -ForegroundColor Yellow
Write-Host "  2. lint + build 成功" -ForegroundColor Yellow
Write-Host "  3. 浏览器/真实环境验证（UI 改动必须）" -ForegroundColor Yellow
Write-Host "  4. 更新 progress.md 记录工作内容" -ForegroundColor Yellow
Write-Host "  5. 更新 tasks.json：passes = true" -ForegroundColor Yellow
Write-Host "  6. git add . && git commit -m `"[任务描述] - completed`"" -ForegroundColor Yellow
Write-Host "  7. git push" -ForegroundColor Yellow
Write-Host ""
Write-Host "  一个任务 = 一个 commit（代码 + progress + tasks 一起提交）" -ForegroundColor Red
Write-Host "  用户调用 auto-agent = 已授权 push，无需再次确认" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Red
