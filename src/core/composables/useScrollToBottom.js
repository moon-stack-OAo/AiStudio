import {nextTick, onBeforeUnmount, watch} from 'vue'

/**
 * 列表滚动到底部。
 * - force：切页/切会话/主动发送，强制贴底并延迟补滚
 * - 普通跟随：仅 stickToBottom 时跟随
 * - 优先 scrollIntoView(bottomRef)；无锚点时回退 scrollTop
 * @param {import('vue').Ref<HTMLElement | null>} listRef
 * @param {{ threshold?: number, bottomRef?: import('vue').Ref<HTMLElement | null> }} [options]
 */
export function useScrollToBottom(listRef, options = {}) {
  const threshold = options.threshold ?? 120
  const bottomRef = options.bottomRef || null
  let stickToBottom = true
  let listening = false
  /** 程序化滚动期间忽略 scroll（不放入可取消队列，避免被 cancel 泄漏） */
  let ignoreScrollUntil = 0
  /** @type {number[]} */
  let timers = []
  /** @type {number[]} */
  let rafs = []
  /** @type {ResizeObserver | null} */
  let resizeObserver = null
  /** @type {MutationObserver | null} */
  let mutationObserver = null

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  function isIgnoringScroll() {
    return now() < ignoreScrollUntil
  }

  function markProgrammaticScroll(ms = 120) {
    ignoreScrollUntil = Math.max(ignoreScrollUntil, now() + ms)
  }

  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  function onScroll() {
    if (isIgnoringScroll()) return
    const el = listRef.value
    if (!el) return
    stickToBottom = isNearBottom(el)
    if (!stickToBottom) cancelPendingScroll()
  }

  function bindScroll() {
    const el = listRef.value
    if (!el || listening) return
    el.addEventListener('scroll', onScroll, {passive: true})
    listening = true
    stickToBottom = isNearBottom(el)
    observeContent(el)
  }

  function unbindScroll() {
    const el = listRef.value
    if (el && listening) el.removeEventListener('scroll', onScroll)
    listening = false
    disconnectObservers()
  }

  function disconnectObservers() {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (mutationObserver) {
      mutationObserver.disconnect()
      mutationObserver = null
    }
  }

  function observeNode(node) {
    if (!resizeObserver || !node || node.nodeType !== 1) return
    resizeObserver.observe(node)
  }

  function observeContent(el) {
    if (typeof ResizeObserver === 'undefined') return
    disconnectObservers()
    resizeObserver = new ResizeObserver(() => {
      if (!stickToBottom) return
      // 内容撑高时静默跟随（流式 Markdown / 图片 / 时间线条目）
      scrollToBottom(false)
    })
    observeNode(el)
    const anchor = bottomRef?.value
    if (anchor) observeNode(anchor)
    for (const child of el.children) observeNode(child)

    if (typeof MutationObserver === 'undefined') return
    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) observeNode(node)
      }
      if (stickToBottom) scrollToBottom(false)
    })
    mutationObserver.observe(el, {childList: true})
  }

  function cancelPendingScroll() {
    for (const id of timers) clearTimeout(id)
    for (const id of rafs) cancelAnimationFrame(id)
    timers = []
    rafs = []
  }

  function applyScroll(el) {
    markProgrammaticScroll()
    const anchor = bottomRef?.value
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      try {
        anchor.scrollIntoView({block: 'end', inline: 'nearest'})
      } catch {
        el.scrollTop = el.scrollHeight
      }
    } else {
      el.scrollTop = el.scrollHeight
    }
    // 再写一次兜底（部分 WebView 首帧 scrollHeight 偏小）
    el.scrollTop = el.scrollHeight
    stickToBottom = true
  }

  function scrollToBottom(force = false) {
    bindScroll()
    const el = listRef.value
    if (!el) return
    if (!force && !stickToBottom) return
    applyScroll(el)
  }

  function scheduleScrollToBottom(opts = {}) {
    const force = Boolean(opts?.force)
    if (force) stickToBottom = true
    if (!force && !stickToBottom) return
    cancelPendingScroll()
    nextTick(() => {
      scrollToBottom(force)
      const r1 = requestAnimationFrame(() => {
        scrollToBottom(force)
        const r2 = requestAnimationFrame(() => scrollToBottom(force))
        rafs.push(r2)
      })
      rafs.push(r1)
      if (force) {
        timers.push(window.setTimeout(() => scrollToBottom(true), 80))
        timers.push(window.setTimeout(() => scrollToBottom(true), 200))
        timers.push(window.setTimeout(() => scrollToBottom(true), 400))
      } else {
        timers.push(window.setTimeout(() => scrollToBottom(false), 50))
        timers.push(window.setTimeout(() => scrollToBottom(false), 150))
      }
    })
  }

  watch(
    listRef,
    (el, prev) => {
      if (prev && listening) {
        prev.removeEventListener('scroll', onScroll)
        listening = false
      }
      disconnectObservers()
      if (el) bindScroll()
    },
    {flush: 'post'},
  )

  if (bottomRef) {
    watch(
      bottomRef,
      () => {
        const el = listRef.value
        if (el) observeContent(el)
      },
      {flush: 'post'},
    )
  }

  onBeforeUnmount(() => {
    cancelPendingScroll()
    unbindScroll()
  })

  return {scrollToBottom, scheduleScrollToBottom, cancelPendingScroll}
}
