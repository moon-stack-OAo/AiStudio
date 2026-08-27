#!/usr/bin/env node
/**
 * 生成 android-latest.json（供 Android 侧载应用内更新）
 * 用法: node .github/scripts/generate-android-latest.mjs v0.1.2 [apkPath]
 * 环境变量可选: GITHUB_REPOSITORY（默认 moon-stack-OAo/AI_Studio）
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const tag = String(process.argv[2] || process.env.GITHUB_REF_NAME || '').trim()
const version = tag.replace(/^v/i, '')
if (!version) {
  console.error('缺少版本号，请传入 tag（如 v0.1.2）')
  process.exit(1)
}

const repo =
  String(process.env.GITHUB_REPOSITORY || 'moon-stack-OAo/AI_Studio').trim() ||
  'moon-stack-OAo/AI_Studio'
const assetName = `AI.Studio_${version}.apk`
const apkArg = process.argv[3]

function findApk() {
  if (apkArg && fs.existsSync(apkArg)) return apkArg
  const root = path.join(process.cwd(), 'src-tauri', 'gen', 'android')
  if (!fs.existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'build' || ent.name === '.gradle') continue
        stack.push(full)
      } else if (ent.isFile() && ent.name.endsWith('.apk')) {
        return full
      }
    }
  }
  return null
}

function extractNotes() {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) return ''
  const lines = fs.readFileSync(changelogPath, 'utf8').split(/\r?\n/)
  const headerRe = new RegExp(
    `^## \\[v?${version.replace(/\./g, '\\.')}\\](?:\\s|$)`,
  )
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (headerRe.test(lines[i])) {
      start = i
      break
    }
  }
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      end = i
      break
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '')
}

const apkPath = findApk()
if (!apkPath) {
  console.error(`未找到 APK（期望 ${assetName}）`)
  process.exit(1)
}

const buf = fs.readFileSync(apkPath)
const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
const size = buf.length
const url = `https://github.com/${repo}/releases/download/${tag.startsWith('v') ? tag : `v${version}`}/${assetName}`

const manifest = {
  version,
  notes: extractNotes(),
  pub_date: new Date().toISOString(),
  platforms: {
    'aarch64-linux-android': {
      url,
      sha256,
      size,
    },
  },
}

const outPath = path.join(process.cwd(), 'android-latest.json')
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`已写入 ${outPath}`)
console.log(`  version=${version}`)
console.log(`  apk=${apkPath}`)
console.log(`  sha256=${sha256}`)
console.log(`  size=${size}`)
console.log(`  url=${url}`)
