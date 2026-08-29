import {resolveProfile} from './resolveProfile'
import {getAgnesCapabilities} from './profiles/agnes'
import {getOpenAiCapabilities} from './profiles/openai'
import {getOpenAiCompatibleCapabilities} from './profiles/openaiCompatible'
import {getXaiCapabilities} from './profiles/xai'

/**
 * 是否向生图接口附带 quality（自定义中转一律不传，避免队列拒参）
 * @param {object} provider
 * @returns {boolean}
 */
export function supportsImageQuality(provider) {
  // 自定义提供商（含 Agnes 等中转）一律不传
  if (!provider?.builtin) return false
  const kind = String(provider?.provider || '')
  if (kind === 'openai') return true
  if (kind === 'xai') {
    const model = String(provider?.imageModel || '').toLowerCase()
    return model.includes('imagine-image-2') || model.includes('2.0')
  }
  return false
}

/**
 * 返回当前 provider 的协议能力声明（供 UI / adapter 使用：尺寸、超时、轮询风格等）
 * @param {object} provider
 * @returns {{ id: string, chat: object, image: object, video: object }}
 */
export function getCapabilities(provider) {
  const profileId = resolveProfile(provider)
  switch (profileId) {
    case 'agnes':
      return getAgnesCapabilities(provider)
    case 'xai':
      return getXaiCapabilities(provider)
    case 'openai':
      return getOpenAiCapabilities()
    default:
      return getOpenAiCompatibleCapabilities()
  }
}
