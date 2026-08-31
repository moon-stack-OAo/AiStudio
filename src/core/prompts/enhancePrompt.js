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

const MODE_HINTS = {
  img2video:
    '当前为图生视频：请基于参考图主体进行优化，不要推翻或替换主体，侧重镜头运动、动态与节奏描述。',
  img2img:
    '当前为图生图：请基于参考图主体进行优化，不要推翻或替换主体，侧重改动方向、风格与细节描述。',
}

function resolveSystemPrompt(domain, mode) {
  const base = domain === 'image' ? ENHANCE_SYSTEM_IMAGE : ENHANCE_SYSTEM_VIDEO
  const hint = MODE_HINTS[mode]
  return hint ? `${base}\n${hint}` : base
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
