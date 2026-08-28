import {nextTick} from 'vue'

/**
 * 列表滚动到底部（含软键盘弹起后的延迟再滚）。
 * @param {import('vue').Ref<HTMLElement | null>} listRef
 * @returns {{ scrollToBottom: () => void, scheduleScrollToBottom: () => void }}
 */
export function useScrollToBottom(listRef) {
  function scrollToBottom() {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  }

  function scheduleScrollToBottom() {
    nextTick(() => {
      scrollToBottom()
      // 软键盘弹起有动画，延迟再滚一次保证输入区可见
      window.setTimeout(scrollToBottom, 180)
      window.setTimeout(scrollToBottom, 360)
    })
  }

  return {scrollToBottom, scheduleScrollToBottom}
}
