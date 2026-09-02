/**
 * Chat localStorage 体积守卫：序列化体积估算、按限额裁剪会话/消息、写入失败降级。
 * 纯函数，便于单测；不引入 IndexedDB。
 */

/** 单条消息 content 字符上限（超出截断并标注） */
export const MAX_CHAT_MESSAGE_CHARS = 100_000

/** 单会话最多保留消息条数（超出丢最旧） */
export const MAX_CHAT_MESSAGES_PER_SESSION = 200

/** 最多保留会话数（超出丢最旧非活跃会话） */
export const MAX_CHAT_SESSIONS = 40

/**
 * 目标序列化体积上限（UTF-16 码元近似字节）。
 * localStorage 常见配额约 5MB 且与其它键共享，chat 单独控在约 2.5MB。
 */
export const MAX_CHAT_PAYLOAD_CHARS = 2.5 * 1024 * 1024

/** 写入失败后更激进裁剪时的目标（再压一半） */
export const CHAT_PAYLOAD_RETRY_CHARS = 1.2 * 1024 * 1024

/**
 * 粗估 JSON 序列化后占用（与 localStorage 字符串长度同量级）。
 * @param {unknown} value
 * @returns {number}
 */
export function estimateJsonChars(value) {
  try {
    return JSON.stringify(value)?.length || 0
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

/**
 * 裁剪单条消息 content，避免单条撑爆配额。
 * @param {object} msg
 * @param {number} [maxChars]
 */
export function sanitizeChatMessage(msg, maxChars = MAX_CHAT_MESSAGE_CHARS) {
  if (!msg || typeof msg !== 'object') return msg
  const content = msg.content
  if (typeof content !== 'string' || content.length <= maxChars) return msg
  return {
    ...msg,
    content: `${content.slice(0, maxChars)}\n\n…（本地已截断，原长度 ${content.length}）`,
  }
}

/**
 * @param {object} session
 * @param {{ maxMessages?: number, maxMessageChars?: number }} [opts]
 */
export function sanitizeChatSession(session, opts = {}) {
  if (!session || typeof session !== 'object') return session
  const maxMessages = Math.max(1, Number(opts.maxMessages) || MAX_CHAT_MESSAGES_PER_SESSION)
  const maxMessageChars = Math.max(1, Number(opts.maxMessageChars) || MAX_CHAT_MESSAGE_CHARS)
  let messages = Array.isArray(session.messages) ? session.messages : []
  if (messages.length > maxMessages) {
    messages = messages.slice(messages.length - maxMessages)
  }
  messages = messages.map((m) => sanitizeChatMessage(m, maxMessageChars))
  return {...session, messages}
}

/**
 * 按 updatedAt 升序（最旧在前）；active 会话尽量保留。
 * @param {object[]} sessions
 * @param {string|null|undefined} activeId
 * @param {number} maxSessions
 */
export function capChatSessionCount(sessions, activeId, maxSessions = MAX_CHAT_SESSIONS) {
  const list = Array.isArray(sessions) ? [...sessions] : []
  const limit = Math.max(1, Number(maxSessions) || MAX_CHAT_SESSIONS)
  if (list.length <= limit) return list

  const sorted = list.sort((a, b) => (a?.updatedAt || 0) - (b?.updatedAt || 0))
  const keep = new Set()
  const active = sorted.find((s) => s?.id === activeId)
  if (active) keep.add(active.id)

  for (let i = sorted.length - 1; i >= 0 && keep.size < limit; i -= 1) {
    const id = sorted[i]?.id
    if (id) keep.add(id)
  }

  // 仍超限时允许丢掉 active（极端），保证数量
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
 * 从最旧非活跃会话删消息；不够再删活跃会话最旧消息；仍超则丢最旧整会话。
 * @param {{ sessions: object[], activeId?: string|null }} payload
 * @param {number} maxChars
 * @returns {{ payload: { sessions: object[], activeId: string|null }, trimmed: boolean, droppedSessions: number, droppedMessages: number }}
 */
export function trimChatPayloadToBudget(payload, maxChars = MAX_CHAT_PAYLOAD_CHARS) {
  const budget = Math.max(1024, Math.floor(Number(maxChars) || MAX_CHAT_PAYLOAD_CHARS))
  let sessions = (payload?.sessions || []).map((s) => ({
    ...s,
    messages: Array.isArray(s.messages) ? [...s.messages] : [],
  }))
  let activeId = payload?.activeId ?? null
  let droppedSessions = 0
  let droppedMessages = 0

  const snapshot = () => ({sessions, activeId})
  if (estimateJsonChars(snapshot()) <= budget) {
    return {payload: snapshot(), trimmed: false, droppedSessions: 0, droppedMessages: 0}
  }

  // 1) 先丢掉最旧非活跃会话的整段消息（会话壳保留）
  const byOldest = () => [...sessions].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))

  for (const s of byOldest()) {
    if (estimateJsonChars(snapshot()) <= budget) break
    if (s.id === activeId) continue
    if (!s.messages.length) continue
    droppedMessages += s.messages.length
    s.messages = []
  }

  // 2) 活跃会话也从最旧消息开始丢，至少保留最近 2 条
  if (estimateJsonChars(snapshot()) > budget) {
    const active = sessions.find((s) => s.id === activeId) || sessions[0]
    while (active && active.messages.length > 2 && estimateJsonChars(snapshot()) > budget) {
      active.messages.shift()
      droppedMessages += 1
    }
  }

  // 3) 其它会话再砍到 0 后仍超：丢最旧整会话（保留至少一个）
  while (sessions.length > 1 && estimateJsonChars(snapshot()) > budget) {
    const ordered = byOldest()
    const victim = ordered.find((s) => s.id !== activeId) || ordered[0]
    if (!victim) break
    droppedMessages += victim.messages?.length || 0
    sessions = sessions.filter((s) => s.id !== victim.id)
    droppedSessions += 1
    if (activeId === victim.id) {
      activeId = sessions[0]?.id ?? null
    }
  }

  // 4) 最后一会话仍超：继续丢消息直到只剩 1 条或进预算
  const last = sessions[0]
  while (last && last.messages.length > 1 && estimateJsonChars(snapshot()) > budget) {
    last.messages.shift()
    droppedMessages += 1
  }

  const trimmed = droppedSessions > 0 || droppedMessages > 0
  return {payload: snapshot(), trimmed, droppedSessions, droppedMessages}
}

/**
 * 写入前标准守卫：sanitize → 会话数上限 → 体积预算。
 * @param {{ sessions: object[], activeId?: string|null }} raw
 * @param {{
 *   maxSessions?: number,
 *   maxMessagesPerSession?: number,
 *   maxMessageChars?: number,
 *   maxPayloadChars?: number,
 * }} [opts]
 */
export function prepareChatPersistPayload(raw, opts = {}) {
  const maxSessions = opts.maxSessions ?? MAX_CHAT_SESSIONS
  const maxMessagesPerSession = opts.maxMessagesPerSession ?? MAX_CHAT_MESSAGES_PER_SESSION
  const maxMessageChars = opts.maxMessageChars ?? MAX_CHAT_MESSAGE_CHARS
  const maxPayloadChars = opts.maxPayloadChars ?? MAX_CHAT_PAYLOAD_CHARS

  let activeId = raw?.activeId ?? null
  let sessions = capChatSessionCount(raw?.sessions || [], activeId, maxSessions).map((s) =>
    sanitizeChatSession(s, {maxMessages: maxMessagesPerSession, maxMessageChars}),
  )
  if (activeId && !sessions.some((s) => s.id === activeId)) {
    activeId = sessions[0]?.id ?? null
  }

  const sessionCountDropped = Math.max(0, (raw?.sessions?.length || 0) - sessions.length)
  const messagesSoftDropped = (raw?.sessions || []).some((s) => {
    const next = sessions.find((x) => x.id === s.id)
    if (!next) return true
    if ((s.messages?.length || 0) !== (next.messages?.length || 0)) return true
    return (s.messages || []).some((m) => {
      const nm = next.messages.find((x) => x.id === m.id)
      if (!nm) return true
      return (
        typeof m?.content === 'string' &&
        typeof nm?.content === 'string' &&
        m.content.length !== nm.content.length
      )
    })
  })

  const before = {sessions, activeId}
  const {payload, trimmed, droppedSessions, droppedMessages} = trimChatPayloadToBudget(
    before,
    maxPayloadChars,
  )

  return {
    payload,
    trimmed: trimmed || sessionCountDropped > 0 || messagesSoftDropped,
    droppedSessions: droppedSessions + sessionCountDropped,
    droppedMessages,
  }
}
