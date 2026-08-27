#!/usr/bin/env node
/**
 * 为 gen/android 注入应用内更新所需权限（幂等）
 * - REQUEST_INSTALL_PACKAGES
 * 用法: node .github/scripts/patch-android-updater-manifest.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const manifestPath = path.join(
  process.cwd(),
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
)

if (!fs.existsSync(manifestPath)) {
  console.error(`未找到 ${manifestPath}，请先执行 tauri android init`)
  process.exit(1)
}

let text = fs.readFileSync(manifestPath, 'utf8')
const perm =
  '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'

if (!text.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  if (text.includes('android.permission.INTERNET')) {
    text = text.replace(
      /(<uses-permission\s+android:name="android\.permission\.INTERNET"\s*\/>)/,
      `$1\n${perm}`,
    )
  } else if (text.includes('<manifest')) {
    text = text.replace(/(<manifest[^>]*>)/, `$1\n${perm}`)
  } else {
    console.error('AndroidManifest.xml 结构异常，无法注入 REQUEST_INSTALL_PACKAGES')
    process.exit(1)
  }
}

fs.writeFileSync(manifestPath, text, 'utf8')
console.log(`已更新 Android 安装权限: ${manifestPath}`)
