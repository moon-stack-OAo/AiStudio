import {invoke} from '@tauri-apps/api/core'
import {isAndroidTauri} from '@core/utils/request'

function friendlyError(err, fallback = '保存到相册失败') {
  if (!err) return fallback
  if (typeof err === 'string' && err.trim()) return err
  const msg = err?.message || err?.toString?.()
  if (typeof msg === 'string' && msg.trim()) return msg
  return fallback
}

function isHttpUrl(src) {
  return typeof src === 'string' && /^https?:\/\//i.test(src.trim())
}

/**
 * 将 Blob 写入缓存并保存到系统相册
 * @param {Blob} blob
 * @param {string} displayName
 * @param {string} [mimeType]
 */
export async function saveBlobToAndroidGallery(blob, displayName, mimeType) {
  if (!isAndroidTauri()) {
    throw new Error('仅 Android 客户端支持保存到相册')
  }
  if (!blob) throw new Error('媒体数据为空')

  const name = String(displayName || 'media').trim() || 'media'
  const mime = String(mimeType || blob.type || '').trim()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const path = await invoke('android_write_media_to_cache', {
    bytes,
    fileName: name,
  })
  await invoke('android_save_media_to_gallery', {
    path,
    mimeType: mime || null,
    displayName: name,
  })
}

/**
 * 远程 http(s) 流式下载到缓存后写入相册（适合大视频）
 * @param {string} url
 * @param {string} displayName
 * @param {string} [mimeType]
 */
export async function saveRemoteUrlToAndroidGallery(url, displayName, mimeType) {
  if (!isAndroidTauri()) {
    throw new Error('仅 Android 客户端支持保存到相册')
  }
  if (!isHttpUrl(url)) {
    throw new Error('仅支持 http/https 远程地址')
  }

  const name = String(displayName || 'media').trim() || 'media'
  const mime = String(mimeType || '').trim()
  const path = await invoke('android_download_media_to_cache', {
    url: String(url).trim(),
    fileName: name,
  })
  await invoke('android_save_media_to_gallery', {
    path,
    mimeType: mime || null,
    displayName: name,
  })
}

/**
 * Android 优先保存到相册；失败返回 false（由调用方兜底）
 * @param {{
 *   src?: string,
 *   blob?: Blob | null,
 *   displayName: string,
 *   mimeType?: string,
 *   preferRemote?: boolean,
 * }} opts
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function trySaveToAndroidGallery(opts) {
  if (!isAndroidTauri()) {
    return {ok: false, error: '非 Android Tauri'}
  }

  const name = opts?.displayName || 'media'
  const mime = opts?.mimeType || ''
  const src = opts?.src || ''
  const preferRemote = opts?.preferRemote !== false

  try {
    if (preferRemote && isHttpUrl(src)) {
      await saveRemoteUrlToAndroidGallery(src, name, mime)
      return {ok: true}
    }
    if (opts?.blob) {
      await saveBlobToAndroidGallery(opts.blob, name, mime || opts.blob.type)
      return {ok: true}
    }
    if (isHttpUrl(src)) {
      await saveRemoteUrlToAndroidGallery(src, name, mime)
      return {ok: true}
    }
    return {ok: false, error: '无可保存的媒体数据'}
  } catch (err) {
    return {ok: false, error: friendlyError(err)}
  }
}

export {isHttpUrl, friendlyError}
