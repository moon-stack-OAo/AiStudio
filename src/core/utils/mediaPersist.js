/**
 * Image/Video localStorage 体积守卫：会话数/条目数上限与载荷预算裁剪。
 * 纯函数，便于单测；不触及 IndexedDB 二进制。
 */
import {estimateJsonChars} from '@core/utils/chatPersist'

/** 最多保留会话数（超出丢最旧非活跃） */
export const MAX_MEDIA_SESSIONS = 30

/** 单会话最多保留条目（超出丢最旧） */
export const MAX_MEDIA_ITEMS_PER_SESSION = 80

/**
 * 目标序列化体积上限（UTF-16 码元近似）。
 * 与 chat(~2.5MB)、settings 共享约 5MB 配额，image/video 各自控在约 1.2MB。
 */
export const MAX_MEDIA_PAYLOAD_CHARS = 1.2 * 1024 * 1024

/** 写入失败后更激进裁剪目标 */
export const MEDIA_PAYLOAD_RETRY_CHARS = 0.6 * 1024 * 1024

export const IMAGE_PERSIST_LIMITS = {
  maxSessions: MAX_MEDIA_SESSIONS,
  maxItemsPerSession: 100,
  maxPayloadChars: MAX_MEDIA_PAYLOAD_CHARS,
}

export const IMAGE_PERSIST_RETRY = {
  maxSessions: 15,
  maxItemsPerSession: 40,
  maxPayloadChars: MEDIA_PAYLOAD_RETRY_CHARS,
}

export const VIDEO_PERSIST_LIMITS = {
  maxSessions: MAX_MEDIA_SESSIONS,
  maxItemsPerSession: 50,
  maxPayloadChars: MAX_MEDIA_PAYLOAD_CHARS,
}

export const VIDEO_PERSIST_RETRY = {
  maxSessions: 12,
  maxItemsPerSession: 20,
  maxPayloadChars: MEDIA_PAYLOAD_RETRY_CHARS,
}

/**
 * 按 updatedAt 升序；优先保留 active。
 * @param {object[]} sessions
 * @param {string|null|undefined} activeId
 * @param {number} maxSessions
 */
export function capMediaSessionCount(sessions, activeId, maxSessions = MAX_MEDIA_SESSIONS) {
  const list = Array.isArray(sessions) ? [...sessions] : []
  const limit = Math.max(1, Number(maxSessions) || MAX_MEDIA_SESSIONS)
  if (list.length <= limit) return list

  const sorted = list.sort((a, b) => (a?.updatedAt || 0) - (b?.updatedAt || 0))
  const keep = new Set()
  const active = sorted.find((s) => s?.id === activeId)
  if (active) keep.add(active.id)

  for (let i = sorted.length - 1; i >= 0 && keep.size < limit; i -= 1) {
    const id = sorted[i]?.id
    if (id) keep.add(id)
  }

  if (keep.size > limit) {
    const newestFirst = [...sorted].reverse()
    keep.clear()
    for (const s of newestFirst) {
      if (keep.size >= limit) break
      if (s?.id) keep.add(s.id)
    }
  }

  return list
    .filter((s) => keep.has(s?.id))
    .sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0))
}

/**
 * @param {object} session
 * @param {{ maxItems?: number, sanitizeItem?: (item: object) => object }} [opts]
 */
export function sanitizeMediaSession(session, opts = {}) {
  if (!session || typeof session !== 'object') return session
  const maxItems = Math.max(1, Number(opts.maxItems) || MAX_MEDIA_ITEMS_PER_SESSION)
  const sanitizeItem = typeof opts.sanitizeItem === 'function' ? opts.sanitizeItem : (x) => x
  let items = Array.isArray(session.items) ? session.items : []
  if (items.length > maxItems) {
    items = items.slice(items.length - maxItems)
  }
  items = items.map((item) => sanitizeItem(item))
  return {...session, items}
}

/**
 * 从最旧非活跃会话清空条目；不够再砍活跃最旧条目；仍超则丢最旧整会话。
 * @param {{ sessions: object[], activeId?: string|null }} payload
 * @param {number} maxChars
 */
export function trimMediaPayloadToBudget(payload, maxChars = MAX_MEDIA_PAYLOAD_CHARS) {
  const budget = Math.max(1024, Math.floor(Number(maxChars) || MAX_MEDIA_PAYLOAD_CHARS))
  let sessions = (payload?.sessions || []).map((s) => ({
    ...s,
    items: Array.isArray(s.items) ? [...s.items] : [],
  }))
  let activeId = payload?.activeId ?? null
  let droppedSessions = 0
  let droppedItems = 0

  const snapshot = () => ({sessions, activeId})
  if (estimateJsonChars(snapshot()) <= budget) {
    return {payload: snapshot(), trimmed: false, droppedSessions: 0, droppedItems: 0}
  }

  const byOldest = () => [...sessions].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))

  for (const s of byOldest()) {
    if (estimateJsonChars(snapshot()) <= budget) break
    if (s.id === activeId) continue
    if (!s.items.length) continue
    droppedItems += s.items.length
    s.items = []
  }

  if (estimateJsonChars(snapshot()) > budget) {
    const active = sessions.find((s) => s.id === activeId) || sessions[0]
    while (active && active.items.length > 2 && estimateJsonChars(snapshot()) > budget) {
      active.items.shift()
      droppedItems += 1
    }
  }

  while (sessions.length > 1 && estimateJsonChars(snapshot()) > budget) {
    const ordered = byOldest()
    const victim = ordered.find((s) => s.id !== activeId) || ordered[0]
    if (!victim) break
    droppedItems += victim.items?.length || 0
    sessions = sessions.filter((s) => s.id !== victim.id)
    droppedSessions += 1
    if (activeId === victim.id) {
      activeId = sessions[0]?.id ?? null
    }
  }

  const last = sessions[0]
  while (last && last.items.length > 1 && estimateJsonChars(snapshot()) > budget) {
    last.items.shift()
    droppedItems += 1
  }

  const trimmed = droppedSessions > 0 || droppedItems > 0
  return {payload: snapshot(), trimmed, droppedSessions, droppedItems}
}

/**
 * 写入前标准守卫：sanitize → 会话数上限 → 体积预算。
 * @param {{ sessions: object[], activeId?: string|null }} raw
 * @param {{
 *   maxSessions?: number,
 *   maxItemsPerSession?: number,
 *   maxPayloadChars?: number,
 *   sanitizeItem?: (item: object) => object,
 * }} [opts]
 */
export function prepareMediaPersistPayload(raw, opts = {}) {
  const maxSessions = opts.maxSessions ?? MAX_MEDIA_SESSIONS
  const maxItemsPerSession = opts.maxItemsPerSession ?? MAX_MEDIA_ITEMS_PER_SESSION
  const maxPayloadChars = opts.maxPayloadChars ?? MAX_MEDIA_PAYLOAD_CHARS
  const sanitizeItem = opts.sanitizeItem

  let activeId = raw?.activeId ?? null
  let sessions = capMediaSessionCount(raw?.sessions || [], activeId, maxSessions).map((s) =>
    sanitizeMediaSession(s, {maxItems: maxItemsPerSession, sanitizeItem}),
  )
  if (activeId && !sessions.some((s) => s.id === activeId)) {
    activeId = sessions[0]?.id ?? null
  }

  const sessionCountDropped = Math.max(0, (raw?.sessions?.length || 0) - sessions.length)
  const itemsSoftDropped = (raw?.sessions || []).some((s) => {
    const next = sessions.find((x) => x.id === s.id)
    if (!next) return true
    return (s.items?.length || 0) !== (next.items?.length || 0)
  })

  const before = {sessions, activeId}
  const {payload, trimmed, droppedSessions, droppedItems} = trimMediaPayloadToBudget(
    before,
    maxPayloadChars,
  )

  return {
    payload,
    trimmed: trimmed || sessionCountDropped > 0 || itemsSoftDropped,
    droppedSessions: droppedSessions + sessionCountDropped,
    droppedItems,
  }
}

/**
 * 对比裁剪前后，收集被丢掉的条目（用于清理 IndexedDB / revoke blob）。
 * @param {object[]} beforeSessions
 * @param {object[]} afterSessions
 * @returns {object[]}
 */
export function collectDroppedMediaItems(beforeSessions, afterSessions) {
  const keep = new Set()
  for (const s of afterSessions || []) {
    for (const item of s?.items || []) {
      if (s?.id && item?.id) keep.add(`${s.id}:${item.id}`)
    }
  }
  const dropped = []
  for (const s of beforeSessions || []) {
    for (const item of s?.items || []) {
      if (!s?.id || !item?.id) continue
      if (!keep.has(`${s.id}:${item.id}`)) dropped.push(item)
    }
  }
  return dropped
}
