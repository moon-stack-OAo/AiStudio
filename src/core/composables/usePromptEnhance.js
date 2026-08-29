import {ref} from 'vue'
import {enhancePrompt} from '@core/prompts/enhancePrompt'
import {useSettingsStore} from '@core/stores/settings'

/**
 * 提示词 AI 优化：loading / abort / 错误上抛，不绑定 UI message。
 */
export function usePromptEnhance() {
  const settings = useSettingsStore()
  const enhancing = ref(false)
  let controller = null

  function abort() {
    if (controller) {
      controller.abort()
      controller = null
    }
    enhancing.value = false
  }

  /**
   * @param {string} text
   * @param {{ domain: 'video'|'image', mode?: string, signal?: AbortSignal }} options
   * @returns {Promise<string>}
   */
  async function enhance(text, options = {}) {
    if (enhancing.value) {
      throw new Error('正在优化中')
    }

    const {domain, mode, signal: outerSignal} = options
    controller = new AbortController()
    const onOuterAbort = () => controller?.abort()
    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort()
      } else {
        outerSignal.addEventListener('abort', onOuterAbort, {once: true})
      }
    }

    enhancing.value = true
    try {
      return await enhancePrompt(text, {
        domain,
        mode,
        provider: settings.activeProvider,
        temperature: settings.chatTemperature,
        timeout: settings.apiTimeoutMs,
        signal: controller.signal,
      })
    } finally {
      if (outerSignal) {
        outerSignal.removeEventListener('abort', onOuterAbort)
      }
      controller = null
      enhancing.value = false
    }
  }

  return {
    enhancing,
    enhance,
    abort,
  }
}
