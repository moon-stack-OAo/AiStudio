#!/usr/bin/env node
/**
 * 对比 theme.js PALETTE 与 tokens.scss 中需同步的实色，防止双源漂移。
 * 用法: node scripts/check-theme-sync.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const themePath = path.join(root, 'src/core/utils/theme.js')
const tokensPath = path.join(root, 'src/core/styles/tokens.scss')

const themeSrc = fs.readFileSync(themePath, 'utf8')
const tokensSrc = fs.readFileSync(tokensPath, 'utf8')

function extractPalette(src) {
  const start = src.indexOf('const PALETTE = {')
  if (start < 0) throw new Error('未找到 const PALETTE')
  let i = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('PALETTE 对象括号不匹配')
  return new Function(`return (${src.slice(start + 'const PALETTE = '.length, end + 1)})`)()
}

function extractBlock(src, marker) {
  const idx = src.indexOf(marker)
  if (idx < 0) throw new Error(`未找到选择器块: ${marker}`)
  let i = src.indexOf('{', idx)
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error(`选择器块括号不匹配: ${marker}`)
  return src.slice(idx, end + 1)
}

function parseCssVars(block) {
  const map = {}
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(block))) {
    map[m[1]] = m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim()
  }
  return map
}

const PALETTE = extractPalette(themeSrc)

const darkVars = parseCssVars(extractBlock(tokensSrc, "[data-theme='dark']"))
const lightVars = parseCssVars(extractBlock(tokensSrc, "[data-theme='light']"))

const checks = [
  ['dark', 'bg', '--color-bg', darkVars],
  ['dark', 'primary', '--color-primary', darkVars],
  ['dark', 'primaryHover', '--color-primary-hover', darkVars],
  ['dark', 'primaryPressed', '--color-primary-pressed', darkVars],
  ['dark', 'card', '--color-bg-elevated', darkVars],
  ['dark', 'border', '--border-muted', darkVars],
  ['dark', 'text1', '--text-1', darkVars],
  ['dark', 'text2', '--text-2', darkVars],
  ['dark', 'text3', '--text-3', darkVars],
  ['dark', 'radius', '--radius-md', darkVars],
  ['light', 'bg', '--color-bg', lightVars],
  ['light', 'primary', '--color-primary', lightVars],
  ['light', 'primaryHover', '--color-primary-hover', lightVars],
  ['light', 'primaryPressed', '--color-primary-pressed', lightVars],
  ['light', 'card', '--color-bg-elevated', lightVars],
  ['light', 'border', '--border-muted', lightVars],
  ['light', 'text1', '--text-1', lightVars],
  ['light', 'text2', '--text-2', lightVars],
  ['light', 'text3', '--text-3', lightVars],
  ['light', 'radius', '--radius-md', darkVars],
]

const mismatches = []
for (const [mode, key, cssVar, vars] of checks) {
  const jsVal = PALETTE[mode][key]
  const cssVal = vars[cssVar]
  if (cssVal == null) {
    mismatches.push(`缺失 ${mode}.${key} ↔ ${cssVar}`)
    continue
  }
  if (jsVal !== cssVal) {
    mismatches.push(`${mode}.${key}: JS=${jsVal} | SCSS ${cssVar}=${cssVal}`)
  }
}

if (mismatches.length) {
  console.error('主题色不同步（theme.js PALETTE ↔ tokens.scss）：')
  for (const line of mismatches) console.error(`  - ${line}`)
  process.exit(1)
}

console.log('主题色同步检查通过（PALETTE ↔ tokens.scss）')
