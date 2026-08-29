import {
  CHAT_CONTEXT_WARN_RATIO,
  DEFAULT_CHAT_CONTEXT_MAX_CHARS,
  DEFAULT_CHAT_CONTEXT_MAX_TURNS,
} from '@core/utils/constants'

/**
 * 统计对话轮数：以 user 消息条数为准。
 * @param {Array<{ role: string }>} messages
 */
export function countChatTurns(messages = []) {
  return messages.filter((m) => m.role === 'user').length
}

/**
 * 粗估消息总字符数（非 Token）。
 * @param {Array<{ content?: unknown }>} messages
 */
export function estimateChatChars(messages = []) {
  let total = 0
  for (const m of messages) {
    const c = m?.content
    if (typeof c === 'string') {
      total += c.length
    } else if (c == null) {
      // skip
    } else {
      try {
        total += JSON.stringify(c).length
      } catch {
        total += String(c).length
      }
    }
  }
  return total
}

/**
 * 丢掉最旧一轮（从最早的 user 起，直到下一轮 user 之前）。
 * 仅剩一轮时原样返回。
 * @param {Array<{ role: string }>} rest
 */
function dropOldestTurn(rest) {
  const firstUser = rest.findIndex((m) => m.role === 'user')
  if (firstUser < 0) return rest
  let nextUser = -1
  for (let i = firstUser + 1; i < rest.length; i += 1) {
    if (rest[i].role === 'user') {
      nextUser = i
      break
    }
  }
  if (nextUser < 0) return rest
  return rest.slice(nextUser)
}

/**
 * 发送前裁剪上下文：保留全部 system，以及最近 maxTurns 轮 user/assistant；
 * 可选再按字符预算从最旧轮丢弃。
 * 本地会话记录不删，仅影响本次请求 payload。
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{
 *   enabled?: boolean,
 *   maxTurns?: number,
 *   maxCharsEnabled?: boolean,
 *   maxChars?: number,
 * }} [options]
 */
export function trimChatMessages(messages = [], options = {}) {
  const enabled = options.enabled !== false
  const maxTurns = Math.max(1, Number(options.maxTurns) || DEFAULT_CHAT_CONTEXT_MAX_TURNS)
  const maxCharsEnabled = Boolean(options.maxCharsEnabled)
  const maxChars = Math.max(1, Math.floor(Number(options.maxChars) || DEFAULT_CHAT_CONTEXT_MAX_CHARS))

  const system = []
  const rest = []
  for (const m of messages) {
    if (m?.role === 'system') system.push(m)
    else if (m?.role === 'user' || m?.role === 'assistant') rest.push(m)
  }

  const totalTurns = countChatTurns(rest)
  let kept = rest
  let truncated = false
  let droppedTurns = 0

  if (enabled && totalTurns > maxTurns) {
    let usersSeen = 0
    let startIdx = 0
    for (let i = rest.length - 1; i >= 0; i -= 1) {
      if (rest[i].role === 'user') {
        usersSeen += 1
        if (usersSeen >= maxTurns) {
          startIdx = i
          break
        }
      }
    }
    kept = rest.slice(startIdx)
    truncated = true
    droppedTurns = totalTurns - countChatTurns(kept)
  }

  let resultMessages = [...system, ...kept]
  const totalChars = estimateChatChars(resultMessages)
  let truncatedByChars = false

  if (maxCharsEnabled && totalChars > maxChars) {
    let working = kept
    while (estimateChatChars([...system, ...working]) > maxChars) {
      const next = dropOldestTurn(working)
      if (next === working || next.length === working.length) break
      working = next
      truncatedByChars = true
    }
    if (truncatedByChars) {
      const keptTurnsAfter = countChatTurns(working)
      droppedTurns = totalTurns - keptTurnsAfter
      truncated = truncated || truncatedByChars
      kept = working
      resultMessages = [...system, ...kept]
    }
  }

  const keptTurns = countChatTurns(kept)
  const keptChars = estimateChatChars(resultMessages)
  const nearLimit = enabled && totalTurns >= Math.ceil(maxTurns * CHAT_CONTEXT_WARN_RATIO)
  const nearCharLimit =
    maxCharsEnabled && keptChars >= Math.ceil(maxChars * CHAT_CONTEXT_WARN_RATIO)

  return {
    messages: resultMessages,
    truncated,
    truncatedByChars,
    droppedTurns,
    totalTurns,
    keptTurns,
    maxTurns,
    nearLimit,
    totalChars,
    keptChars,
    maxChars,
    nearCharLimit,
  }
}
