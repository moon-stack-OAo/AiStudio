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
