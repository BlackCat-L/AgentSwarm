<# C Drive Scanner - hardcoded paths for reliability #>

$UserName = 'Admin'
$Base = "C:\Users\$UserName"

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  C Drive Large Directory Scanner' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

# -- Helper: get dir size in MB --
function Get-DirSizeMB {
    param($Path)
    if (-not (Test-Path $Path)) { return 0 }
    try {
        $bytes = (Get-ChildItem -Path $Path -Recurse -Force -ErrorAction Stop | Measure-Object -Property Length -Sum).Sum
        return [math]::Round($bytes / 1048576, 1)
    } catch {
        return 0
    }
}

# ============ AppData\Roaming ============
Write-Host ''
Write-Host '--- AppData\Roaming ---' -ForegroundColor Cyan

$roaming = "$Base\AppData\Roaming"
if (Test-Path $roaming) {
    Get-ChildItem $roaming -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $sz = Get-DirSizeMB $_.FullName
        if ($sz -gt 50) {
            $gb = [math]::Round($sz / 1024, 2)
            $label = if ($gb -ge 1) { "$gb GB" } else { "$sz MB" }
            Write-Host "  [BIG] $($_.Name)  ->  $label" -ForegroundColor Yellow
        }
    }
}

# ============ AppData\Local ============
Write-Host ''
Write-Host '--- AppData\Local ---' -ForegroundColor Cyan

$local = "$Base\AppData\Local"
if (Test-Path $local) {
    Get-ChildItem $local -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $sz = Get-DirSizeMB $_.FullName
        if ($sz -gt 50) {
            $gb = [math]::Round($sz / 1024, 2)
            $label = if ($gb -ge 1) { "$gb GB" } else { "$sz MB" }
            Write-Host "  [BIG] $($_.Name)  ->  $label" -ForegroundColor Yellow
        }
    }
}

# ============ User Profile Hidden Dirs ============
Write-Host ''
Write-Host '--- User Profile Hidden Dirs (.xxx) ---' -ForegroundColor Cyan

Get-ChildItem $Base -Force -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\.' } | ForEach-Object {
    $sz = Get-DirSizeMB $_.FullName
    if ($sz -gt 50) {
        $gb = [math]::Round($sz / 1024, 2)
        $label = if ($gb -ge 1) { "$gb GB" } else { "$sz MB" }
        Write-Host "  [BIG] $($_.Name)  ->  $label" -ForegroundColor Yellow
    }
}

# ============ C: Drive Status ============
Write-Host ''
Write-Host '--- C: Drive Status ---' -ForegroundColor Cyan
$drive = Get-PSDrive C
$usedGB = [math]::Round($drive.Used / 1GB, 1)
$freeGB = [math]::Round($drive.Free / 1GB, 1)
$totalGB = [math]::Round(($drive.Used + $drive.Free) / 1GB, 1)
$pct = [math]::Round($drive.Used / ($drive.Used + $drive.Free) * 100, 1)
Write-Host "Used: ${usedGB}GB / ${totalGB}GB (${pct}%)  |  Free: ${freeGB}GB" -ForegroundColor White
Write-Host '========================================' -ForegroundColor Cyan
