#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本章节，写入 release-notes.md
 * 用法: node .github/scripts/extract-changelog.mjs v0.1.1
 */
import fs from 'node:fs'
import path from 'node:path'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || ''
const version = String(tag).trim().replace(/^v/i, '')
if (!version) {
  console.error('缺少版本号，请传入 tag（如 v0.1.1）')
  process.exit(1)
}

const root = process.cwd()
const changelogPath = path.join(root, 'CHANGELOG.md')
const outPath = path.join(root, 'release-notes.md')

if (!fs.existsSync(changelogPath)) {
  console.error('未找到 CHANGELOG.md')
  process.exit(1)
}

const text = fs.readFileSync(changelogPath, 'utf8')
const lines = text.split(/\r?\n/)

const headerRe = new RegExp(
  `^## \\[v?${version.replace(/\./g, '\\.')}\\](?:\\s|$)`,
)
const nextHeaderRe = /^## /

let start = -1
for (let i = 0; i < lines.length; i += 1) {
  if (headerRe.test(lines[i])) {
    start = i
    break
  }
}

if (start < 0) {
  console.error(`CHANGELOG.md 中未找到版本 ${version} 的章节（## [${version}]）`)
  process.exit(1)
}

let end = lines.length
for (let i = start + 1; i < lines.length; i += 1) {
  if (nextHeaderRe.test(lines[i])) {
    end = i
    break
  }
}

const sectionLines = lines.slice(start, end)
const body = sectionLines
  .slice(1)
  .join('\n')
  .replace(/^\s+/, '')
  .replace(/\s+$/, '')

const notes = [
  `## AI Studio v${version}`,
  '',
  body || '_（该版本暂无变更说明）_',
  '',
  '---',
  '',
  '### 下载',
  '',
  '请下载下方 Assets 中的 Windows 安装包进行安装。',
  '',
  '已安装用户可在应用内「设置 → 关于与更新」检查并自动安装更新。',
  '',
].join('\n')

fs.writeFileSync(outPath, notes, 'utf8')
console.log(`已写入 ${outPath}（版本 ${version}）`)
