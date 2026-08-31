import {chatCompletions} from '@core/api/client'

export const ENHANCE_SYSTEM_VIDEO = [
  '你是专业的视频生成提示词优化助手。',
  '在保留用户核心意图的前提下，补全并强化：主体、镜头运动、节奏、光影、氛围与画面细节。',
  '只输出优化后的提示词正文，不要解释、不要标题、不要前后缀、不要 markdown。',
].join('')

export const ENHANCE_SYSTEM_IMAGE = [
  '你是专业的图像生成提示词优化助手。',
  '在保留用户核心意图的前提下，补全并强化：构图、光影、材质、风格与画面细节。',
  '只输出优化后的提示词正文，不要解释、不要标题、不要前后缀、不要 markdown。',
].join('')

export const GENERATE_SYSTEM_VIDEO = [
  '你是专业的视频生成提示词创作助手。',
  '根据给定主题创作一条完整、可直接用于文生/图生视频的提示词。',
  '须包含：主体、镜头运动、节奏、光影、氛围与画面细节；每次创作应有差异，避免复述参考示例原文。',
  '只输出提示词正文，不要解释、不要标题、不要前后缀、不要 markdown。',
].join('')

export const GENERATE_SYSTEM_IMAGE = [
  '你是专业的图像生成提示词创作助手。',
  '根据给定主题创作一条完整、可直接用于文生/图生图的提示词。',
  '须包含：主体、构图、光影、材质、风格与画面细节；每次创作应有差异，避免复述参考示例原文。',
  '只输出提示词正文，不要解释、不要标题、不要前后缀、不要 markdown。',
].join('')

const MODE_HINTS = {
  img2video:
    '当前为图生视频：请基于参考图主体进行优化，不要推翻或替换主体，侧重镜头运动、动态与节奏描述。',
  img2img:
    '当前为图生图：请基于参考图主体进行优化，不要推翻或替换主体，侧重改动方向、风格与细节描述。',
}

const GENERATE_MODE_HINTS = {
  img2video:
    '当前为图生视频：不要推翻或替换参考图主体，侧重镜头运动、动态与节奏描述。',
  img2img:
    '当前为图生图：不要推翻或替换参考图主体，侧重改动方向、风格与细节描述。',
}

function resolveSystemPrompt(domain, mode) {
  const base = domain === 'image' ? ENHANCE_SYSTEM_IMAGE : ENHANCE_SYSTEM_VIDEO
  const hint = MODE_HINTS[mode]
  return hint ? `${base}\n${hint}` : base
}

function resolveGenerateSystemPrompt(domain, mode) {
  const base = domain === 'image' ? GENERATE_SYSTEM_IMAGE : GENERATE_SYSTEM_VIDEO
  const hint = GENERATE_MODE_HINTS[mode]
  return hint ? `${base}\n${hint}` : base
}

/**
 * @param {{ label?: string, prompt?: string, tags?: string[], mode?: string }} preset
 * @returns {string}
 */
export function buildGenerateUserContent(preset = {}) {
  const label = String(preset.label ?? '').trim()
  const reference = String(preset.prompt ?? '').trim()
  const tags = Array.isArray(preset.tags)
    ? preset.tags.map((t) => String(t || '').trim()).filter(Boolean)
    : []
  const mode = String(preset.mode ?? '').trim()

  const lines = []
  if (label) lines.push(`主题：${label}`)
  if (tags.length) lines.push(`标签：${tags.join('、')}`)
  if (mode) lines.push(`模式：${mode}`)
  if (reference) {
    lines.push('风格参考（请创作同系列新变体，勿照抄）：')
    lines.push(reference)
  }
  lines.push('请创作一条新的提示词。')
  return lines.join('\n')
}

/**
 * 剥离模型可能包上的引号或 markdown 代码块，返回纯提示词。
 * @param {string} raw
 * @returns {string}
 */
export function stripEnhancedPrompt(raw) {
  let text = String(raw ?? '').trim()
  if (!text) return ''

  const fence = text.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/u)
  if (fence) {
    text = fence[1].trim()
  }

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('“') && text.endsWith('”')) ||
    (text.startsWith('「') && text.endsWith('」'))
  ) {
    text = text.slice(1, -1).trim()
  }

  return text
}

/**
 * @param {string} text - 原始提示词
 * @param {object} options
 * @param {'video'|'image'} options.domain
 * @param {string} [options.mode] - txt2video/img2video/txt2img/img2img
 * @param {object} options.provider - activeProvider
 * @param {number} [options.temperature]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>} 优化后的提示词纯文本
 */
export async function enhancePrompt(text, options = {}) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    throw new Error('请先输入或填入提示词再优化')
  }

  const {domain, mode, provider, temperature, signal, timeout} = options
  if (!provider?.chatModel) {
    throw new Error('请先在设置中配置对话模型')
  }

  const system = resolveSystemPrompt(domain === 'image' ? 'image' : 'video', mode)
  const userContent = mode && MODE_HINTS[mode] ? `${trimmed}\n\n（模式：${mode}）` : trimmed

  const data = await chatCompletions(provider, {
    messages: [
      {role: 'system', content: system},
      {role: 'user', content: userContent},
    ],
    stream: false,
    signal,
    temperature,
    // 提示词优化无需长文，限制输出降低挂起与超时概率
    max_tokens: 2048,
    timeout,
  })

  const content = stripEnhancedPrompt(data?.choices?.[0]?.message?.content)
  if (!content) {
    throw new Error('优化结果为空，请重试')
  }
  return content
}

/**
 * 按预设 label（及可选参考 prompt）用对话模型现生成一条提示词。
 * @param {{ id?: string, label?: string, prompt?: string, tags?: string[], mode?: string }} preset
 * @param {object} options
 * @param {'video'|'image'} options.domain
 * @param {string} [options.mode]
 * @param {object} options.provider
 * @param {number} [options.temperature]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeout]
 * @returns {Promise<string>}
 */
export async function generatePromptFromLabel(preset, options = {}) {
  const label = String(preset?.label ?? '').trim()
  if (!label) {
    throw new Error('缺少主题标签')
  }

  const {domain, mode, provider, temperature, signal, timeout} = options
  if (!provider?.chatModel) {
    throw new Error('请先在设置中配置对话模型')
  }

  const resolvedMode = mode || preset?.mode || ''
  const system = resolveGenerateSystemPrompt(
    domain === 'image' ? 'image' : 'video',
    resolvedMode,
  )
  const userContent = buildGenerateUserContent({
    label,
    prompt: preset?.prompt,
    tags: preset?.tags,
    mode: resolvedMode,
  })

  const data = await chatCompletions(provider, {
    messages: [
      {role: 'system', content: system},
      {role: 'user', content: userContent},
    ],
    stream: false,
    signal,
    temperature,
    max_tokens: 2048,
    timeout,
  })

  const content = stripEnhancedPrompt(data?.choices?.[0]?.message?.content)
  if (!content) {
    throw new Error('生成结果为空，请重试')
  }
  return content
}
