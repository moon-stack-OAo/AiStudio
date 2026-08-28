import {nextTick, onBeforeUnmount, watch} from 'vue'

/**
 * 列表滚动到底部。
 * 普通跟随不使用延迟定时器；仅 force（切页/切会话）时补延迟重试，避免媒体未撑高滚不到底。
 * @param {import('vue').Ref<HTMLElement | null>} listRef
 * @param {{ threshold?: number }} [options]
 * @returns {{
 *   scrollToBottom: (force?: boolean) => void,
 *   scheduleScrollToBottom: (options?: { force?: boolean }) => void,
 *   cancelPendingScroll: () => void,
 * }}
 */
export function useScrollToBottom(listRef, options = {}) {
  const threshold = options.threshold ?? 96
  let stickToBottom = true
  let listening = false
  /** @type {number[]} */
  let timers = []
  /** @type {number[]} */
  let rafs = []

  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  function onScroll() {
    const el = listRef.value
    if (!el) return
    stickToBottom = isNearBottom(el)
    // 用户上滑后取消待执行的强制补滚，避免又被拽回
    if (!stickToBottom) cancelPendingScroll()
  }

  function bindScroll() {
    const el = listRef.value
    if (!el || listening) return
    el.addEventListener('scroll', onScroll, {passive: true})
    listening = true
    stickToBottom = isNearBottom(el)
  }

  function unbindScroll() {
    const el = listRef.value
    if (el && listening) el.removeEventListener('scroll', onScroll)
    listening = false
  }

  function cancelPendingScroll() {
    for (const id of timers) clearTimeout(id)
    for (const id of rafs) cancelAnimationFrame(id)
    timers = []
    rafs = []
  }

  function scrollToBottom(force = false) {
    bindScroll()
    const el = listRef.value
    if (!el) return
    if (!force && !stickToBottom) return
    el.scrollTop = el.scrollHeight
    // 部分 WebView 首帧 scrollHeight 偏小，再写一次兜底
    el.scrollTop = el.scrollHeight
    stickToBottom = true
  }

  function scheduleScrollToBottom(opts = {}) {
    const force = Boolean(opts?.force)
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
      // 仅切页/切会话：等图片/视频布局完成后再补滚
      if (force) {
        timers.push(window.setTimeout(() => scrollToBottom(true), 120))
        timers.push(window.setTimeout(() => scrollToBottom(true), 320))
        timers.push(window.setTimeout(() => scrollToBottom(true), 600))
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
      if (el) bindScroll()
    },
    {flush: 'post'},
  )

  onBeforeUnmount(() => {
    cancelPendingScroll()
    unbindScroll()
  })

  return {scrollToBottom, scheduleScrollToBottom, cancelPendingScroll}
}
