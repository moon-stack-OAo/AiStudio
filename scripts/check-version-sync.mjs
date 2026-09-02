#!/usr/bin/env node
/**
 * 校验四处版本号一致：package.json、tauri.conf.json、Cargo.toml、version.js APP_VERSION。
 * 可选：CHANGELOG.md 须含 ## [version] 章节（忽略 Unreleased）。
 * gen/android 内嵌 tauri.conf 常被 init 覆盖，仅 warn，不计入失败。
 * 用法: node scripts/check-version-sync.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function pkgVersion() {
  const j = JSON.parse(readText('package.json'))
  const v = String(j.version || '').trim()
  if (!v) throw new Error('package.json 缺少 version')
  return v
}

function tauriVersion() {
  const j = JSON.parse(readText('src-tauri/tauri.conf.json'))
  const v = String(j.version || '').trim()
  if (!v) throw new Error('src-tauri/tauri.conf.json 缺少 version')
  return v
}

function cargoVersion() {
  const src = readText('src-tauri/Cargo.toml')
  const m = src.match(/^\s*version\s*=\s*"([^"]+)"/m)
  if (!m) throw new Error('src-tauri/Cargo.toml 未找到 [package] version')
  return m[1].trim()
}

function appVersionJs() {
  const src = readText('src/core/utils/version.js')
  const m = src.match(/export\s+const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/)
  if (!m) throw new Error('version.js 未找到 export const APP_VERSION')
  return m[1].trim()
}

function changelogHasVersion(version) {
  const src = readText('CHANGELOG.md')
  const re = new RegExp(`^## \\[v?${version.replace(/\./g, '\\.')}\\](?:\\s|$)`, 'm')
  return re.test(src)
}

function warnGenAndroid(expected) {
  const genPath = path.join(root, 'src-tauri/gen/android/app/src/main/assets/tauri.conf.json')
  if (!fs.existsSync(genPath)) {
    console.log('提示: 未找到 gen/android 内嵌 tauri.conf.json（可忽略）')
    return
  }
  try {
    const j = JSON.parse(fs.readFileSync(genPath, 'utf8'))
    const v = String(j.version || '').trim()
    if (v && v !== expected) {
      console.warn(
        `警告: gen/android 内嵌 version=${v}，与 ${expected} 不一致（gen 常被 tauri android init 覆盖，不作为硬失败；正式构建前请按 CONTRIBUTING 同步原生源）`,
      )
    } else if (v === expected) {
      console.log(`gen/android 内嵌 version 与 ${expected} 一致`)
    }
  } catch (e) {
    console.warn(`警告: 无法解析 gen/android tauri.conf.json: ${e.message}`)
  }
}

const errors = []
let expected
try {
  expected = pkgVersion()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

const checks = [
  ['package.json', expected],
  ['src-tauri/tauri.conf.json', () => tauriVersion()],
  ['src-tauri/Cargo.toml', () => cargoVersion()],
  ['src/core/utils/version.js APP_VERSION', () => appVersionJs()],
]

const found = {['package.json']: expected}
for (const [label, getter] of checks.slice(1)) {
  try {
    const v = typeof getter === 'function' ? getter() : getter
    found[label] = v
    if (v !== expected) {
      errors.push(`${label}=${v}，期望 ${expected}`)
    }
  } catch (e) {
    errors.push(e.message)
  }
}

if (!changelogHasVersion(expected)) {
  errors.push(`CHANGELOG.md 未找到 ## [${expected}] 章节`)
}

warnGenAndroid(expected)

if (errors.length) {
  console.error('版本号不一致：')
  for (const line of errors) console.error(`  - ${line}`)
  console.error('当前读取：')
  for (const [k, v] of Object.entries(found)) console.error(`  ${k}: ${v}`)
  process.exit(1)
}

console.log(`版本一致性检查通过：${expected}（含 CHANGELOG ## [${expected}]）`)
