#Requires -Version 5.1
<#
.SYNOPSIS
  本地构建 Android debug APK（aarch64）

.DESCRIPTION
  检查本机 Android/Rust 环境，必要时初始化 gen/android，覆盖启动图标，
  然后执行 tauri android build --apk --debug，并打印 APK 路径。

.PARAMETER SkipInit
  跳过 android init（即使 gen/android 不存在也不初始化）

.PARAMETER SkipIcon
  跳过用 src-tauri/icons/android 覆盖启动图标

.PARAMETER OpenDir
  构建成功后打开 APK 所在目录

.EXAMPLE
  .\scripts\build-android-debug.ps1
  .\scripts\build-android-debug.ps1 -OpenDir
#>
[CmdletBinding()]
param(
  [switch]$SkipInit,
  [switch]$SkipIcon,
  [switch]$OpenDir
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
  throw "未找到命令: npm"
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
  throw "未找到 package.json，请在仓库根目录相关路径运行本脚本。"
}
Set-Location -LiteralPath $Root

Write-Step "工作目录: $Root"

Write-Step "检查构建环境"

Assert-Command 'node' | Out-Null
Assert-Command 'rustc' | Out-Null
Assert-Command 'rustup' | Out-Null
$script:NpmExe = Resolve-Npm

$nodeVer = (& node -v 2>&1 | Out-String).Trim()
$npmVer = (& $script:NpmExe -v 2>&1 | Out-String).Trim()
Write-Ok "Node $nodeVer / npm $npmVer"

# AGP 8.x 需要 JDK 17+；本机 JAVA_HOME 常指向 JDK 8，构建时强制纠正
$jdk17Candidates = @(
  'C:\Program Files\Java\jdk-17',
  'D:\Program Files\Android\Android Studio\jbr',
  'C:\Program Files\Android\Android Studio\jbr',
  (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
)
$jdk17 = $jdk17Candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe') } | Select-Object -First 1
if ($null -eq $jdk17) {
  throw "未找到 JDK 17。请安装 JDK 17，或安装 Android Studio（自带 JBR）。"
}
$env:JAVA_HOME = $jdk17
$env:Path = (Join-Path $jdk17 'bin') + ';' + $env:Path
Write-Ok "JAVA_HOME=$($env:JAVA_HOME)"

if (-not $env:ANDROID_HOME -and $env:ANDROID_SDK_ROOT) {
  $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
}
if (-not $env:ANDROID_HOME) {
  $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path -LiteralPath $defaultSdk) {
    $env:ANDROID_HOME = $defaultSdk
    Write-WarnLine "未设置 ANDROID_HOME，已使用默认路径: $defaultSdk"
  }
}
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) {
  throw "未找到 Android SDK。请安装并设置 ANDROID_HOME（或 ANDROID_SDK_ROOT）。"
}
Write-Ok "ANDROID_HOME=$($env:ANDROID_HOME)"

if (-not $env:NDK_HOME -and $env:ANDROID_NDK_HOME) {
  $env:NDK_HOME = $env:ANDROID_NDK_HOME
}
if (-not $env:NDK_HOME) {
  $ndkRoot = Join-Path $env:ANDROID_HOME 'ndk'
  if (Test-Path -LiteralPath $ndkRoot) {
    $latestNdk = Get-ChildItem -LiteralPath $ndkRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name |
      Select-Object -Last 1
    if ($null -ne $latestNdk) {
      $env:NDK_HOME = $latestNdk.FullName
      Write-WarnLine "未设置 NDK_HOME，已选用: $($env:NDK_HOME)"
    }
  }
}
if (-not $env:NDK_HOME -or -not (Test-Path -LiteralPath $env:NDK_HOME)) {
  throw "未找到 Android NDK。请安装 NDK 并设置 NDK_HOME / ANDROID_NDK_HOME。"
}
$env:ANDROID_NDK_HOME = $env:NDK_HOME
Write-Ok "NDK_HOME=$($env:NDK_HOME)"

$targets = @(& rustup target list --installed 2>&1 | ForEach-Object { "$_".Trim() })
if ($targets -notcontains 'aarch64-linux-android') {
  Write-Step "安装 Rust target: aarch64-linux-android"
  & rustup target add aarch64-linux-android
  if (-not $?) { throw "rustup target add 失败" }
}
Write-Ok "Rust target aarch64-linux-android 已就绪"

if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
  Write-Step "安装 npm 依赖 (npm ci)"
  Invoke-Npm @('ci')
}

$androidDir = Join-Path $Root 'src-tauri\gen\android'
if (-not (Test-Path -LiteralPath $androidDir)) {
  if ($SkipInit) {
    throw "缺少 src-tauri/gen/android，且指定了 -SkipInit。"
  }
  Write-Step "初始化 Android 工程 (tauri android init --ci)"
  Invoke-Npm @('run', 'tauri:android:init')
  if (-not (Test-Path -LiteralPath $androidDir)) {
    throw "init 后仍缺少 src-tauri/gen/android"
  }
  Write-Ok "已生成 $androidDir"
} else {
  Write-Ok "已存在 gen/android，跳过 init"
}

if (-not $SkipIcon) {
  $iconSrc = Join-Path $Root 'src-tauri\icons\android'
  $iconDest = Join-Path $androidDir 'app\src\main\res'
  if (Test-Path -LiteralPath $iconSrc) {
    Write-Step "覆盖 Android 启动图标"
    $densities = @(
      'mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi',
      'mipmap-xxhdpi', 'mipmap-xxxhdpi', 'mipmap-anydpi-v26'
    )
    foreach ($density in $densities) {
      $srcDir = Join-Path $iconSrc $density
      $destDir = Join-Path $iconDest $density
      if (Test-Path -LiteralPath $srcDir) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -Path (Join-Path $srcDir '*') -Destination $destDir -Force
        Write-Ok "copied $density"
      }
    }
    $bgSrc = Join-Path $iconSrc 'values\ic_launcher_background.xml'
    if (Test-Path -LiteralPath $bgSrc) {
      $bgDestDir = Join-Path $iconDest 'values'
      New-Item -ItemType Directory -Force -Path $bgDestDir | Out-Null
      Copy-Item -LiteralPath $bgSrc -Destination (Join-Path $bgDestDir 'ic_launcher_background.xml') -Force
      Write-Ok "copied values/ic_launcher_background.xml"
    }
  } else {
    Write-WarnLine "未找到 $iconSrc，跳过图标覆盖"
  }
}

Write-Step "构建 debug APK (aarch64)"
Invoke-Npm @('run', 'tauri:build:android:debug')

Write-Step "查找 APK"
$apks = @(Get-ChildItem -LiteralPath $androidDir -Recurse -Filter '*.apk' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending)

$debugApks = @($apks | Where-Object { $_.FullName -match '[\\/]debug[\\/]|\-debug' })
if ($debugApks.Count -gt 0) {
  $chosen = $debugApks[0]
} elseif ($apks.Count -gt 0) {
  $chosen = $apks[0]
} else {
  $chosen = $null
}

if ($null -eq $chosen) {
  throw "构建似乎成功，但未找到 .apk。请检查 src-tauri/gen/android 下 outputs。"
}

Write-Host ""
Write-Host "构建成功" -ForegroundColor Green
Write-Host "APK: $($chosen.FullName)"
Write-Host ("大小: {0:N2} MB" -f ($chosen.Length / 1MB))
Write-Host "时间: $($chosen.LastWriteTime)"

if ($OpenDir) {
  Start-Process explorer.exe -ArgumentList "/select,`"$($chosen.FullName)`""
}

Write-Host ""
Write-Host "安装示例:" -ForegroundColor DarkGray
Write-Host "  adb install -r `"$($chosen.FullName)`"" -ForegroundColor DarkGray