const VIDEO_HINTS = [
  'video',
  'sora',
  'veo',
  'imagine-video',
  'seedance',
  'kling',
  'runway',
  'luma',
  'hailuo',
  'minimax-video',
]

const IMAGE_HINTS = [
  'dall-e',
  'gpt-image',
  'imagen',
  'image',
  'flux',
  'midjourney',
  'stable-diffusion',
  'sdxl',
  'grok-imagine',
  'banana',
]

const CHAT_EXCLUDE = [
  'embedding',
  'whisper',
  'tts',
  'transcribe',
  'moderation',
  'realtime',
  'video',
  'sora',
]

function includesAny(id, keywords) {
  return keywords.some((k) => id.includes(k))
}

/**
 * 粗分对话 / 生图 / 视频模型（中转站命名不一，仅作 UI 筛选提示）
 */
export function classifyModelId(modelId) {
  const id = String(modelId || '').toLowerCase()
  if (!id) return 'other'
  if (includesAny(id, VIDEO_HINTS)) return 'video'
  if (includesAny(id, IMAGE_HINTS)) return 'image'
  if (includesAny(id, CHAT_EXCLUDE)) return 'other'
  return 'chat'
}

export function filterModelsByKind(models, kind) {
  const list = Array.isArray(models) ? models : []
  if (kind === 'all') return list
  return list.filter((m) => classifyModelId(m.id || m) === kind)
}

export function toSelectOptions(models, {current, fallbackLabel} = {}) {
  const map = new Map()
  for (const item of models || []) {
    const id = typeof item === 'string' ? item : item?.id
    if (!id) continue
    map.set(id, {label: id, value: id})
  }
  if (current && !map.has(current)) {
    map.set(current, {
      label: fallbackLabel || `${current}（手动）`,
      value: current,
    })
  }
  return Array.from(map.values())
}
