import {IMAGE_TIMEOUT_MS} from '@core/utils/constants'

/** Agnes Video 2.5：size 档位 */
export const AGNES_VIDEO_SIZES = ['720P', '960P', '2K']

/** Agnes Image 2.1：推荐档位；2.0：精确 WxH */
export const AGNES_SIZE_TIERS = ['1k', '2k', '3k', '4k']
export const AGNES_LEGACY_SIZES = ['1024x1024', '1024x768', '768x1024']
export const AGNES_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9']

/** Agnes APIHub：特殊请求体（禁止顶层 response_format） */
export function isAgnesProvider(provider) {
  const base = String(provider?.baseUrl || '').toLowerCase()
  const imageModel = String(provider?.imageModel || '').toLowerCase()
  const videoModel = String(provider?.videoModel || '').toLowerCase()
  return (
    base.includes('agnes-ai.com') ||
    imageModel.includes('agnes-image') ||
    videoModel.includes('agnes-video') ||
    videoModel.includes('agnes-')
  )
}

/** Agnes Image 2.1+：档位 size + ratio；2.0 仅支持精确 WxH */
export function isAgnesImage21(provider) {
  const model = String(provider?.imageModel || '').toLowerCase()
  if (!model.includes('agnes-image')) return false
  // 2.1 / 更高版本用档位；未写版本号时按 2.1 处理（与当前文档主推一致）
  if (/agnes-image-2\.0/.test(model)) return false
  if (/agnes-image-2\.1/.test(model)) return true
  if (/agnes-image-[3-9]/.test(model)) return true
  return true
}

/** Flash 仅支持 720P */
export function isAgnesVideoFlash(provider) {
  return String(provider?.videoModel || '')
    .toLowerCase()
    .includes('flash')
}

export function normalizeAgnesVideoSize(size, provider) {
  if (isAgnesVideoFlash(provider)) return '720P'
  const raw = String(size || '').trim()
  if (!raw) return '720P'
  const upper = raw.toUpperCase()
  if (AGNES_VIDEO_SIZES.includes(upper)) return upper
  if (upper === '720' || upper === '720P') return '720P'
  if (upper === '960' || upper === '960P') return '960P'
  if (upper === '2K' || upper === '1080P' || upper === '1080') return '2K'
  // WxH：Agnes 档位按短边/档名，1280x720 对应 720P（勿误判为 960P）
  const m = raw.toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/)
  if (m) {
    const w = Number(m[1])
    const h = Number(m[2])
    const long = Math.max(w, h)
    if (long >= 1800) return '2K'
    if (long > 1280) return '960P'
    return '720P'
  }
  return '720P'
}

export function clampAgnesVideoSeconds(seconds, duration) {
  const n = Number(seconds ?? duration)
  if (!Number.isFinite(n)) return '5'
  const clamped = Math.min(12, Math.max(4, Math.round(n)))
  return String(clamped)
}

/** 2.0：映射为官方支持的精确尺寸 */
export function normalizeAgnesImageSize20(size) {
  const s = String(size || '').toLowerCase()
  if (AGNES_LEGACY_SIZES.includes(s)) return s
  if (AGNES_SIZE_TIERS.includes(s)) {
    if (s === '1k') return '1024x1024'
    return '1024x1024'
  }
  const m = s.match(/^(\d+)\s*x\s*(\d+)$/)
  if (!m) return '1024x1024'
  const w = Number(m[1])
  const h = Number(m[2])
  if (!w || !h) return '1024x1024'
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.08) return '1024x1024'
  if (ratio > 1) return '1024x768'
  return '768x1024'
}

/** 2.1+：优先档位 size（1K/2K/3K/4K），兼容历史 WxH */
export function normalizeAgnesImageSize(size) {
  const raw = String(size || '').trim()
  if (!raw) return '1K'
  const upper = raw.toUpperCase()
  if (AGNES_SIZE_TIERS.includes(upper.toLowerCase())) return upper
  const legacy = raw.toLowerCase()
  if (AGNES_LEGACY_SIZES.includes(legacy)) return legacy
  const m = legacy.match(/^(\d+)\s*x\s*(\d+)$/)
  if (!m) return '1K'
  const w = Number(m[1])
  const h = Number(m[2])
  if (!w || !h) return '1K'
  const long = Math.max(w, h)
  if (long >= 3500) return '4K'
  if (long >= 2500) return '3K'
  if (long >= 1500) return '2K'
  return '1K'
}

export function normalizeAgnesImageRatio(ratio) {
  const r = String(ratio || '').trim()
  if (AGNES_RATIOS.includes(r)) return r
  return '1:1'
}

export function buildAgnesImageSizeFields(provider, size, aspectRatio) {
  if (isAgnesImage21(provider)) {
    return {
      size: normalizeAgnesImageSize(size),
      ratio: normalizeAgnesImageRatio(aspectRatio),
    }
  }
  return {size: normalizeAgnesImageSize20(size)}
}

export function getAgnesCapabilities(provider) {
  const image21 = isAgnesImage21(provider)
  const videoFlash = isAgnesVideoFlash(provider)

  return {
    id: 'agnes',
    chat: {
      style: 'openai-compatible',
    },
    image: {
      sizeMode: image21 ? 'tier' : 'pixels',
      sizes: image21 ? ['1K', '2K', '3K', '4K'] : [...AGNES_LEGACY_SIZES],
      ratios: image21 ? [...AGNES_RATIOS] : undefined,
      supportsN: false,
      supportsQuality: false,
      preferResponseFormat: 'url',
      timeoutMs: IMAGE_TIMEOUT_MS,
      editVia: 'generations+extra_body',
      forbidTopLevelN: true,
      forbidTopLevelResponseFormat: true,
    },
    video: {
      // UI 仍选 WxH，API 层再映射到档位；此处 sizes 供 adapter 校验
      sizeMode: 'tier',
      sizes: videoFlash ? ['720P'] : [...AGNES_VIDEO_SIZES],
      durationMode: 'seconds',
      durationMin: 4,
      durationMax: 12,
      durationOptions: [4, 8, 12],
      durationDefault: 8,
      createPath: '/videos',
      pollStyle: 'agnesapi',
    },
  }
}
