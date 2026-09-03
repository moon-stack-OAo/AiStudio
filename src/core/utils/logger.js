import {loadJSON, saveJSON, removeKey} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {sanitizeErrorText} from '@core/api/errors'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error']
export const LOG_STORAGE_KEY = 'app_logs'
export const MAX_LOG_ENTRIES = 500
export const MAX_LOG_MESSAGE_LEN = 1200

const LEVEL_RANK = {debug: 10, info: 20, warn: 30, error: 40}

/** @type {Array<{id:string,ts:number,level:string,source:string,message:string,detail:string}>} */
let entries = []
const listeners = new Set()
let persistTimer = null
let consoleInstalled = false
let globalHandlersInstalled = false
let originalConsole = null
let capturing = false

function normalizeLevel(level) {
  const v = String(level || 'info').toLowerCase()
  return LOG_LEVELS.includes(v) ? v : 'info'
}

function truncateText(text, max = MAX_LOG_MESSAGE_LEN) {
  const s = String(text || '')
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function redactSecrets(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-]+/gi, '$1***')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/gi, '***')
    .replace(/\bxai-[A-Za-z0-9_-]{10,}\b/gi, '***')
    .replace(/\bgsk_[A-Za-z0-9_-]{10,}\b/gi, '***')
}

function sanitizeLogText(text, fallback = '') {
  // 先脱敏再走错误文案清洗，避免含密钥整段被直接清空
  const redacted = redactSecrets(text)
  const cleaned = sanitizeErrorText(redacted, fallback)
  return truncateText(cleaned || redactSecrets(fallback) || '')
}

function serializeArg(arg) {
  if (arg == null) return ''
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) {
    return arg.message || arg.name || 'Error'
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
  if (typeof arg === 'object') {
    try {
      const json = JSON.stringify(arg)
      if (!json || json === '{}') return Object.prototype.toString.call(arg)
      return json
    } catch {
      return Object.prototype.toString.call(arg)
    }
  }
  return String(arg)
}

function formatConsoleArgs(args) {
  return args
    .map((arg) => serializeArg(arg))
    .filter(Boolean)
    .join(' ')
}

function notify() {
  const snapshot = entries.slice()
  for (const fn of listeners) {
    try {
      fn(snapshot)
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function schedulePersist() {
  if (persistTimer != null) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 400)
}

function persistNow() {
  // 持久化失败时 storage 会 console.error；避免再写入日志造成循环
  const prev = capturing
  capturing = true
  try {
    const ok = saveJSON(LOG_STORAGE_KEY, {
      version: 1,
      entries: entries.slice(-MAX_LOG_ENTRIES),
    })
    if (!ok) {
      const trimmed = entries.slice(-Math.floor(MAX_LOG_ENTRIES / 2))
      entries = trimmed
      saveJSON(LOG_STORAGE_KEY, {version: 1, entries: trimmed})
      capturing = prev
      notify()
      return
    }
  } finally {
    capturing = prev
  }
}

function hydrate() {
  const raw = loadJSON(LOG_STORAGE_KEY, null)
  if (!raw || !Array.isArray(raw.entries)) {
    entries = []
    return
  }
  entries = raw.entries
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || createId('log')),
      ts: Number(item.ts) || Date.now(),
      level: normalizeLevel(item.level),
      source: truncateText(String(item.source || 'app'), 64),
      message: sanitizeLogText(item.message, ''),
      detail: sanitizeLogText(item.detail, ''),
    }))
    .slice(-MAX_LOG_ENTRIES)
}

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {{source?: string, detail?: string, persist?: boolean}} [options]
 */
export function appendLog(level, message, options = {}) {
  if (capturing) return null
  capturing = true
  try {
    const entry = {
      id: createId('log'),
      ts: Date.now(),
      level: normalizeLevel(level),
      source: truncateText(String(options.source || 'app'), 64) || 'app',
      message: sanitizeLogText(message, '（空日志）') || '（空日志）',
      detail: sanitizeLogText(options.detail, ''),
    }
    entries = [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry]
    notify()
    if (options.persist !== false) schedulePersist()
    return entry
  } finally {
    capturing = false
  }
}

export function logDebug(message, options) {
  return appendLog('debug', message, options)
}

export function logInfo(message, options) {
  return appendLog('info', message, options)
}

export function logWarn(message, options) {
  return appendLog('warn', message, options)
}

export function logError(message, options) {
  return appendLog('error', message, options)
}

export function getLogs() {
  return entries.slice()
}

export function getLogCount() {
  return entries.length
}

export function clearLogs({persist = true} = {}) {
  entries = []
  notify()
  if (persist) {
    removeKey(LOG_STORAGE_KEY)
  }
}

export function subscribeLogs(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  listener(entries.slice())
  return () => listeners.delete(listener)
}

export function filterLogs(list, {level = 'all', query = ''} = {}) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  const minRank = level === 'all' ? 0 : (LEVEL_RANK[normalizeLevel(level)] ?? 0)
  return (list || []).filter((item) => {
    if ((LEVEL_RANK[item.level] ?? 0) < minRank) return false
    if (!q) return true
    const hay = `${item.message} ${item.detail} ${item.source}`.toLowerCase()
    return hay.includes(q)
  })
}

export function logsToText(list = entries) {
  return list
    .map((item) => {
      const time = new Date(item.ts).toISOString()
      const detail = item.detail ? ` | ${item.detail}` : ''
      return `[${time}] [${item.level.toUpperCase()}] [${item.source}] ${item.message}${detail}`
    })
    .join('\n')
}

export function installConsoleCapture() {
  if (consoleInstalled || typeof console === 'undefined') return
  originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  }

  const wrap =
    (level, native) =>
    (...args) => {
      try {
        native(...args)
      } catch {
        /* ignore native console failure */
      }
      try {
        const text = formatConsoleArgs(args)
        if (!text) return
        appendLog(level, text, {source: 'console'})
      } catch {
        /* ignore capture failure */
      }
    }

  console.log = wrap('info', originalConsole.log)
  console.info = wrap('info', originalConsole.info)
  console.warn = wrap('warn', originalConsole.warn)
  console.error = wrap('error', originalConsole.error)
  console.debug = wrap('debug', originalConsole.debug)
  consoleInstalled = true
}

function installGlobalHandlers() {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  window.addEventListener('error', (event) => {
    const msg = event?.message || event?.error?.message || '未捕获错误'
    const detail = event?.filename
      ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
      : sanitizeLogText(event?.error?.stack, '')
    appendLog('error', msg, {source: 'window', detail})
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    const msg =
      reason instanceof Error
        ? reason.message || '未处理的 Promise 拒绝'
        : sanitizeLogText(serializeArg(reason), '未处理的 Promise 拒绝')
    const detail = reason instanceof Error ? sanitizeLogText(reason.stack, '') : ''
    appendLog('error', msg, {source: 'promise', detail})
  })
  globalHandlersInstalled = true
}

/** 应用启动时调用：恢复持久化日志并安装采集钩子 */
export function initAppLogger() {
  hydrate()
  installConsoleCapture()
  installGlobalHandlers()
  appendLog('info', '应用日志已启动', {source: 'app'})
}
