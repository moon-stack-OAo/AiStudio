#Requires -Version 5.1
<#
.SYNOPSIS
  本地构建 Windows 安装包（NSIS + MSI）

.DESCRIPTION
  检查 Node/Rust 环境，可选加载 Tauri updater 签名密钥，
  执行 tauri build --bundles nsis,msi，再跑产物检查并打印路径。

.PARAMETER SkipSign
  不加载签名密钥（仅本地安装包，无 .sig / 不用于 updater）

.PARAMETER SkipCheck
  构建后不执行 tauri:build:check

.PARAMETER KeyPath
  签名私钥路径，默认 %USERPROFILE%\.tauri\ai-studio.key

.PARAMETER KeyPasswordPath
  私钥密码文件路径，默认 %USERPROFILE%\.tauri\ai-studio.key.password

.PARAMETER OpenDir
  构建成功后打开 bundle 目录

.EXAMPLE
  .\scripts\build-windows.ps1
  .\scripts\build-windows.ps1 -SkipSign -OpenDir
#>
[CmdletBinding()]
param(
  [switch]$SkipSign,
  [switch]$SkipCheck,
  [switch]$OpenDir,
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.tauri\ai-studio.key'),
  [string]$KeyPasswordPath = (Join-Path $env:USERPROFILE '.tauri\ai-studio.key.password')
)

$ErrorActionPreference = 'Stop'

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

function Assert-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $cmd) {
    throw "未找到命令: $Name"
  }
  return $cmd
}

function Resolve-Npm {
  $cmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $cmd) { return $cmd.Source }
  $cmd = Get-Command 'npm' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $cmd) { return $cmd.Source }
  throw '未找到命令: npm'
}

function Invoke-Npm {
  param([Parameter(Mandatory = $true)][string[]]$NpmArgs)
  & $script:NpmExe @NpmArgs
  if (-not $?) {
    throw ("npm {0} 失败" -f ($NpmArgs -join ' '))
  }
}

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
  throw '未找到 package.json，请在仓库根目录相关路径运行本脚本。'
}
Set-Location -LiteralPath $Root

Write-Step "工作目录: $Root"
Write-Step '检查构建环境'

Assert-Command 'node' | Out-Null
Assert-Command 'rustc' | Out-Null
Assert-Command 'cargo' | Out-Null
$script:NpmExe = Resolve-Npm

$nodeVer = (& node -v 2>&1 | Out-String).Trim()
$npmVer = (& $script:NpmExe -v 2>&1 | Out-String).Trim()
$rustVer = (& rustc --version 2>&1 | Out-String).Trim()
Write-Ok "Node $nodeVer / npm $npmVer"
Write-Ok "$rustVer"

$hasMsvc = $null -ne (Get-Command 'link.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $hasMsvc) {
  Write-WarnLine '未检测到 link.exe。若构建失败，请安装 Visual Studio Build Tools（使用 C++ 的桌面开发）。'
} else {
  Write-Ok '检测到 MSVC 链接器 (link.exe)'
}

if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
  Write-Step '安装 npm 依赖 (npm ci)'
  Invoke-Npm @('ci')
}

$signingEnabled = $false
if (-not $SkipSign) {
  Write-Step '加载 Updater 签名密钥'
  if ((Test-Path -LiteralPath $KeyPath) -and (Test-Path -LiteralPath $KeyPasswordPath)) {
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $KeyPath -Raw
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -LiteralPath $KeyPasswordPath -Raw
    if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
      throw "签名私钥文件为空: $KeyPath"
    }
    $signingEnabled = $true
    Write-Ok "已加载密钥: $KeyPath"
  } elseif ($env:TAURI_SIGNING_PRIVATE_KEY) {
    $signingEnabled = $true
    Write-Ok '使用环境变量中的 TAURI_SIGNING_PRIVATE_KEY'
  } else {
    Write-WarnLine "未找到密钥（$KeyPath），将构建无 .sig 的安装包。"
    Write-WarnLine '需要签名时可放置密钥，或传 -SkipSign 显式跳过。'
  }
} else {
  Write-Step '已指定 -SkipSign，跳过签名密钥'
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

Write-Step '构建 Windows 安装包 (NSIS + MSI)'
Invoke-Npm @('run', 'tauri:build:win')

$bundleRoot = Join-Path $Root 'src-tauri\target\release\bundle'
if (-not $SkipCheck) {
  Write-Step '检查打包产物'
  Invoke-Npm @('run', 'tauri:build:check')
}

Write-Step '产物列表'
$artifacts = @()
foreach ($dirName in @('nsis', 'msi')) {
  $dir = Join-Path $bundleRoot $dirName
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  $files = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\.(exe|msi|sig)$' } |
    Sort-Object LastWriteTime -Descending)
  foreach ($f in $files) {
    $artifacts += $f
    Write-Host ("    {0,-6} {1,8:N2} MB  {2}" -f $f.Extension.TrimStart('.').ToUpper(), ($f.Length / 1MB), $f.FullName)
  }
}

if ($artifacts.Count -eq 0) {
  throw "构建似乎成功，但未在 $bundleRoot 找到 .exe / .msi。"
}

Write-Host ''
Write-Host '构建成功' -ForegroundColor Green
Write-Host "目录: $bundleRoot"
if ($signingEnabled) {
  Write-Ok '已启用 Updater 签名（应生成 .sig）'
} else {
  Write-WarnLine '未启用签名：仅适合本地安装测试，勿用于发版 updater。'
}

if ($OpenDir) {
  if (Test-Path -LiteralPath $bundleRoot) {
    Start-Process explorer.exe -ArgumentList $bundleRoot
  }
}
