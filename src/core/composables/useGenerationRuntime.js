import {onBeforeUnmount, shallowRef} from 'vue'

/**
 * 将 generationRuntime 单例接到 Vue 响应式。
 * @param {ReturnType<typeof import('@core/runtime/generationRuntime').createGenerationRuntime>} runtime
 */
export function useGenerationRuntime(runtime) {
  const tick = shallowRef(0)
  const unsubscribe = runtime.subscribe(() => {
    tick.value++
  })
  onBeforeUnmount(unsubscribe)

  return {
    /** 依赖 tick，确保 sessionId / busy 变化能触发 computed */
    get sessionId() {
      void tick.value
      return runtime.sessionId
    },
    get busy() {
      void tick.value
      return runtime.busy
    },
    isCurrent(activeId) {
      void tick.value
      return runtime.isCurrent(activeId)
    },
    begin: runtime.begin.bind(runtime),
    end: runtime.end.bind(runtime),
    abort: runtime.abort.bind(runtime),
    abortIfSession: runtime.abortIfSession.bind(runtime),
  }
}
