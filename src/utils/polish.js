import {chatCompletions} from '@/api/client'

const CHAT_STYLES = {
  clear: '语气更清晰、条理分明。',
  formal: '语气更正式、书面化。',
  casual: '语气更口语、自然亲切。',
}

const IMAGE_STYLES = {
  detail: '增强细节与质感描述。',
  artistic: '更偏艺术、氛围与风格化表达。',
  realistic: '更写实、摄影感与光影真实。',
}

function buildSystemPrompt(mode, style) {
  if (mode === 'image') {
    const hint = IMAGE_STYLES[style] || IMAGE_STYLES.detail
    return [
      '你是文生图提示词优化助手。请把用户描述扩写为更适合图像生成的高质量 prompt，包含主体、场景、风格、光影、构图与关键细节。',
      hint,
      '不要解释，只输出优化后的 prompt。',
    ].join('')
  }

  const hint = CHAT_STYLES[style] || CHAT_STYLES.clear
  return [
    '你是写作润色助手。请优化用户输入，使其更清晰、准确、易读。保留原意，不要添加解释或前后缀，只输出润色后的正文。',
    hint,
  ].join('')
}

function extractContent(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return ''
  return content.trim()
}

/**
 * @param {object} provider
 * @param {{ text: string, mode?: 'chat'|'image', style?: string, signal?: AbortSignal }} options
 * @returns {Promise<string>}
 */
export async function polishText(provider, {text, mode = 'chat', style, signal} = {}) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('请输入需要润色的内容')

  const data = await chatCompletions(provider, {
    messages: [
      {role: 'system', content: buildSystemPrompt(mode, style)},
      {role: 'user', content: trimmed},
    ],
    stream: false,
    signal,
  })

  const result = extractContent(data)
  if (!result) throw new Error('润色结果为空')
  return result
}

export const chatStyleOptions = [
  {label: '更清晰', value: 'clear'},
  {label: '更正式', value: 'formal'},
  {label: '更口语', value: 'casual'},
]

export const imageStyleOptions = [
  {label: '增强细节', value: 'detail'},
  {label: '更艺术', value: 'artistic'},
  {label: '更写实', value: 'realistic'},
]
