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

function publicDownloadUrl(fileName) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(fileName)}`
}

function toFinalPublicUrl(url, fileName) {
  if (!url) return publicDownloadUrl(fileName)
  if (url.includes('/download/untagged-')) {
    return url.replace(/\/download\/untagged-[^/]+\//, `/download/${tag}/`)
  }
  if (url.includes(`/download/${tag}/`)) return url
  return publicDownloadUrl(fileName)
}

/**
 * draft Release 对 REST `releases/tags/{tag}` 常 404；
 * `gh release view --json assets` 在 draft 下 browser_download_url 可能为 null，
 * 且 asset id 是 GraphQL node id，无法匹配 latest.json 里的数字 asset id。
 * 因此：先拿 databaseId，再走 REST /releases/{id}。
 */
const releaseMeta = ghJson(['release', 'view', tag, '--repo', repo, '--json', 'databaseId,isDraft'])
const releaseId = releaseMeta?.databaseId
if (!releaseId) {
  console.error(`无法解析 Release ${tag} 的 databaseId`)
  process.exit(1)
}

const release = ghJson(['api', `repos/${repo}/releases/${releaseId}`])
const assets = Array.isArray(release?.assets) ? release.assets : []
if (assets.length === 0) {
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
    if (!asset?.name) {
      console.error(`平台 ${platform}: 找不到 asset id=${apiMatch[1]}`)
      process.exit(1)
    }
    // 发布前写成最终 tag 公开地址，避免 draft 的 untagged 链接在正式发布后失效
    next = toFinalPublicUrl(asset.browser_download_url, asset.name)
  } else if (url.includes('/download/untagged-')) {
    const name = decodeURIComponent(url.split('/').pop() || '')
    const asset = byName.get(name)
    next = toFinalPublicUrl(asset?.browser_download_url, name || asset?.name)
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
