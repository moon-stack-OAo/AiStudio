/**
 * 从 ClipboardData 中取出第一张图片文件。
 * @param {DataTransfer | null | undefined} clipboardData
 * @returns {File | null}
 */
export function getClipboardImageFile(clipboardData) {
  if (!clipboardData) return null
  const items = clipboardData.items
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }
  const files = clipboardData.files
  if (files?.length) {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      if (file && String(file.type || '').startsWith('image/')) return file
    }
  }
  return null
}

/**
 * 全局粘贴参考图：挂载时监听 paste，卸载时移除。
 * @param {(file: File) => void | Promise<void>} onImage
 * @param {{ onError?: () => void }} [options]
 * @returns {{ onPaste: (e: ClipboardEvent) => Promise<void> }}
 */
export function useClipboardImage(onImage, options = {}) {
  async function onPaste(e) {
    const file = getClipboardImageFile(e.clipboardData)
    if (!file) return
    e.preventDefault()
    try {
      await onImage(file)
    } catch {
      options.onError?.()
    }
  }

  return {onPaste}
}
