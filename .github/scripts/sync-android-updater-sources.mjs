#!/usr/bin/env node
/**
 * 将仓库内持久化的 Android 自定义源同步到 gen/android（幂等）
 * - UpdaterPlugin.kt
 * - MediaSaverPlugin.kt（MediaStore 保存图片/视频到相册）
 * - MainActivity.kt（SafeArea / SystemBars Bridge、edge-to-edge）
 * - file_paths.xml（FileProvider：仅 cache-path，供侧载 APK）
 * - REQUEST_INSTALL_PACKAGES（委托 patch-android-updater-manifest.mjs）
 *
 * 用法: node .github/scripts/sync-android-updater-sources.mjs
 * 须在 tauri android init 之后执行。
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const root = process.cwd()
const androidSrc = path.join(root, 'src-tauri', 'android')
const javaDestDir = path.join(
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
)
const xmlDestDir = path.join(
  root,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'res',
  'xml',
)

/** @type {{ src: string, dest: string, label: string }[]} */
const copies = [
  {
    src: path.join(androidSrc, 'UpdaterPlugin.kt'),
    dest: path.join(javaDestDir, 'UpdaterPlugin.kt'),
    label: 'UpdaterPlugin.kt',
  },
  {
    src: path.join(androidSrc, 'MediaSaverPlugin.kt'),
    dest: path.join(javaDestDir, 'MediaSaverPlugin.kt'),
    label: 'MediaSaverPlugin.kt',
  },
  {
    src: path.join(androidSrc, 'MainActivity.kt'),
    dest: path.join(javaDestDir, 'MainActivity.kt'),
    label: 'MainActivity.kt',
  },
  {
    src: path.join(androidSrc, 'file_paths.xml'),
    dest: path.join(xmlDestDir, 'file_paths.xml'),
    label: 'file_paths.xml',
  },
]

if (!fs.existsSync(javaDestDir)) {
  console.error(`未找到 ${javaDestDir}，请先执行 tauri android init`)
  process.exit(1)
}

for (const { src, dest, label } of copies) {
  if (!fs.existsSync(src)) {
    console.error(`未找到 ${src}`)
    process.exit(1)
  }
  const destDir = path.dirname(dest)
  if (!fs.existsSync(destDir)) {
    console.error(`未找到 ${destDir}，请先执行 tauri android init`)
    process.exit(1)
  }
  fs.copyFileSync(src, dest)
  console.log(`已同步 ${label} -> ${dest}`)
}

const patch = spawnSync(
  process.execPath,
  [path.join(root, '.github', 'scripts', 'patch-android-updater-manifest.mjs')],
  { stdio: 'inherit' },
)
if (patch.status !== 0) {
  process.exit(patch.status || 1)
}
