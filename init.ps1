# ============================================================
# claude-workflow-kit 一键部署启动器 (Windows PowerShell)
#
# 用法：
#   .\init.ps1                    →  部署到当前目录（首次）
#   .\init.ps1 D:\MyProject       →  部署到指定项目
#   .\init.ps1 -Update            →  更新已有部署（跳过下载，只用缓存）
#   .\init.ps1 D:\MyProject -Update → 更新指定项目
#
# 原理：先检查本地是否有 kit 文件，没有就从 GitHub 下载（失败则回退到 Gitee）。
# ============================================================
param(
    [string]$Target = (Get-Location).Path,
    [switch]$Update
)
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Missing = [System.Collections.ArrayList]::new()
$KIT_GIT_REPO = "https://gitee.com/weifeng_code/claude-workflow-kit.git"
# GitHub 原始仓库（Gitee 不可用时的回退）
$KIT_GIT_REPO_FALLBACK = "https://github.com/BlackCat-L/claude-workflow-kit.git"

Write-Host "`n🚀 claude-workflow-kit 一键部署" -ForegroundColor Cyan
Write-Host "   目标: $Target" -ForegroundColor DarkGray
Write-Host ""

# ═══════════════════════════════════════════════════════════
# 阶段 -1: 确保 kit 文件可用（本地或下载）
# ═══════════════════════════════════════════════════════════
$KitRoot = $null

# 检测 kit 文件是否在脚本同目录（完整 kit，最优先）
if ((Test-Path "$ScriptDir\.mcp.json") -and (Test-Path "$ScriptDir\CLAUDE.md") -and (Test-Path "$ScriptDir\.claude\skills") -and ($ScriptDir -ne $Target)) {
    $KitRoot = $ScriptDir
    Write-Host "[OK] Using local kit: $KitRoot" -ForegroundColor DarkGray
}

# 检测本机 kit 仓库（向上查找或检查常见路径，无需网络）
if (-not $KitRoot) {
    $searchPaths = @(
        (Join-Path (Split-Path -Parent $ScriptDir) "claude-workflow-kit"),
        "$env:USERPROFILE\claude-workflow-kit",
        "F:\company\TOOL\claude-workflow-kit"
    )
    foreach ($p in $searchPaths) {
        if ((Test-Path "$p\.mcp.json") -and (Test-Path "$p\CLAUDE.md") -and (Test-Path "$p\.claude\skills")) {
            $KitRoot = $p
            Write-Host "[OK] Found local kit repo: $KitRoot" -ForegroundColor DarkGray
            break
        }
    }
}

# ── 缓存版本显示 ─────────────────────────────────────────
function Show-CacheVersion($CachePath) {
    $verFile = Join-Path $CachePath ".kit-version"
    if (Test-Path $verFile) {
        $ver = Get-Content $verFile -Encoding UTF8 | Select-String "version:" | ForEach-Object { $_.Line.Trim() }
        $date = Get-Content $verFile -Encoding UTF8 | Select-String "date:" | ForEach-Object { $_.Line.Trim() }
        Write-Host "      缓存版本: $ver | $date" -ForegroundColor DarkGray
    } else {
        Write-Host "      缓存版本: <1.0 (无版本标记，强烈建议更新)" -ForegroundColor Yellow
    }
}

# --update 模式：跳过 GitHub，直接用缓存
$CachedKit = "$env:USERPROFILE\.claude-workflow-kit"
if ($Update -and -not $KitRoot) {
    if ((Test-Path "$CachedKit\.mcp.json") -and (Test-Path "$CachedKit\CLAUDE.md")) {
        $KitRoot = $CachedKit
        Write-Host "[..] Update mode — using cached kit: $KitRoot" -ForegroundColor DarkGray
        Show-CacheVersion $CachedKit
        Write-Host "      ⚠️  缓存可能过期。建议先不用 -Update，直接运行以获取最新版。" -ForegroundColor Yellow
    } else {
        Write-Host "[FAIL] Update mode requires local cache (~/.claude-workflow-kit)." -ForegroundColor Red
        Write-Host "       Run without -Update first to create the cache." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── Git Clone 下载（走系统代理，Gitee/GitHub 均可用）────
function Sync-KitFromGit($GitUrl, $SourceName) {
    Write-Host "[..] git clone --depth=1 from $SourceName ..." -ForegroundColor Yellow
    $TempDir = "$env:TEMP\claude-workflow-kit-git"
    # 清理旧临时目录
    if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue }
    try {
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if (-not $gitCmd) {
            Write-Host "      [WARN] git not found, cannot clone" -ForegroundColor DarkGray
            return $false
        }
        & git clone --depth=1 --single-branch --branch=master "$GitUrl" "$TempDir" 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -eq 0 -and (Test-Path "$TempDir\.mcp.json")) {
            # 替换缓存
            if (Test-Path $CachedKit) { Remove-Item -Recurse -Force $CachedKit }
            Copy-Item -Recurse $TempDir $CachedKit
            $script:KitRoot = $CachedKit
            Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
            Write-Host "[OK] Latest kit cached from $SourceName -> $CachedKit" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "      [WARN] git clone failed: $_" -ForegroundColor DarkGray
    }
    # 清理
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    return $false
}

# 尝试从 Gitee clone，失败则回退到 GitHub
if (-not $KitRoot) {
    if (-not (Sync-KitFromGit $KIT_GIT_REPO "Gitee")) {
        Sync-KitFromGit $KIT_GIT_REPO_FALLBACK "GitHub" | Out-Null
    }

    # 下载全部失败 → 检查本地缓存兜底
    if (-not $KitRoot) {
        if ((Test-Path "$CachedKit\.mcp.json") -and (Test-Path "$CachedKit\CLAUDE.md")) {
            $KitRoot = $CachedKit
            Write-Host "⚠️  GitHub/Gitee 均不可达，使用本地缓存（可能不是最新版）" -ForegroundColor Yellow
            Show-CacheVersion $CachedKit
            Write-Host "      如需最新版：确保网络可达后，删除缓存重试：" -ForegroundColor Yellow
            Write-Host "      rm -r -fo $CachedKit" -ForegroundColor DarkGray
        }
    }
}

# 实在没有 → 报错退出
if (-not $KitRoot) {
    Write-Host "[FAIL] Cannot get kit files." -ForegroundColor Red
    Write-Host "       No network to Gitee or GitHub, and no local cache found." -ForegroundColor Red
    Write-Host "       Manual fix:" -ForegroundColor Yellow
    Write-Host "         git clone $KIT_GIT_REPO" -ForegroundColor Yellow
    Write-Host "         或 git clone $KIT_GIT_REPO_FALLBACK" -ForegroundColor Yellow
    Write-Host "       Then run this script from inside claude-workflow-kit/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# 阶段 0: 环境检测 + 自动安装
# ═══════════════════════════════════════════════════════════
Write-Host "━━━ 环境检测 ━━━" -ForegroundColor Cyan

# Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $ver = & node --version 2>$null
    Write-Host "  ✅ Node.js $ver" -ForegroundColor Green
} else {
    Write-Host "  📥 通过 winget 安装 Node.js LTS..." -ForegroundColor Yellow
    try {
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements 2>&1 | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  ✅ Node.js 安装完成（新终端窗口生效）" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  自动安装失败，请手动: https://nodejs.org/" -ForegroundColor Yellow
        [void]$Missing.Add("Node.js: https://nodejs.org/")
    }
}

# .NET SDK
$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnetCmd) {
    $ver = & dotnet --version 2>$null
    Write-Host "  ✅ .NET SDK $ver" -ForegroundColor Green
} else {
    Write-Host "  📥 通过 winget 安装 .NET SDK 8.0..." -ForegroundColor Yellow
    try {
        winget install --id Microsoft.DotNet.SDK.8 --silent --accept-package-agreements 2>&1 | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  ✅ .NET SDK 安装完成（新终端窗口生效）" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  自动安装失败，请手动: https://dotnet.microsoft.com/download" -ForegroundColor Yellow
        [void]$Missing.Add(".NET SDK: https://dotnet.microsoft.com/download")
    }
}

# uv
$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCmd) {
    Write-Host "  📥 安装 uv..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "https://astral.sh/uv/install.ps1" | Invoke-Expression
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  ✅ uv 安装完成" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  uv 安装失败: https://docs.astral.sh/uv/" -ForegroundColor Yellow
        [void]$Missing.Add("uv: https://docs.astral.sh/uv/")
    }
} else {
    Write-Host "  ✅ uv 已安装" -ForegroundColor Green
}

# npx
if (Get-Command npx -ErrorAction SilentlyContinue) {
    Write-Host "  ✅ npx 可用" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  npx 不可用（Node.js 安装后需重启终端）" -ForegroundColor Yellow
}

# Unity 项目检测
$isUnity = (Test-Path "$Target\Assets") -and (Test-Path "$Target\ProjectSettings\ProjectSettings.asset")
if ($isUnity) {
    Write-Host "  ✅ 检测到 Unity 项目" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  非 Unity 项目（gladekit-unity 将跳过）" -ForegroundColor DarkGray
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# 阶段 1: 部署配置文件（增量合并，永不覆盖已有）
# ═══════════════════════════════════════════════════════════
Write-Host "━━━ 部署配置 ━━━" -ForegroundColor Cyan

$SkippedConfigs = [System.Collections.ArrayList]::new()

# ── 安全复制：仅当目标不存在时才复制 ──────────────────────
function Safe-Copy($Src, $Dst, $Label, $Force=$false) {
    if ($Src -eq $Dst) { return }
    if ((Test-Path $Dst) -and -not $Force) {
        [void]$SkippedConfigs.Add($Label)
        Write-Host "  🔒 $Label 已存在，跳过（保护已有配置）" -ForegroundColor Yellow
        return
    }
    Copy-Item -Force $Src $Dst
    Write-Host "  ✅ $Label" -ForegroundColor Green
}

# ── 安全目录复制：只复制新文件，不覆盖已有 ────────────────
function Safe-CopyDir($SrcDir, $DstDir, $Label) {
    if (-not (Test-Path $SrcDir)) { return }
    New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
    $added = 0; $skipped = 0
    Get-ChildItem $SrcDir -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $relPath = $_.FullName.Substring($SrcDir.Length).TrimStart('\', '/')
        $dstFile = Join-Path $DstDir $relPath
        $dstFileDir = Split-Path $dstFile -Parent
        New-Item -ItemType Directory -Force -Path $dstFileDir | Out-Null
        if (Test-Path $dstFile) {
            $skipped++
        } else {
            Copy-Item $_.FullName $dstFile
            $added++
        }
    }
    # 也处理空子目录
    Get-ChildItem $SrcDir -Directory -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $relPath = $_.FullName.Substring($SrcDir.Length).TrimStart('\', '/')
        $dstSubDir = Join-Path $DstDir $relPath
        New-Item -ItemType Directory -Force -Path $dstSubDir | Out-Null
    }
    if ($skipped -gt 0 -and $added -gt 0) {
        Write-Host "  ✅ $Label (+$added 新文件，跳过 $skipped 已存在)" -ForegroundColor Green
    } elseif ($added -gt 0) {
        Write-Host "  ✅ $Label" -ForegroundColor Green
    } elseif ($skipped -gt 0) {
        Write-Host "  🔒 $Label 全部已存在，跳过" -ForegroundColor Yellow
    }
}

# ── 核心配置（跳过已存在，保护用户定制）─────────────────
# ── CLAUDE.md：段落级合并，只补缺失不覆盖 ─────────────
$srcMd = "$KitRoot\CLAUDE.md"
$dstMd = "$Target\CLAUDE.md"
if (-not (Test-Path $dstMd)) {
    Copy-Item $srcMd $dstMd
    Write-Host "  ✅ CLAUDE.md" -ForegroundColor Green
} else {
    # 提取已有的段落标题
    $dstSections = Select-String -Path $dstMd -Pattern '^## ' | ForEach-Object { $_.Line.Trim() }
    $srcSections = Select-String -Path $srcMd -Pattern '^## ' | ForEach-Object { $_.Line.Trim() }
    $missingSections = $srcSections | Where-Object { $_ -notin $dstSections }

    if ($missingSections.Count -gt 0) {
        # 对每个缺失的段落，从 kit 提取内容追加到 target
        $srcContent = Get-Content $srcMd -Raw -Encoding UTF8
        $added = 0
        foreach ($section in $missingSections) {
            $sectionTitle = $section -replace '^## ',''
            # 提取 kit 中该段落的完整内容（从 ## 标题到下一个 ## 或文件尾）
            $escaped = [regex]::Escape($section)
            if ($srcContent -match "${escaped}\s*\n(.*?)(?=\n## |\Z)") {
                $sectionBody = $matches[0].TrimEnd()
                # 追加到 target（前面加空行分隔）
                Add-Content -Path $dstMd -Value "`n`n$sectionBody" -Encoding UTF8
                $added++
            }
        }
        if ($added -gt 0) {
            Write-Host "  ✅ CLAUDE.md 已补足 $added 个新段落: $($missingSections -join ', ')" -ForegroundColor Green
        }
    } else {
        Write-Host "  🔒 CLAUDE.md 已完善，无需补足" -ForegroundColor Yellow
    }
}
Safe-Copy "$KitRoot\.mcp.json" "$Target\.mcp.json" ".mcp.json"

New-Item -ItemType Directory -Force -Path "$Target\.claude" | Out-Null
Safe-Copy "$KitRoot\.claude\settings.json" "$Target\.claude\settings.json" ".claude/settings.json"

# .claudeignore
if (Test-Path "$KitRoot\.claudeignore") {
    Safe-Copy "$KitRoot\.claudeignore" "$Target\.claudeignore" ".claudeignore"
}

# ── 模块化规则（只添加新文件，不覆盖）────────────────────
Safe-CopyDir "$KitRoot\.claude\rules" "$Target\.claude\rules" "rules/"

# ── 钩子脚本（只添加新文件，不覆盖）──────────────────────
Safe-CopyDir "$KitRoot\.claude\hooks" "$Target\.claude\hooks" "hooks/"

# ── Skills（只添加新 skill，不覆盖）────────────────────
$skillsSrc = if (Test-Path "$KitRoot\.claude\skills") { "$KitRoot\.claude\skills" } elseif (Test-Path "$CachedKit\.claude\skills") { "$CachedKit\.claude\skills" } else { $null }
if ($skillsSrc) {
    Get-ChildItem $skillsSrc -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $skillName = $_.Name
        $dstSkillDir = "$Target\.claude\skills\$skillName"
        if (Test-Path $dstSkillDir) {
            Write-Host "  🔒 Skill $skillName 已存在，跳过" -ForegroundColor Yellow
        } else {
            Copy-Item -Recurse $_.FullName $dstSkillDir
            Write-Host "  ✅ Skill: $skillName" -ForegroundColor Green
        }
    }
}

# ── 记忆系统（只添加新文件，永不覆盖）───────────────────
New-Item -ItemType Directory -Force -Path "$Target\memory" | Out-Null
$ccMemoryRoot = "$env:USERPROFILE\.claude\projects"
$ccSlug = ($Target -replace '[:\\/]', '-' -replace '\s+', '-').TrimStart('-').ToLower()
$ccMemoryPath = "$ccMemoryRoot\$ccSlug\memory"
New-Item -ItemType Directory -Force -Path $ccMemoryPath | Out-Null
$addedMem = @(); $skippedMem = @()
Get-ChildItem "$KitRoot\memory" -File -ErrorAction SilentlyContinue | ForEach-Object {
    $dstLocal = "$Target\memory\$($_.Name)"
    $dstCC = "$ccMemoryPath\$($_.Name)"
    $isNew = $false
    if (-not (Test-Path $dstLocal)) {
        Copy-Item $_.FullName $dstLocal
        $isNew = $true
    }
    if (-not (Test-Path $dstCC)) {
        Copy-Item $_.FullName $dstCC
        $isNew = $true
    }
    if ($isNew) { $addedMem += $_.Name } else { $skippedMem += $_.Name }
}
if ($addedMem.Count -gt 0) {
    Write-Host "  ✅ memory/ 新增模板: $($addedMem -join ', ')" -ForegroundColor Green
}
if ($skippedMem.Count -gt 0) {
    Write-Host "  🔒 memory/ 已有完善版本，已保护: $($skippedMem -join ', ')" -ForegroundColor DarkGray
}

# ── CLAUDE.local.md（仅模板，不覆盖）─────────────────────
if (-not (Test-Path "$Target\CLAUDE.local.md") -and (Test-Path "$KitRoot\CLAUDE.local.md")) {
    Copy-Item "$KitRoot\CLAUDE.local.md" "$Target\CLAUDE.local.md"
    Write-Host "  ✅ CLAUDE.local.md（个人配置模板）" -ForegroundColor Green
} else {
    Write-Host "  ✅ CLAUDE.local.md" -ForegroundColor Green
}

# ── .learnings/（--update 模式下保留用户已有内容）───────
New-Item -ItemType Directory -Force -Path "$Target\.learnings" | Out-Null
if ($Update) {
    Write-Host "  ✅ .learnings/ 目录（已保留）" -ForegroundColor Green
} else {
    @("ERRORS.md", "LEARNINGS.md", "FEATURE_REQUESTS.md") | ForEach-Object {
        $p = "$Target\.learnings\$_"
        if (-not (Test-Path $p)) { "# 记录文件" | Out-File -FilePath $p -Encoding UTF8 }
    }
    Write-Host "  ✅ .learnings/ 目录" -ForegroundColor Green
}

# ── .auto-agent/（只添加新文件，永不覆盖已有任务数据）─────
# 优先从缓存补足，防止 KitRoot=Target 时二次部署漏掉新增目录
$autoAgentSrc = if (Test-Path "$KitRoot\.auto-agent") { "$KitRoot\.auto-agent" } elseif (Test-Path "$CachedKit\.auto-agent") { "$CachedKit\.auto-agent" } else { $null }
if ($autoAgentSrc) {
    Safe-CopyDir $autoAgentSrc "$Target\.auto-agent" ".auto-agent/"
}

# ── .config/dotnet-tools.json ──────────────────────────
New-Item -ItemType Directory -Force -Path "$Target\.config" | Out-Null
if (Test-Path "$KitRoot\.config\dotnet-tools.json") {
    Safe-Copy "$KitRoot\.config\dotnet-tools.json" "$Target\.config\dotnet-tools.json" ".config/dotnet-tools.json"
}

# ── .gitignore（追加，不覆盖）────────────────────────────
$gi = "$Target\.gitignore"
$entries = @("*.html", "*.db")
if (Test-Path $gi) {
    $content = Get-Content $gi -Raw
    if ($content -notmatch "claude-workflow-kit") {
        "`n# claude-workflow-kit 运行时文件`n*.html`n*.db" | Out-File -FilePath $gi -Append -Encoding UTF8
    }
} else {
    $entries -join "`n" | Out-File -FilePath $gi -Encoding UTF8
}
Write-Host "  ✅ .gitignore" -ForegroundColor Green

# ── 跳过清单 ────────────────────────────────────────────
if ($SkippedConfigs.Count -gt 0) {
    Write-Host ""
    Write-Host "🔒 以下配置文件已存在，已保护未覆盖：" -ForegroundColor Yellow
    $SkippedConfigs | ForEach-Object { Write-Host "   - $_" }
    Write-Host "💡 如需更新 kit 配置：对比源文件手动合并" -ForegroundColor Cyan
    Write-Host "   源: $KitRoot" -ForegroundColor Cyan
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# 阶段 2: MCP 运行时
# ═══════════════════════════════════════════════════════════
Write-Host "━━━ MCP 运行时 ━━━" -ForegroundColor Cyan

if ($dotnetCmd) {
    Push-Location $Target
    $restoreResult = dotnet tool restore 2>&1
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ dotnet tool restore" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  dotnet tool restore 失败（dotnet-analyzer MCP 不可用）" -ForegroundColor Yellow
        if ($restoreResult) { $restoreResult | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray } }
    }
}

if (Get-Command npx -ErrorAction SilentlyContinue) {
    # 检测系统可用浏览器：Chrome > Edge
    $browser = "chrome"
    $hasChrome = (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") -or
                 (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") -or
                 (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    if (-not $hasChrome) {
        $hasEdge = (Test-Path ${env:ProgramFiles(x86)}"\Microsoft\Edge\Application\msedge.exe") -or
                   (Test-Path "C:\Program Files\Microsoft\Edge\Application\msedge.exe")
        if ($hasEdge) { $browser = "msedge" }
    }

    Write-Host "  📥 安装 Playwright 浏览器驱动 ($browser)..." -ForegroundColor Yellow
    npx playwright install $browser 2>&1
    Write-Host "  ✅ Playwright ($browser)" -ForegroundColor Green

    # 同步 .mcp.json 的 --browser 值
    $mcpContent = Get-Content "$Target\.mcp.json" -Raw -Encoding UTF8
    $mcpContent = $mcpContent -replace '("--browser"\s*,\s*)"[^"]*"', "`$1`"$browser`""
    [IO.File]::WriteAllText("$Target\.mcp.json", $mcpContent, (New-Object Text.UTF8Encoding $false))
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# 阶段 3: 汇总
# ═══════════════════════════════════════════════════════════
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ 部署完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📊 已部署："
Write-Host "   核心配置    CLAUDE.md · .mcp.json · settings.json（已存在则跳过）"
Write-Host "   模块规则    rules/ · hooks/ · skills/（仅添加新文件）"
Write-Host "   数据文件    memory/ · .learnings/（永不覆盖）"
Write-Host "   MCP 服务    playwright · claude-notifier"

if ($SkippedConfigs.Count -gt 0) {
    Write-Host ""
    Write-Host "🔒 以下配置文件已存在，已保护：" -ForegroundColor Yellow
    $SkippedConfigs | ForEach-Object { Write-Host "   - $_" }
}

# ── 合并指南：仅当核心配置文件被跳过时输出 ──────────────
$needMerge = ($SkippedConfigs -contains "CLAUDE.md") -or ($SkippedConfigs -contains ".claude/settings.json")
if ($needMerge) {
    Write-Host ""
    Write-Host "━━━━━━ 手动合并指南 ━━━━━━" -ForegroundColor Cyan
    Write-Host "以下配置块来自 kit，未自动合并。请根据需要复制到目标文件。" -ForegroundColor Cyan
    Write-Host ""

    # ── CLAUDE.md 合并建议 ─────────────────────────────────
    if ($SkippedConfigs -contains "CLAUDE.md") {
        Write-Host "── CLAUDE.md 建议添加以下区块 ──" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "▶ 编码门禁（触发自主进化等 Skill）：" -ForegroundColor Cyan
        Write-Host @'
```markdown
## 编码门禁

| 场景 | 动作 | 禁止 |
|------|------|------|
| 3+ 文件改动 | ⚠️ `Skill("auto-agent")` 任务分解 | 跳过 |
| 功能完成 | `Skill("simplify")` 自检 | 跳过自检 |
| 出错/纠正 | ⚠️ `Skill("self-improving-agent")` | 让经验丢失 |
```
'@
        Write-Host ""
        Write-Host "▶ 记忆系统（Learning & Adaptation）：" -ForegroundColor Cyan
        Write-Host @'
```markdown
## 记忆系统（Learns & Adapts）

| 记忆类型 | 文件 | 写入时机 |
|---------|------|---------|
| 反馈规则 | `memory/feedback-*.md` | Agent 犯错被纠正后立即写入 |
| MEMORY.md | 索引 | 每次新增/删除记忆文件时更新 |
```
'@
        Write-Host ""
        Write-Host "▶ 学习日志：" -ForegroundColor Cyan
        Write-Host @'
```markdown
- 学习日志: 经验记录到 `.learnings/`，3+ 次重复提炼到 CLAUDE.md
```
'@
        Write-Host ""
    }

    # ── settings.json 合并建议 ─────────────────────────────
    if ($SkippedConfigs -contains ".claude/settings.json") {
        Write-Host "── .claude/settings.json 建议添加以下 hooks ──" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "▶ SessionStart（注入上轮审计结果）：" -ForegroundColor Cyan
        Write-Host @'
```json
"SessionStart": [{
  "matcher": "",
  "hooks": [{ "type": "command", "command": "bash .claude/hooks/session-start.sh" }]
}]
```
'@
        Write-Host ""
        Write-Host "▶ PreToolUse（bash 安全护栏 + 敏感文件保护）：" -ForegroundColor Cyan
        Write-Host @'
```json
"PreToolUse": [
  { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash .claude/hooks/pre-bash-guard.sh" }] },
  { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash .claude/hooks/sensitive-file-guard.sh" }] }
]
```
'@
        Write-Host ""
        Write-Host "▶ UserPromptSubmit（核查提醒 + 自主学习激活）：" -ForegroundColor Cyan
        Write-Host @'
```json
"UserPromptSubmit": [
  { "matcher": "", "hooks": [{ "type": "command", "command": "echo '核查提醒：回答前必须读取相关文件验证当前状态，禁止凭经验或记忆回答。'" }] },
  { "matcher": "", "hooks": [{ "type": "command", "command": "bash .claude/skills/self-improving-agent/scripts/activator.sh" }] }
]
```
'@
        Write-Host ""
        Write-Host "▶ Stop（质量门）：" -ForegroundColor Cyan
        Write-Host @'
```json
"Stop": [{
  "matcher": "",
  "hooks": [{ "type": "command", "command": "bash .claude/hooks/quality-gate.sh" }]
}]
```
'@
        Write-Host ""
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

if ($Missing.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  缺失（对应 MCP 暂不可用）：" -ForegroundColor Yellow
    $Missing | ForEach-Object { Write-Host "   - $_" }
}

Write-Host ""
Write-Host "📋 下一步："
Write-Host "   1. 编辑 $Target\CLAUDE.md — 填入项目信息"
Write-Host "   2. cd $Target && claude — 输入 /mcp 确认在线"
Write-Host ""
Write-Host "💡 下次其他项目只需双击 init.bat（已缓存到 ~/.claude-workflow-kit/）"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# 防闪退
Write-Host ""
Read-Host "按 Enter 退出"

# 复制 init.bat + init.ps1 到目标项目（始终覆盖为最新版，初始化工具本身不是配置文件）
if ($KitRoot -ne $Target) {
    Copy-Item -Force "$KitRoot\init.bat" "$Target\init.bat" -ErrorAction SilentlyContinue
    Copy-Item -Force "$PSCommandPath" "$Target\init.ps1" -ErrorAction SilentlyContinue
}
