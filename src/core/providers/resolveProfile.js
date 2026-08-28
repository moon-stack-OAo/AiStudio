import {isAgnesProvider} from './profiles/agnes'

/**
 * 解析协议 Profile id。
 * Agnes 优先按 baseUrl / 模型名识别（含已落盘的 openai-compatible 自定义项）。
 * @returns {'openai' | 'xai' | 'agnes' | 'openai-compatible'}
 */
export function resolveProfile(provider) {
  if (isAgnesProvider(provider)) return 'agnes'
  const kind = String(provider?.provider || '')
  if (kind === 'xai') return 'xai'
  if (kind === 'openai') return 'openai'
  return 'openai-compatible'
}
