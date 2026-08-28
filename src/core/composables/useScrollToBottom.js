import {nextTick, onBeforeUnmount, watch} from 'vue'

/**
 * 列表滚动到底部。
 * 默认不做延迟定时器强拉；`schedule` 仅 nextTick + rAF 等待布局后再滚一次。
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
  let rafs = []

  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  function onScroll() {
    const el = listRef.value
    if (!el) return
    stickToBottom = isNearBottom(el)
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
    for (const id of rafs) cancelAnimationFrame(id)
    rafs = []
  }

  function scrollToBottom(force = false) {
    bindScroll()
    const el = listRef.value
    if (!el) return
    if (!force && !stickToBottom) return
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
      })
      rafs.push(r1)
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
