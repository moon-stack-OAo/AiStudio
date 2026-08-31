import {onUnmounted, ref} from 'vue'
import {enhancePrompt} from '@core/prompts/enhancePrompt'
import {useSettingsStore} from '@core/stores/settings'
import {API_TIMEOUT_MS} from '@core/utils/constants'

/**
 * 提示词 AI 优化：loading / abort / 硬超时，错误上抛，不绑定 UI message。
 * 桌面端 axios+Tauri fetch 偶发不兑现 timeout/abort，故用竞态兜底，避免 enhancing 永久卡住。
 */
export function usePromptEnhance() {
  const settings = useSettingsStore()
  const enhancing = ref(false)
  /** @type {AbortController | null} */
  let controller = null
  /** @type {((outcome: {ok: false, error: Error}) => void) | null} */
  let settleGate = null

  function toAbortError() {
    const err = new Error('已取消')
    err.name = 'AbortError'
    return err
  }

  function toTimeoutError() {
    const err = new Error('优化超时，请稍后重试')
    err.name = 'TimeoutError'
    return err
  }

  /**
   * @param {'cancel'|'timeout'} [reason]
   */
  function abort(reason = 'cancel') {
    const c = controller
    const settle = settleGate
    controller = null
    settleGate = null
    enhancing.value = false
    c?.abort()
    if (settle) {
      settle({
        ok: false,
        error: reason === 'timeout' ? toTimeoutError() : toAbortError(),
      })
    }
  }

  onUnmounted(() => abort())

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
    const localController = new AbortController()
    controller = localController

    const onOuterAbort = () => abort()
    if (outerSignal) {
      if (outerSignal.aborted) {
        abort()
        throw toAbortError()
      }
      outerSignal.addEventListener('abort', onOuterAbort, {once: true})
    }

    const timeoutRaw = Number(settings.apiTimeoutMs)
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : API_TIMEOUT_MS

    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null
    const gate = new Promise((resolve) => {
      settleGate = resolve
      timer = setTimeout(() => abort('timeout'), timeoutMs)
    })

    enhancing.value = true
    const primary = enhancePrompt(text, {
      domain,
      mode,
      provider: settings.activeProvider,
      temperature: settings.chatTemperature,
      timeout: timeoutMs,
      signal: localController.signal,
    }).then(
      (value) => ({ok: true, value}),
      (error) => ({ok: false, error}),
    )

    try {
      const outcome = await Promise.race([primary, gate])
      // 竞态输家若仍 pending/reject，吞掉避免泄漏与 unhandledrejection
      primary.catch(() => {})
      if (!outcome.ok) throw outcome.error
      return outcome.value
    } finally {
      if (timer != null) clearTimeout(timer)
      if (outerSignal) {
        outerSignal.removeEventListener('abort', onOuterAbort)
      }
      const settle = settleGate
      settleGate = null
      // 主请求已胜出时收尾 gate，避免悬挂 Promise
      settle?.({ok: false, error: toAbortError()})
      if (controller === localController) {
        controller = null
        enhancing.value = false
      }
    }
  }

  return {
    enhancing,
    enhance,
    abort,
  }
}
