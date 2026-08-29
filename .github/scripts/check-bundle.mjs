#!/usr/bin/env node
/**
 * 检查本地 Tauri Windows 打包产物是否齐全
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const bundleRoot = path.join(root, 'src-tauri', 'target', 'release', 'bundle')

const requiredGlobs = [
  {dir: 'nsis', pattern: /\.exe$/i, label: 'NSIS 安装包 (.exe)'},
  {dir: 'msi', pattern: /\.msi$/i, label: 'MSI 安装包 (.msi)'},
]

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).map((name) => path.join(dir, name))
}

if (!fs.existsSync(bundleRoot)) {
  console.error(`未找到打包目录: ${bundleRoot}`)
  console.error('请先执行: npm run tauri:build:win')
  process.exit(1)
}

let failed = false
const found = []

for (const item of requiredGlobs) {
  const dir = path.join(bundleRoot, item.dir)
  const files = listFiles(dir).filter((f) => item.pattern.test(f) && fs.statSync(f).isFile())
  if (!files.length) {
    console.error(`缺少 ${item.label}（目录: ${dir}）`)
    failed = true
  } else {
    for (const f of files) {
      const sizeMb = (fs.statSync(f).size / 1024 / 1024).toFixed(2)
      found.push(`- ${item.label}: ${path.relative(root, f)} (${sizeMb} MB)`)
    }
  }
}

// Updater 签名产物（createUpdaterArtifacts=true 时）
const sigCandidates = []
for (const dirName of ['nsis', 'msi']) {
  const dir = path.join(bundleRoot, dirName)
  for (const f of listFiles(dir)) {
    if (/\.sig$/i.test(f)) sigCandidates.push(f)
  }
}
if (!sigCandidates.length) {
  console.warn('警告: 未找到 .sig 签名文件（若未配置 TAURI_SIGNING_PRIVATE_KEY，属预期）')
} else {
  for (const f of sigCandidates) {
    found.push(`- 签名文件: ${path.relative(root, f)}`)
  }
}

console.log('打包产物检查结果:')
for (const line of found) console.log(line)

if (failed) {
  process.exit(1)
}

console.log('通过: NSIS / MSI 安装包已生成')
