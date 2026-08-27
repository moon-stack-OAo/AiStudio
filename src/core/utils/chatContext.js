import {CHAT_CONTEXT_WARN_RATIO, DEFAULT_CHAT_CONTEXT_MAX_TURNS,} from '@core/utils/constants'

/**
 * 统计对话轮数：以 user 消息条数为准。
 * @param {Array<{ role: string }>} messages
 */
export function countChatTurns(messages = []) {
  return messages.filter((m) => m.role === 'user').length
}

/**
 * 发送前裁剪上下文：保留全部 system，以及最近 maxTurns 轮 user/assistant。
 * 本地会话记录不删，仅影响本次请求 payload。
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ enabled?: boolean, maxTurns?: number }} [options]
 */
export function trimChatMessages(messages = [], options = {}) {
  const enabled = options.enabled !== false
  const maxTurns = Math.max(
    1,
    Number(options.maxTurns) || DEFAULT_CHAT_CONTEXT_MAX_TURNS,
  )

  const system = []
  const rest = []
  for (const m of messages) {
    if (m?.role === 'system') system.push(m)
    else if (m?.role === 'user' || m?.role === 'assistant') rest.push(m)
  }

  const totalTurns = countChatTurns(rest)
  if (!enabled || totalTurns <= maxTurns) {
    return {
      messages: [...system, ...rest],
      truncated: false,
      droppedTurns: 0,
      totalTurns,
      keptTurns: totalTurns,
      maxTurns,
      nearLimit: enabled && totalTurns >= Math.ceil(maxTurns * CHAT_CONTEXT_WARN_RATIO),
    }
  }

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

  const kept = rest.slice(startIdx)
  const keptTurns = countChatTurns(kept)
  return {
    messages: [...system, ...kept],
    truncated: true,
    droppedTurns: totalTurns - keptTurns,
    totalTurns,
    keptTurns,
    maxTurns,
    nearLimit: true,
  }
}
