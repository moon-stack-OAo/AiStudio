#!/usr/bin/env node
/**
 * 执行命令并打印耗时。用法: node scripts/run-timed.mjs <cmd> [args...]
 */
import {spawnSync} from 'node:child_process'
import process from 'node:process'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('用法: node scripts/run-timed.mjs <命令> [参数...]')
  process.exit(1)
}

const [cmd, ...cmdArgs] = args
const started = Date.now()
const result = spawnSync(cmd, cmdArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
const ms = Date.now() - started

function formatDuration(totalMs) {
  const totalSec = Math.floor(totalMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const frac = Math.floor((totalMs % 1000) / 100)
  if (h > 0) return `${h}小时${m}分${s}.${frac}秒`
  if (m > 0) return `${m}分${s}.${frac}秒`
  return `${s}.${frac}秒`
}

console.log('')
console.log(`耗时: ${formatDuration(ms)}`)
process.exit(result.status === null ? 1 : result.status)
