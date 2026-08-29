/**
 * Barrel：协议 profile 解析 + 能力声明 + Agnes 辅助导出。
 * 业务侧优先从此入口引用，避免散落 import profiles/*。
 */
export {resolveProfile} from './resolveProfile'
export {getCapabilities, supportsImageQuality} from './capabilities'

export {
  isAgnesProvider,
  isAgnesImage21,
  isAgnesVideoFlash,
  normalizeAgnesVideoSize,
  normalizeAgnesImageSize20,
  normalizeAgnesImageSize,
  normalizeAgnesImageRatio,
  buildAgnesImageSizeFields,
  clampAgnesVideoSeconds,
  AGNES_VIDEO_SIZES,
  AGNES_SIZE_TIERS,
  AGNES_LEGACY_SIZES,
  AGNES_RATIOS,
} from './profiles/agnes'
