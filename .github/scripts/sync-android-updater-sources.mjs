#!/usr/bin/env node
/**
 * 将仓库内持久化的 Android 更新相关源同步到 gen/android（幂等）
 * - UpdaterPlugin.kt
 * - REQUEST_INSTALL_PACKAGES（委托 patch-android-updater-manifest.mjs）
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const srcKt = path.join(root, 'src-tauri', 'android', 'UpdaterPlugin.kt')
const destKt = path.join(
  root,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'moon',
  'aistudio',
  'UpdaterPlugin.kt',
)

if (!fs.existsSync(srcKt)) {
  console.error(`未找到 ${srcKt}`)
  process.exit(1)
}

const destDir = path.dirname(destKt)
if (!fs.existsSync(destDir)) {
  console.error(`未找到 ${destDir}，请先执行 tauri android init`)
  process.exit(1)
}

fs.copyFileSync(srcKt, destKt)
console.log(`已同步 UpdaterPlugin.kt -> ${destKt}`)

const patch = spawnSync(
  process.execPath,
  [path.join(root, '.github', 'scripts', 'patch-android-updater-manifest.mjs')],
  { stdio: 'inherit' },
)
if (patch.status !== 0) {
  process.exit(patch.status || 1)
}
