import {save} from '@tauri-apps/plugin-dialog'
import {writeFile} from '@tauri-apps/plugin-fs'
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
 * 根据文件名 / MIME 生成另存为过滤器。
 * @param {string} fileName
 * @param {string} defaultMime
 * @returns {{ name: string, extensions: string[] }[]}
 */
function resolveSaveFilters(fileName, defaultMime) {
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  if (ext === 'mp4' || defaultMime.includes('video')) {
    return [{name: '视频', extensions: ['mp4']}]
  }
  if (ext === 'png' || defaultMime.includes('png')) {
    return [{name: '图片', extensions: ['png']}]
  }
  if (ext === 'jpg' || ext === 'jpeg' || defaultMime.includes('jpeg')) {
    return [{name: '图片', extensions: ['jpg', 'jpeg']}]
  }
  if (ext === 'webp' || defaultMime.includes('webp')) {
    return [{name: '图片', extensions: ['webp']}]
  }
  if (ext) return [{name: '文件', extensions: [ext]}]
  return []
}

/**
 * 按候选地址依次转为 Blob。
 * @param {string[]} sources
 * @returns {Promise<Blob>}
 */
async function srcToBlobFromSources(sources) {
  let lastError = null
  for (const src of sources) {
    if (!src) continue
    try {
      return await srcToBlob(src)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('资源不可用')
}

/**
 * 桌面端：系统另存为 + 写文件。
 * @param {string[]} sources
 * @param {string} fileName
 * @param {{ success: (msg: string) => void, warning: (msg: string) => void, error?: (msg: string) => void }} message
 * @param {string} defaultMime
 * @returns {Promise<boolean>} 是否已处理（含用户取消）
 */
async function saveWithDesktopDialog(sources, fileName, message, defaultMime) {
  const path = await save({
    title: '保存文件',
    defaultPath: fileName,
    filters: resolveSaveFilters(fileName, defaultMime),
  })
  if (!path) return true

  const blob = await srcToBlobFromSources(sources)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await writeFile(path, bytes)
  message.success('已保存')
  return true
}

/**
 * 下载媒体：桌面走系统另存为；其它端优先 blob 落盘，失败则直链 / 新窗口。
 * 图片可额外走 Web Share（非桌面 Tauri）。
 * @param {object} options
 * @param {string} options.src
 * @param {string} options.fileName
 * @param {{ success: (msg: string) => void, warning: (msg: string) => void, error?: (msg: string) => void }} options.message
 * @param {{ enableShare?: boolean, shareTitle?: string, defaultMime?: string, mobileOpenHint?: string, fallbackSrc?: string }} [options.opts]
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
    fallbackSrc = '',
  } = opts
  const sources = [src]
  if (fallbackSrc && fallbackSrc !== src) sources.push(fallbackSrc)

  if (isDesktopTauri()) {
    try {
      await saveWithDesktopDialog(sources, fileName, message, defaultMime)
      return
    } catch (err) {
      const text = err?.message || '保存失败'
      if (typeof message.error === 'function') message.error(text)
      else message.warning(text)
      return
    }
  }

  try {
    const blob = await srcToBlobFromSources(sources)

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
