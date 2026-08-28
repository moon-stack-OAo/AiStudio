import {appFetch} from '@core/utils/http'
import {isDesktopTauri} from '@core/utils/request'

/**
 * 将图片/视频 src（blob / data / http）转为 Blob。
 * @param {string} src
 * @returns {Promise<Blob>}
 */
export async function srcToBlob(src) {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }
  const res = await appFetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

/**
 * 触发 `<a download>` 下载。
 * @param {string} href
 * @param {string} name
 */
export function triggerAnchorDownload(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  a.click()
}

/**
 * 下载媒体：优先 blob 落盘，失败则直链 / 新窗口。
 * 图片可额外走 Web Share（非桌面 Tauri）。
 * @param {object} options
 * @param {string} options.src
 * @param {string} options.fileName
 * @param {{ success: (msg: string) => void, warning: (msg: string) => void }} options.message
 * @param {{ enableShare?: boolean, shareTitle?: string, defaultMime?: string, mobileOpenHint?: string }} [options.opts]
 */
export async function downloadMediaBlob({src, fileName, message, opts = {}}) {
  if (!src) {
    message.warning('资源不可用')
    return
  }

  const mobileLike = !isDesktopTauri()
  const {
    enableShare = false,
    shareTitle = fileName,
    defaultMime = 'application/octet-stream',
    mobileOpenHint = '请长按保存到相册',
  } = opts

  try {
    const blob = await srcToBlob(src)

    if (
      enableShare &&
      mobileLike &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function'
    ) {
      try {
        const file = new File([blob], fileName, {type: blob.type || defaultMime})
        if (navigator.canShare({files: [file]})) {
          await navigator.share({files: [file], title: shareTitle})
          message.success('已分享图片')
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerAnchorDownload(objectUrl, fileName)
      if (mobileLike) message.success('已开始下载')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    } catch {
      window.open(objectUrl, '_blank', 'noopener')
      message.warning(mobileLike ? mobileOpenHint : '下载失败，已尝试在新窗口打开')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
  } catch {
    try {
      triggerAnchorDownload(src, fileName)
      if (mobileLike) message.success('已开始下载')
    } catch {
      window.open(src, '_blank', 'noopener')
      message.warning(mobileLike ? mobileOpenHint : '下载失败，已尝试在新窗口打开')
    }
  }
}
