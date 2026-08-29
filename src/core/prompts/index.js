export {VIDEO_PROMPT_PRESETS} from './videoPresets'
export {IMAGE_PROMPT_PRESETS} from './imagePresets'
export {VIDEO_DIMENSIONS} from './videoDimensions'
export {IMAGE_DIMENSIONS} from './imageDimensions'
export {getDimensions, buildPromptFromSelection} from './buildPrompt'
export {
  enhancePrompt,
  stripEnhancedPrompt,
  ENHANCE_SYSTEM_VIDEO,
  ENHANCE_SYSTEM_IMAGE,
} from './enhancePrompt'

import {VIDEO_PROMPT_PRESETS} from './videoPresets'
import {IMAGE_PROMPT_PRESETS} from './imagePresets'

function resolveList(domain) {
  if (domain === 'video') return VIDEO_PROMPT_PRESETS
  if (domain === 'image') return IMAGE_PROMPT_PRESETS
  return []
}

export function getPromptPresets(domain, mode) {
  const list = resolveList(domain)
  if (!mode) return list.slice()
  return list.filter((item) => item.mode === mode || item.mode == null)
}

export function pickRandomPromptPreset(domain, mode) {
  const list = getPromptPresets(domain, mode)
  if (!list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}

export function getPromptPlaceholder(domain, mode, {isMobile} = {}) {
  if (domain === 'video') {
    if (mode === 'img2video') {
      return isMobile
        ? '描述镜头运动…'
        : '描述镜头如何运动（推进/环绕/跟随…），Enter 生成，Shift+Enter 换行'
    }
    return isMobile
      ? '描述画面与镜头运动…'
      : '描述主体、镜头运动与氛围，Enter 生成，Shift+Enter 换行'
  }

  if (domain === 'image') {
    if (mode === 'img2img') {
      return isMobile
        ? '描述如何改动参考图…'
        : '描述要如何改动参考图（风格/背景/光影…），Enter 生成，Shift+Enter 换行'
    }
    return isMobile
      ? '描述画面…'
      : '描述主体、构图、光影与风格，Enter 生成，Shift+Enter 换行'
  }

  return isMobile ? '输入提示词…' : '输入提示词，Enter 生成，Shift+Enter 换行'
}
