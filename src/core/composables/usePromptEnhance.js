import {computed, onDeactivated, onUnmounted, ref, toValue} from 'vue'
import {enhancePrompt, generatePromptFromLabel} from '@core/prompts/enhancePrompt'
import {useSettingsStore} from '@core/stores/settings'
import {API_TIMEOUT_MS} from '@core/utils/constants'

// 共享状态：跨断点布局切换/组件重建时请求不中断，按 stateKey（会话）隔离；条目常驻，量极小不清理
const sharedStates = new Map()

function createEntry() {
  return {
    enhancing: ref(false),
    /** @type {AbortController | null} */
    controller: null,
    /** @type {((outcome: {ok: false, error: Error}) => void) | null} */
    settleGate: null,
    /** @type {'enhance'|'generate'} */
    activeKind: 'enhance',
  }
}

function toAbortError() {
  const err = new Error('已取消')
  err.name = 'AbortError'
  return err
}

function toTimeoutError(kind = 'enhance') {
  const err = new Error(kind === 'generate' ? '生成超时，请稍后重试' : '优化超时，请稍后重试')
  err.name = 'TimeoutError'
  return err
}

/** 把 axios/拦截器的超时文案统一 */
function normalizeEnhanceError(error, kind = 'enhance') {
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
 * 提示词 AI 优化 / 按 label 生成：loading / abort / 硬超时，错误上抛，不绑定 UI message。
 * 桌面端 axios+Tauri fetch 偶发不兑现 timeout/abort，故用竞态兜底，避免 enhancing 永久卡住。
 * @param {undefined | string | import('vue').Ref<string> | (() => string)} [stateKeySource]
 *   传入时状态提升为按 key 共享：组件卸载/停用不中止请求，重建后延续同一状态；
 *   未传时保持组件局部状态，卸载/停用即 abort（原语义）。
 */
export function usePromptEnhance(stateKeySource) {
  const settings = useSettingsStore()
  const sharedKey = computed(() => {
    if (stateKeySource == null) return ''
    return String(toValue(stateKeySource) ?? '')
  })
  // 组件局部条目：无 key 时使用
  const localEntry = createEntry()

  /** 取当前操作条目：key 变化即切换，未命中则创建并常驻共享 Map */
  function currentEntry() {
    const key = sharedKey.value
    if (!key) return localEntry
    let entry = sharedStates.get(key)
    if (!entry) {
      entry = createEntry()
      sharedStates.set(key, entry)
    }
    return entry
  }

  /** 中止指定条目上的在途请求并复位 enhancing */
  function settleEntry(entry, reason = 'cancel') {
    const c = entry.controller
    const settle = entry.settleGate
    const kind = entry.activeKind
    entry.controller = null
    entry.settleGate = null
    entry.enhancing.value = false
    c?.abort()
    if (settle) {
      settle({
        ok: false,
        error: reason === 'timeout' ? toTimeoutError(kind) : toAbortError(),
      })
    }
  }

  /**
   * @param {'cancel'|'timeout'} [reason]
   */
  function abort(reason = 'cancel') {
    settleEntry(currentEntry(), reason)
  }

  if (stateKeySource == null) {
    onUnmounted(() => abort())
    // keep-alive 切页走 deactivate，不会 unmount
    onDeactivated(() => abort())
  }

  /**
   * @param {'enhance'|'generate'} kind
   * @param {(ctx: { signal: AbortSignal, timeoutMs: number, provider: object, temperature: number }) => Promise<string>} run
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<string>}
   */
  async function runWithGate(kind, run, options = {}) {
    // 发起时捕获条目引用：key 中途变化时收尾仍作用于发起时的条目
    const entry = currentEntry()
    if (entry.enhancing.value) {
      throw new Error(kind === 'generate' ? '正在生成中' : '正在优化中')
    }

    const {signal: outerSignal} = options
    const localController = new AbortController()
    entry.controller = localController
    entry.activeKind = kind

    const onOuterAbort = () => settleEntry(entry)
    if (outerSignal) {
      if (outerSignal.aborted) {
        settleEntry(entry)
        throw toAbortError()
      }
      outerSignal.addEventListener('abort', onOuterAbort, {once: true})
    }

    const timeoutRaw = Number(settings.apiTimeoutMs)
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : API_TIMEOUT_MS

    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null
    const gate = new Promise((resolve) => {
      entry.settleGate = resolve
      timer = setTimeout(() => settleEntry(entry, 'timeout'), timeoutMs)
    })

    entry.enhancing.value = true
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
      const settle = entry.settleGate
      entry.settleGate = null
      // 主请求已胜出时收尾 gate，避免悬挂 Promise
      settle?.({ok: false, error: toAbortError()})
      if (entry.controller === localController) {
        entry.controller = null
        entry.enhancing.value = false
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

  const enhancing = computed(() => currentEntry().enhancing.value)

  return {
    enhancing,
    enhance,
    generateFromLabel,
    abort,
  }
}
