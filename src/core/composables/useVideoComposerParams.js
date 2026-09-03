import {computed, ref, watch} from 'vue'
import {fileToPreview, getCapabilities} from '@core/api/client'
import {useClipboardImage} from '@core/composables/useClipboardImage'

/** 仅当 profile 未声明 video.sizes 时的视频像素回退（勿用生图尺寸） */
const SIZE_OPTIONS_PIXELS = [
  {label: '1280×720', value: '1280x720'},
  {label: '720×1280', value: '720x1280'},
  {label: '1792×1024', value: '1792x1024'},
  {label: '1024×1792', value: '1024x1792'},
]

export function formatVideoSizeLabel(v) {
  const s = String(v || '')
  if (/^\d+x\d+$/i.test(s)) return s.replace(/x/i, '×')
  return s
}

/**
 * 生视频 composer：模式 / 提示词 / 能力派生选项与默认值、参考图上传。
 */
export function useVideoComposerParams({settings, message, getSessionId}) {
  const mode = ref('txt2video')
  const prompt = ref('')
  const seconds = ref(8)
  const size = ref('1280x720')
  const aspectRatio = ref('16:9')
  const imageFile = ref(null)
  const previewUrl = ref('')
  const resolution = ref('720p')

  /** 按 sessionId 分桶的参考缩略图（内存态，不持久化大图） */
  const refThumbBySession = ref({})
  /** 同会话图生参考原图缓存，供一键重试（不进 localStorage） */
  const refFileBySession = ref({})

  const provider = computed(() => settings.activeProvider)
  const caps = computed(() => getCapabilities(provider.value))
  const videoCaps = computed(() => caps.value?.video || {})
  /** aspectOnly：仅选比例；tier：档位(+可选比例)；pixels：WxH */
  const useAspectOnly = computed(() => videoCaps.value.sizeMode === 'aspectOnly')
  const useSizeTier = computed(() => videoCaps.value.sizeMode === 'tier')
  const showSize = computed(() => videoCaps.value.sizeMode !== 'aspectOnly')
  const showAspectRatio = computed(() => {
    if (useAspectOnly.value) return true
    const ratios = videoCaps.value.ratios
    return Array.isArray(ratios) && ratios.length > 0
  })
  const showResolution = computed(() => {
    const list = videoCaps.value.resolutions
    return Array.isArray(list) && list.length > 0
  })

  const refThumbMap = computed(() => {
    const sid = getSessionId()
    return sid ? refThumbBySession.value[sid] || {} : {}
  })

  const sizeOptions = computed(() => {
    const list = videoCaps.value.sizes
    if (Array.isArray(list) && list.length) {
      return list.map((v) => ({label: formatVideoSizeLabel(v), value: v}))
    }
    return SIZE_OPTIONS_PIXELS
  })

  const aspectOptions = computed(() => {
    const list = videoCaps.value.ratios
    if (Array.isArray(list) && list.length) {
      return list.map((v) => ({label: v, value: v}))
    }
    return [
      {label: '16:9', value: '16:9'},
      {label: '9:16', value: '9:16'},
      {label: '1:1', value: '1:1'},
      {label: '4:3', value: '4:3'},
      {label: '3:4', value: '3:4'},
    ]
  })

  const durationOptions = computed(() => {
    const v = videoCaps.value
    if (Array.isArray(v.durationOptions) && v.durationOptions.length) {
      return v.durationOptions.map((sec) => ({label: `${sec} 秒`, value: sec}))
    }
    const min = Number(v.durationMin) || 1
    const max = Number(v.durationMax) || 15
    return Array.from({length: max - min + 1}, (_, i) => {
      const sec = min + i
      return {label: `${sec} 秒`, value: sec}
    })
  })

  const resolutionOptions = computed(() => {
    const list = videoCaps.value.resolutions
    if (!Array.isArray(list) || !list.length) return []
    return list.map((v) => ({label: String(v).toUpperCase(), value: v}))
  })

  const modeLabel = computed(() => (mode.value === 'img2video' ? '图生视频' : '文生视频'))

  const sizeLabel = computed(() => {
    if (useAspectOnly.value) {
      const ratio =
        aspectOptions.value.find((o) => o.value === aspectRatio.value)?.label || aspectRatio.value
      if (showResolution.value) {
        const res =
          resolutionOptions.value.find((o) => o.value === resolution.value)?.label ||
          resolution.value
        return `${ratio} · ${res}`
      }
      return ratio
    }
    const tier = sizeOptions.value.find((o) => o.value === size.value)?.label || size.value
    if (showAspectRatio.value) {
      const ratio =
        aspectOptions.value.find((o) => o.value === aspectRatio.value)?.label || aspectRatio.value
      return `${tier} · ${ratio}`
    }
    return tier
  })

  const durationLabel = computed(() => `${seconds.value} 秒`)

  const paramsSummary = computed(() => {
    const parts = [modeLabel.value, durationLabel.value, sizeLabel.value]
    if (mode.value === 'img2video') {
      parts.push(previewUrl.value ? '已选参考图' : '未选参考图')
    }
    return parts.join(' · ')
  })

  const drawerHeight = computed(() => (mode.value === 'img2video' ? '78%' : '62%'))

  const sendTooltip = computed(() => {
    if (mode.value === 'img2video' && !imageFile.value) return '请先上传参考图'
    if (mode.value === 'txt2video' && !prompt.value.trim()) return '请输入提示词'
    return '生成'
  })

  const emptyDesc = computed(() => {
    if (!provider.value?.videoModel) {
      return '请先在设置中配置视频模型（videoModel），再输入提示词生成'
    }
    return '在下方输入提示词，生成结果将以时间线展示'
  })

  function paramSummary(item) {
    const parts = []
    const p = item?.params || {}
    const sec = p.seconds ?? p.duration
    if (sec != null && sec !== '') parts.push(`${sec} 秒`)
    if (p.size) parts.push(formatVideoSizeLabel(p.size))
    if (p.aspectRatio) parts.push(p.aspectRatio)
    if (p.resolution) parts.push(String(p.resolution).toUpperCase())
    return parts.join(' · ')
  }

  function ensureProvider() {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
      message.warning('请先在设置中填写 Base URL 和 API Key')
      return false
    }
    if (!provider.value?.videoModel) {
      message.warning('请先设置视频模型（videoModel）')
      return false
    }
    return true
  }

  function rememberRefFile(sessionId, itemId, file) {
    if (!sessionId || !itemId || !file) return
    const bucket = {...(refFileBySession.value[sessionId] || {})}
    bucket[itemId] = file
    refFileBySession.value = {...refFileBySession.value, [sessionId]: bucket}
  }

  function setRefThumb(sessionId, itemId, thumb) {
    if (!sessionId || !itemId || !thumb) return
    const bucket = {...(refThumbBySession.value[sessionId] || {})}
    bucket[itemId] = thumb
    refThumbBySession.value = {...refThumbBySession.value, [sessionId]: bucket}
  }

  function clearSessionRefCache(sessionId) {
    if (!sessionId) return
    const thumbs = {...refThumbBySession.value}
    const files = {...refFileBySession.value}
    delete thumbs[sessionId]
    delete files[sessionId]
    refThumbBySession.value = thumbs
    refFileBySession.value = files
  }

  function clearItemRefCache(sessionId, itemId) {
    if (!sessionId || !itemId) return
    const thumbBucket = {...(refThumbBySession.value[sessionId] || {})}
    const fileBucket = {...(refFileBySession.value[sessionId] || {})}
    if (!(itemId in thumbBucket) && !(itemId in fileBucket)) return
    delete thumbBucket[itemId]
    delete fileBucket[itemId]
    refThumbBySession.value = {...refThumbBySession.value, [sessionId]: thumbBucket}
    refFileBySession.value = {...refFileBySession.value, [sessionId]: fileBucket}
  }

  function applyItemParams(item) {
    const p = item?.params || {}
    const sec = p.seconds ?? p.duration
    if (sec != null && sec !== '') seconds.value = Number(sec) || seconds.value
    if (p.size) size.value = p.size
    if (p.aspectRatio) aspectRatio.value = p.aspectRatio
    if (p.resolution) resolution.value = p.resolution
  }

  async function setReferenceFromFile(file, {notify = true} = {}) {
    if (!file) {
      if (notify) message.warning('请提供图片文件')
      return false
    }
    const type = String(file.type || '').toLowerCase()
    const name = String(file.name || '').toLowerCase()
    if (type.includes('heic') || type.includes('heif') || /\.heic$|\.heif$/i.test(name)) {
      if (notify) message.warning('暂不支持 HEIC/HEIF，请先转为 JPG/PNG')
      return false
    }
    if (type && !type.startsWith('image/')) {
      if (notify) message.warning('请提供图片文件')
      return false
    }
    const maxBytes = 25 * 1024 * 1024
    if (typeof file.size === 'number' && file.size > maxBytes) {
      if (notify) message.warning('图片过大（建议 < 25MB），请压缩后再上传')
      return false
    }
    imageFile.value = file
    try {
      previewUrl.value = await fileToPreview(file)
    } catch {
      if (notify) message.error('图片无法预览，请换 JPG/PNG 重试')
      imageFile.value = null
      previewUrl.value = ''
      return false
    }
    mode.value = 'img2video'
    if (notify) message.success('已设为参考图，可继续图生视频')
    return true
  }

  async function onUpload({file}) {
    const ok = await setReferenceFromFile(file.file, {notify: false})
    if (ok) message.success('已设为参考图，可继续图生视频')
    return false
  }

  function clearUpload() {
    imageFile.value = null
    previewUrl.value = ''
  }

  const {onPaste} = useClipboardImage((file) => setReferenceFromFile(file), {
    onError: () => message.error('粘贴参考图失败'),
  })

  watch(
    () => getSessionId(),
    () => {
      clearUpload()
    },
  )

  watch(
    durationOptions,
    (opts) => {
      if (!opts.some((o) => o.value === seconds.value)) {
        const def = videoCaps.value.durationDefault
        seconds.value = opts.some((o) => o.value === def) ? def : (opts[0]?.value ?? 8)
      }
    },
    {immediate: true},
  )

  watch(
    sizeOptions,
    (opts) => {
      if (!opts.some((o) => o.value === size.value)) {
        size.value = opts[0]?.value || (useSizeTier.value ? '720P' : '1280x720')
      }
    },
    {immediate: true},
  )

  watch(
    aspectOptions,
    (opts) => {
      if (!opts.some((o) => o.value === aspectRatio.value)) {
        aspectRatio.value = opts[0]?.value || '16:9'
      }
    },
    {immediate: true},
  )

  watch(
    resolutionOptions,
    (opts) => {
      if (!opts.length) return
      if (!opts.some((o) => o.value === resolution.value)) {
        const def = videoCaps.value.resolutionDefault
        resolution.value = opts.some((o) => o.value === def) ? def : opts[0].value
      }
    },
    {immediate: true},
  )

  return {
    mode,
    prompt,
    seconds,
    size,
    aspectRatio,
    resolution,
    imageFile,
    previewUrl,
    refThumbBySession,
    refFileBySession,
    refThumbMap,
    provider,
    caps,
    videoCaps,
    useAspectOnly,
    useSizeTier,
    showSize,
    showAspectRatio,
    showResolution,
    sizeOptions,
    aspectOptions,
    durationOptions,
    resolutionOptions,
    modeLabel,
    sizeLabel,
    durationLabel,
    paramsSummary,
    drawerHeight,
    sendTooltip,
    emptyDesc,
    paramSummary,
    ensureProvider,
    rememberRefFile,
    setRefThumb,
    clearSessionRefCache,
    clearItemRefCache,
    applyItemParams,
    setReferenceFromFile,
    onUpload,
    clearUpload,
    onPaste,
  }
}
