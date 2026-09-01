#!/usr/bin/env node
/**
 * 将 latest.json 中 api.github.com/releases/assets/{id} 改写为公开 browser_download_url。
 * tauri-action 偶发写入 API URL；客户端无鉴权下载会 403 / ERR_CONNECTION_CLOSED。
 *
 * 用法:
 *   node .github/scripts/rewrite-updater-latest.mjs <tag> [latest.json路径]
 * 环境变量: GITHUB_REPOSITORY / GH_REPO、GH_TOKEN（gh 鉴权）
 */
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const tag = String(process.argv[2] || process.env.GITHUB_REF_NAME || '').trim()
if (!tag) {
  console.error('缺少 tag，例如: node .github/scripts/rewrite-updater-latest.mjs v1.0.2')
  process.exit(1)
}

const repo =
  String(process.env.GITHUB_REPOSITORY || process.env.GH_REPO || '').trim() ||
  'moon-stack-OAo/AiStudio'

const inputPath = path.resolve(process.argv[3] || path.join(process.cwd(), 'latest.json'))

function ghJson(args) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out)
}

const assets = ghJson([
  'api',
  `repos/${repo}/releases/tags/${tag}`,
  '--jq',
  '[.assets[] | {id, name, browser_download_url}]',
])

if (!Array.isArray(assets) || assets.length === 0) {
  console.error(`Release ${tag} 无资产`)
  process.exit(1)
}

const byId = new Map(assets.map((a) => [String(a.id), a]))
const byName = new Map(assets.map((a) => [a.name, a]))

if (!fs.existsSync(inputPath)) {
  if (!byName.get('latest.json')) {
    console.error('未找到 latest.json 资产，且本地无输入文件')
    process.exit(1)
  }
  const dir = path.dirname(inputPath)
  fs.mkdirSync(dir, {recursive: true})
  execFileSync(
    'gh',
    [
      'release',
      'download',
      tag,
      '--repo',
      repo,
      '--pattern',
      'latest.json',
      '--dir',
      dir,
      '--clobber',
    ],
    {encoding: 'utf8', env: process.env, stdio: 'inherit'},
  )
}

const raw = fs.readFileSync(inputPath, 'utf8')

const manifest = JSON.parse(raw)
const platforms = manifest.platforms || {}
let changed = 0

for (const [platform, entry] of Object.entries(platforms)) {
  const url = String(entry?.url || '')
  if (!url) continue

  let next = url
  const apiMatch = url.match(/\/releases\/assets\/(\d+)/)
  if (apiMatch) {
    const asset = byId.get(apiMatch[1])
    if (!asset?.browser_download_url) {
      console.error(`平台 ${platform}: 找不到 asset id=${apiMatch[1]}`)
      process.exit(1)
    }
    next = asset.browser_download_url
  } else if (url.includes('/download/untagged-')) {
    // draft 阶段 untagged 链接在正式发布后失效，尽量按文件名对齐到 tag 下载地址
    const name = decodeURIComponent(url.split('/').pop() || '')
    const asset = byName.get(name)
    if (asset?.browser_download_url) {
      next = asset.browser_download_url
    } else {
      next = url.replace(/\/download\/untagged-[^/]+\//, `/download/${tag}/`)
    }
  }

  if (next !== url) {
    entry.url = next
    changed += 1
    console.log(`${platform}:`)
    console.log(`  - ${url}`)
    console.log(`  + ${next}`)
  }
}

if (changed === 0) {
  console.log('latest.json 下载地址已是公开链接，无需改写')
} else {
  console.log(`已改写 ${changed} 个平台 URL`)
}

const outPath = path.resolve(process.argv[3] || path.join(process.cwd(), 'latest.json'))
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`已写入 ${outPath}`)
