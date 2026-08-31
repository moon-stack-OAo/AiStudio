/**
 * 生图缩略图：按比例 + 长边上限计算盒子尺寸。
 */

/**
 * @param {string|number|null|undefined} aspectRatio 如 '16:9'
 * @param {string|null|undefined} size 如 '1920x1080' / '2K'
 * @returns {number} width/height，失败时 1
 */
export function resolveImageAspectRatio(aspectRatio, size) {
  const ratioText = String(aspectRatio || '').trim()
  const rm = ratioText.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/)
  if (rm) {
    const w = Number(rm[1])
    const h = Number(rm[2])
    if (w > 0 && h > 0) return w / h
  }

  const sizeText = String(size || '').trim()
  const sm = sizeText.match(/^(\d+)\s*[x×]\s*(\d+)$/i)
  if (sm) {
    const w = Number(sm[1])
    const h = Number(sm[2])
    if (w > 0 && h > 0) return w / h
  }

  // 档位无比例时按正方形占位（实图 onload 后再校正）
  return 1
}

/**
 * @param {number} ratio width/height
 * @param {number} longEdge 长边像素上限
 * @returns {{ width: number, height: number }}
 */
export function resolveThumbBox(ratio, longEdge) {
  const edge = Math.max(48, Number(longEdge) || 148)
  const r = Number(ratio)
  const safe = Number.isFinite(r) && r > 0 ? r : 1
  if (safe >= 1) {
    return {
      width: Math.round(edge),
      height: Math.max(48, Math.round(edge / safe)),
    }
  }
  return {
    width: Math.max(48, Math.round(edge * safe)),
    height: Math.round(edge),
  }
}

/**
 * @param {{ aspectRatio?: string, size?: string }} item
 * @param {number} [naturalRatio]
 * @param {{ longEdge?: number }} [options]
 * @returns {{ width: string, height: string, maxWidth: string, aspectRatio?: string }}
 */
export function resolveThumbStyle(item, naturalRatio, options = {}) {
  const longEdge = options.longEdge ?? 148
  const ratio =
    Number.isFinite(naturalRatio) && naturalRatio > 0
      ? naturalRatio
      : resolveImageAspectRatio(item?.aspectRatio, item?.size)
  const box = resolveThumbBox(ratio, longEdge)
  return {
    width: `${box.width}px`,
    height: `${box.height}px`,
    maxWidth: '100%',
    aspectRatio: `${ratio}`,
  }
}
