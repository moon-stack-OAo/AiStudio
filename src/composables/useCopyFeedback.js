import {onBeforeUnmount, ref} from 'vue'

/**
 * 复制反馈：copiedId + copyText(id, text)，约 1.6s 后复位。
 * @returns {{ copiedId: import('vue').Ref<string>, copyText: (id: string, text: string) => Promise<boolean> }}
 */
export function useCopyFeedback() {
  const copiedId = ref('')
  let timer = null

  async function copyText(id, text) {
    const value = String(text || '').trim()
    if (!value || !id) return false
    try {
      await navigator.clipboard.writeText(value)
      copiedId.value = id
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (copiedId.value === id) copiedId.value = ''
      }, 1600)
      return true
    } catch {
      return false
    }
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { copiedId, copyText }
}
