import {onDeactivated, onUnmounted, ref} from 'vue'
import {enhancePrompt, generatePromptFromLabel} from '@core/prompts/enhancePrompt'
import {useSettingsStore} from '@core/stores/settings'
import {API_TIMEOUT_MS} from '@core/utils/constants'

/**
 * 提示词 AI 优化 / 按 label 生成：loading / abort / 硬超时，错误上抛，不绑定 UI message。
 * 桌面端 axios+Tauri fetch 偶发不兑现 timeout/abort，故用竞态兜底，避免 enhancing 永久卡住。
 */
export function usePromptEnhance() {
  const settings = useSettingsStore()
  const enhancing = ref(false)
  /** @type {AbortController | null} */
  let controller = null
  /** @type {((outcome: {ok: false, error: Error}) => void) | null} */
  let settleGate = null
  /** @type {'enhance'|'generate'} */
  let activeKind = 'enhance'

  function toAbortError() {
    const err = new Error('已取消')
    err.name = 'AbortError'
    return err
  }

  function toTimeoutError(kind = activeKind) {
    const err = new Error(kind === 'generate' ? '生成超时，请稍后重试' : '优化超时，请稍后重试')
    err.name = 'TimeoutError'
    return err
  }

  /** 把 axios/拦截器的超时文案统一 */
  function normalizeEnhanceError(error, kind = activeKind) {
    if (!error) return toTimeoutError(kind)
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return error
    const code = String(error.code || error?.cause?.code || '')
    const msg = String(error.message || '')
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout|超时/i.test(msg)) {
      return toTimeoutError(kind)
    }
    return error
  }

  /**
   * @param {'cancel'|'timeout'} [reason]
   */
  function abort(reason = 'cancel') {
    const c = controller
    const settle = settleGate
    const kind = activeKind
    controller = null
    settleGate = null
    enhancing.value = false
    c?.abort()
    if (settle) {
      settle({
        ok: false,
        error: reason === 'timeout' ? toTimeoutError(kind) : toAbortError(),
      })
    }
  }

  onUnmounted(() => abort())
  // keep-alive 切页走 deactivate，不会 unmount
  onDeactivated(() => abort())

  /**
   * @param {'enhance'|'generate'} kind
   * @param {(ctx: { signal: AbortSignal, timeoutMs: number, provider: object, temperature: number }) => Promise<string>} run
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<string>}
   */
  async function runWithGate(kind, run, options = {}) {
    if (enhancing.value) {
      throw new Error(kind === 'generate' ? '正在生成中' : '正在优化中')
    }

    const {signal: outerSignal} = options
    const localController = new AbortController()
    controller = localController
    activeKind = kind

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
    const primary = Promise.resolve()
      .then(() =>
        run({
          signal: localController.signal,
          timeoutMs,
          provider: settings.activeProvider,
          temperature: settings.chatTemperature,
        }),
      )
      .then(
        (value) => ({ok: true, value}),
        (error) => ({ok: false, error: normalizeEnhanceError(error, kind)}),
      )

    try {
      const outcome = await Promise.race([primary, gate])
      // 竞态输家若仍 pending/reject，吞掉避免泄漏与 unhandledrejection
      primary.catch(() => {})
      if (!outcome.ok) throw normalizeEnhanceError(outcome.error, kind)
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

  /**
   * @param {string} text
   * @param {{ domain: 'video'|'image', mode?: string, signal?: AbortSignal }} options
   * @returns {Promise<string>}
   */
  async function enhance(text, options = {}) {
    const {domain, mode, signal} = options
    return runWithGate(
      'enhance',
      ({signal: localSignal, timeoutMs, provider, temperature}) =>
        enhancePrompt(text, {
          domain,
          mode,
          provider,
          temperature,
          timeout: timeoutMs,
          signal: localSignal,
        }),
      {signal},
    )
  }

  /**
   * @param {{ id?: string, label?: string, prompt?: string, tags?: string[], mode?: string }} preset
   * @param {{ domain: 'video'|'image', mode?: string, signal?: AbortSignal }} options
   * @returns {Promise<string>}
   */
  async function generateFromLabel(preset, options = {}) {
    const {domain, mode, signal} = options
    return runWithGate(
      'generate',
      ({signal: localSignal, timeoutMs, provider, temperature}) =>
        generatePromptFromLabel(preset, {
          domain,
          mode,
          provider,
          temperature,
          timeout: timeoutMs,
          signal: localSignal,
        }),
      {signal},
    )
  }

  return {
    enhancing,
    enhance,
    generateFromLabel,
    abort,
  }
}
