/**
 * 参考图上传前压缩，降低图生视频 / 图生图 HTTP 413 概率。
 * @param {File|Blob} file
 * @param {{ maxEdge?: number, quality?: number, skipBelowBytes?: number, mimeType?: string }} [options]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, options = {}) {
  if (!file) throw new Error('缺少图片文件')
  const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : 1280
  const quality =
    typeof options.quality === 'number' && options.quality > 0 && options.quality <= 1
      ? options.quality
      : 0.85
  const skipBelowBytes =
    typeof options.skipBelowBytes === 'number' ? options.skipBelowBytes : 1024 * 1024
  const outMime = options.mimeType || 'image/jpeg'

  const asFile = (blob, nameHint) => {
    const baseName = String(nameHint || file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
    const ext = outMime === 'image/png' ? 'png' : outMime === 'image/webp' ? 'webp' : 'jpg'
    const fileName = `${baseName}.${ext}`
    try {
      return new File([blob], fileName, {
        type: blob.type || outMime,
        lastModified: Date.now(),
      })
    } catch {
      const fallback = blob
      fallback.name = fileName
      return fallback
    }
  }

  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    return file instanceof File ? file : asFile(file, file.name)
  }

  let bitmap
  let objectUrl = ''
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
    } else {
      objectUrl = URL.createObjectURL(file)
      bitmap = await loadImageElement(objectUrl)
    }
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const msg = err?.message || String(err)
    throw new Error(msg && msg !== 'undefined' ? `图片解码失败：${msg}` : '图片解码失败')
  }

  try {
    const srcW = bitmap.width || bitmap.naturalWidth || 0
    const srcH = bitmap.height || bitmap.naturalHeight || 0
    if (!srcW || !srcH) {
      return file instanceof File ? file : asFile(file, file.name)
    }

    const longest = Math.max(srcW, srcH)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    const needResize = scale < 1
    const sizeOk = typeof file.size === 'number' && file.size < skipBelowBytes
    if (!needResize && sizeOk && (file.type === outMime || file.type === 'image/jpeg')) {
      return file instanceof File ? file : asFile(file, file.name)
    }

    const dstW = Math.max(1, Math.round(srcW * scale))
    const dstH = Math.max(1, Math.round(srcH * scale))
    const canvas = document.createElement('canvas')
    canvas.width = dstW
    canvas.height = dstH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return file instanceof File ? file : asFile(file, file.name)
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)

    const blob = await canvasToBlob(canvas, outMime, quality)
    if (!blob || blob.size === 0) {
      return file instanceof File ? file : asFile(file, file.name)
    }
    if (typeof file.size === 'number' && blob.size >= file.size && !needResize) {
      return file instanceof File ? file : asFile(file, file.name)
    }
    return asFile(blob, file.name)
  } finally {
    if (typeof bitmap.close === 'function') {
      try {
        bitmap.close()
      } catch {
        // ignore
      }
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法加载图片'))
    img.src = src
  })
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('图片压缩失败'))
        },
        mimeType,
        quality,
      )
    } catch (err) {
      reject(err instanceof Error ? err : new Error('图片压缩失败'))
    }
  })
}
