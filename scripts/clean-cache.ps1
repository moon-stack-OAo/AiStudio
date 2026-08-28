#Requires -Version 5.1
<#
.SYNOPSIS
  清理本仓库构建产物与本地缓存（默认不删 node_modules）

.DESCRIPTION
  删除前端产物、Vite 缓存、Rust target、Android Gradle/构建输出等。
  不删除源码与密钥文件。

.PARAMETER DryRun
  只打印将要删除的路径，不实际删除

.PARAMETER IncludeNodeModules
  额外删除 node_modules（删除后需重新 npm ci）

.EXAMPLE
  .\scripts\clean-cache.ps1
  .\scripts\clean-cache.ps1 -DryRun
  npm run clean
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$IncludeNodeModules
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "    $Message" -ForegroundColor Green
}

function Write-WarnLine([string]$Message) {
  Write-Host "    $Message" -ForegroundColor Yellow
}

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
  throw "未找到 package.json，请在仓库根目录相关路径运行本脚本。"
}
Set-Location -LiteralPath $Root

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Step "工作目录: $Root"
if ($DryRun) {
  Write-WarnLine "DryRun：仅列出，不删除"
}

$targets = New-Object System.Collections.Generic.List[string]

@(
  'dist',
  'dist-desktop',
  'dist-android',
  'dist-ssr',
  'node_modules\.vite',
  'node_modules\.cache',
  '.vite',
  '.turbo',
  'release-notes.md'
) | ForEach-Object { $targets.Add((Join-Path $Root $_)) }

$targets.Add((Join-Path $Root 'src-tauri\target'))
$targets.Add((Join-Path $Root 'src-tauri\gen\schemas'))

$androidDir = Join-Path $Root 'src-tauri\gen\android'
if (Test-Path -LiteralPath $androidDir) {
  Get-ChildItem -LiteralPath $androidDir -Recurse -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'build' -or $_.Name -eq '.gradle' -or $_.Name -eq '.cxx' } |
    ForEach-Object { $targets.Add($_.FullName) }

  $apkOut = Join-Path $androidDir 'app\build'
  if (Test-Path -LiteralPath $apkOut) {
    $targets.Add($apkOut)
  }
}

@(
  'android-latest.json',
  'latest.json'
) | ForEach-Object {
  $p = Join-Path $Root $_
  if (Test-Path -LiteralPath $p) { $targets.Add($p) }
}

if ($IncludeNodeModules) {
  $targets.Add((Join-Path $Root 'node_modules'))
}

$unique = @(
  $targets |
    Where-Object { $_ -and $_.Trim() } |
    Select-Object -Unique |
    Sort-Object { $_.Length } -Descending
)

$removed = 0
$skipped = 0
$failed = 0

Write-Step "清理缓存"
foreach ($path in $unique) {
  if (-not (Test-Path -LiteralPath $path)) {
    $skipped++
    continue
  }

  $rel = $path
  if ($rel.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    $rel = $rel.Substring($Root.Length).TrimStart('\', '/')
  }

  if ($DryRun) {
    Write-Host "    [dry-run] $rel" -ForegroundColor DarkGray
    $removed++
    continue
  }

  try {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    Write-Ok "已删除 $rel"
    $removed++
  } catch {
    Write-WarnLine "删除失败: $rel — $($_.Exception.Message)"
    $failed++
  }
}

$totalSw.Stop()

Write-Host ""
if ($DryRun) {
  Write-Host "DryRun 完成：将处理 $removed 项，跳过不存在 $skipped 项" -ForegroundColor Green
} else {
  Write-Host "清理完成：删除 $removed 项，跳过不存在 $skipped 项，失败 $failed 项" -ForegroundColor Green
}
Write-Elapsed '总耗时' $totalSw.Elapsed

if ($IncludeNodeModules -and -not $DryRun) {
  Write-Host ""
  Write-WarnLine "已删除 node_modules，请执行: npm ci"
}

if ($failed -gt 0) {
  exit 1
}