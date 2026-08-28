import {nextTick} from 'vue'

/**
 * 列表滚动到底部（含布局完成后再滚、软键盘弹起后的延迟再滚）。
 * @param {import('vue').Ref<HTMLElement | null>} listRef
 * @returns {{ scrollToBottom: () => void, scheduleScrollToBottom: () => void }}
 */
export function useScrollToBottom(listRef) {
  function scrollToBottom() {
    const el = listRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  function scheduleScrollToBottom() {
    nextTick(() => {
      scrollToBottom()
      requestAnimationFrame(() => {
        scrollToBottom()
        requestAnimationFrame(scrollToBottom)
      })
      // 图片/视频等内容异步撑高后补滚；软键盘弹起也靠这两次兜底
      window.setTimeout(scrollToBottom, 180)
      window.setTimeout(scrollToBottom, 360)
    })
  }

  return {scrollToBottom, scheduleScrollToBottom}
}
