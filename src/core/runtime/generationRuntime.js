/**
 * 跨页面/会话切换仍可继续的生成运行时（不持久化）。
 * AbortController 不放响应式，避免序列化与多余触发。
 */

function createGenerationRuntime() {
  const state = {
    sessionId: null,
  }
  let controller = null
  const listeners = new Set()

  function notify() {
    for (const fn of listeners) fn()
  }

  return {
    /** 供 Vue 外部订阅（View 里用 shallowRef + subscribe 触发更新） */
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    get sessionId() {
      return state.sessionId
    },
    get busy() {
      return Boolean(state.sessionId)
    },
    get controller() {
      return controller
    },
    isCurrent(activeId) {
      return Boolean(state.sessionId) && state.sessionId === activeId
    },
    /** 开始一路生成；会替换当前 controller 引用（调用方负责 abort 旧任务） */
    begin(sessionId, abortController) {
      state.sessionId = sessionId || null
      controller = abortController || null
      notify()
    },
    /** 仅当仍是同一会话时清理 */
    end(sessionId) {
      if (sessionId != null && state.sessionId !== sessionId) return
      state.sessionId = null
      controller = null
      notify()
    },
    abort() {
      controller?.abort()
    },
    /** 删除指定会话时：若正在生成该会话则 abort */
    abortIfSession(sessionId) {
      if (state.sessionId && state.sessionId === sessionId) {
        controller?.abort()
      }
    },
  }
}

export const chatGeneration = createGenerationRuntime()
export const imageGeneration = createGenerationRuntime()
export const videoGeneration = createGenerationRuntime()
