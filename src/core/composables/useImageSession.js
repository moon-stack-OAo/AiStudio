import {computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useImageStore} from '@core/stores/image'
import {useSettingsStore} from '@core/stores/settings'
import {
  editImage,
  fileToPreview,
  generateImage,
  getCapabilities,
  toErrorMessage,
} from '@core/api/client'
import {cacheGeneratedImages, getImageObjectUrl} from '@core/utils/imageCache'
import {resolveThumbStyle} from '@core/utils/imageThumb'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {useClipboardImage} from '@core/composables/useClipboardImage'
import {srcToBlob} from '@core/composables/useMediaDownload'
import {imageGeneration} from '@core/runtime/generationRuntime'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'

const SIZE_OPTIONS_DEFAULT = [
  {label: '1920×1080', value: '1920x1080'},
  {label: '1080×1920', value: '1080x1920'},
  {label: '2560×1440', value: '2560x1440'},
  {label: '1440×2560', value: '1440x2560'},
  {label: '3840×2160', value: '3840x2160'},
  {label: '2160×3840', value: '2160x3840'},
]

const QUALITY_OPTIONS = [
  {label: '低质量', value: 'low'},
  {label: '标准', value: 'medium'},
  {label: '高质量', value: 'high'},
]

function formatSizeLabel(v) {
  const s = String(v || '')
  if (/^\d+x\d+$/i.test(s)) return s.replace(/x/i, '×')
  return s
}

/**
 * 生图会话状态机（与窗体无关）：参数默认值、能力派生选项、生成 / 停止、时间线写入、
 * idb 图解析、参考图、lightbox 状态、generation runtime。
 * lightbox 手势 / 返回键分层、桌面 generate 子组件、右键菜单、Android sheet 等留在各端 View。
 *
 * @param {{
 *   notifyCreateSession?: boolean,
 * }} [options]
 */
export function useImageSession(options = {}) {
  const {notifyCreateSession = false} = options

  const imageStore = useImageStore()
  const settings = useSettingsStore()
  const message = useMessage()
  const dialog = useDialog()
  const {copiedId, copyText} = useCopyFeedback()
  const gen = useGenerationRuntime(imageGeneration)

  const mode = ref('txt2img')
  const prompt = ref('')
  const n = ref(1)
  const size = ref('1024x1024')
  const aspectRatio = ref('1:1')
  const quality = ref('medium')
  const imageFile = ref(null)
  const previewUrl = ref('')

  const listRef = ref(null)
  const bottomRef = ref(null)
  const {scheduleScrollToBottom} = useScrollToBottom(listRef, {bottomRef})
  const mounted = ref(true)

  /** itemId -> imageIndex -> objectURL，用于 idb 图片展示 */
  const resolvedMap = ref({})
  /** `${itemId}:${index}` -> natural width/height 比，用于缩略图校正 */
  const naturalRatioMap = ref({})
  const createdObjectUrls = new Set()
  let resolveToken = 0

  /** 当前会话内图生图参考缩略图（不持久化，避免撑爆 localStorage） */
  const refThumbMap = ref({})

  /** 大图预览 */
  const lightboxShow = ref(false)
  const lightboxSrc = ref('')
  const lightboxTitle = ref('')
  const lightboxPayload = ref(null)

  const session = computed(() => imageStore.activeSession)
  const provider = computed(() => settings.activeProvider)
  const caps = computed(() => getCapabilities(provider.value))
  const imageCaps = computed(() => caps.value?.image || {})
  const supportsQuality = computed(() => !!imageCaps.value.supportsQuality)
  const supportsN = computed(() => imageCaps.value.supportsN !== false)
  const showSize = computed(() => imageCaps.value.sizeMode !== 'aspectOnly')
  const useAspectRatio = computed(() => {
    const ratios = imageCaps.value.ratios
    return Array.isArray(ratios) && ratios.length > 0
  })
  const isGeneratingCurrent = computed(() => gen.isCurrent(session.value?.id))

  const canGenerate = computed(() => {
    if (!prompt.value.trim() || isGeneratingCurrent.value) return false
    if (mode.value === 'img2img' && !imageFile.value) return false
    return true
  })

  const timelineItems = computed(() => {
    const items = session.value?.items || []
    return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  })

  const sizeOptions = computed(() => {
    const list = imageCaps.value.sizes
    if (Array.isArray(list) && list.length) {
      return list.map((v) => ({label: formatSizeLabel(v), value: v}))
    }
    return SIZE_OPTIONS_DEFAULT
  })

  const aspectOptions = computed(() => {
    const list = imageCaps.value.ratios
    if (Array.isArray(list) && list.length) {
      return list.map((v) => ({label: v, value: v}))
    }
    return [
      {label: '1:1', value: '1:1'},
      {label: '16:9', value: '16:9'},
      {label: '9:16', value: '9:16'},
      {label: '4:3', value: '4:3'},
      {label: '3:4', value: '3:4'},
      {label: '3:2', value: '3:2'},
      {label: '2:3', value: '2:3'},
      {label: '21:9', value: '21:9'},
    ]
  })

  const qualityOptions = QUALITY_OPTIONS

  const modeLabel = computed(() => (mode.value === 'img2img' ? '图生图' : '文生图'))

  const sizeLabel = computed(() => {
    if (useAspectRatio.value) {
      const ratio =
        aspectOptions.value.find((o) => o.value === aspectRatio.value)?.label || aspectRatio.value
      if (showSize.value) {
        const tier = sizeOptions.value.find((o) => o.value === size.value)?.label || size.value
        return `${tier} · ${ratio}`
      }
      return ratio
    }
    return sizeOptions.value.find((o) => o.value === size.value)?.label || size.value
  })

  const qualityLabel = computed(() => {
    return qualityOptions.find((o) => o.value === quality.value)?.label || quality.value
  })

  const paramsSummary = computed(() => {
    const parts = [modeLabel.value]
    if (supportsN.value) parts.push(`${n.value}张`)
    parts.push(sizeLabel.value)
    if (supportsQuality.value) parts.push(qualityLabel.value)
    if (mode.value === 'img2img') {
      parts.push(previewUrl.value ? '已选参考图' : '未选参考图')
    }
    return parts.join(' · ')
  })

  const drawerHeight = computed(() => (mode.value === 'img2img' ? '78%' : '62%'))

  const sessionTitle = computed(() => session.value?.title || '生图')

  const sendTooltip = computed(() =>
    mode.value === 'img2img' && !imageFile.value ? '请先上传参考图' : '生成',
  )

  function itemStatus(item) {
    return item?.status || 'done'
  }

  function thumbStyleKey(itemId, index) {
    return `${itemId}:${index}`
  }

  function thumbStyle(item, index = 0, longEdge = 148) {
    const key = thumbStyleKey(item?.id, index)
    const natural = naturalRatioMap.value[key]
    return resolveThumbStyle(item, natural, {longEdge})
  }

  function onThumbLoad(item, index, event) {
    const img = event?.target
    const w = Number(img?.naturalWidth)
    const h = Number(img?.naturalHeight)
    if (!item?.id || !(w > 0) || !(h > 0)) return
    const key = thumbStyleKey(item.id, index)
    const next = w / h
    if (naturalRatioMap.value[key] === next) return
    naturalRatioMap.value = {...naturalRatioMap.value, [key]: next}
  }

  function paramSummary(item) {
    const parts = []
    if (item?.n && item.n > 1) parts.push(`${item.n} 张`)
    if (item?.size) parts.push(String(item.size).replace('x', '×'))
    if (item?.aspectRatio) parts.push(item.aspectRatio)
    if (item?.quality) {
      const q = qualityOptions.find((o) => o.value === item.quality)
      parts.push(q?.label || item.quality)
    }
    return parts.join(' · ')
  }

  function ensureProvider() {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
      message.warning('请先在设置中填写 Base URL 和 API Key')
      return false
    }
    if (!provider.value?.imageModel) {
      message.warning('请先设置生图模型')
      return false
    }
    return true
  }

  async function setReferenceFromFile(file, {notify = true} = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      if (notify) message.warning('请提供图片文件')
      return false
    }
    imageFile.value = file
    previewUrl.value = await fileToPreview(file)
    mode.value = 'img2img'
    if (notify) message.success('已设为参考图，可继续图生图')
    return true
  }

  async function onUpload({file}) {
    await setReferenceFromFile(file.file, {notify: false})
    return false
  }

  function clearUpload() {
    imageFile.value = null
    previewUrl.value = ''
  }

  const {onPaste} = useClipboardImage((file) => setReferenceFromFile(file), {
    onError: () => message.error('粘贴参考图失败'),
  })

  function revokeAllObjectUrls() {
    createdObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
    })
    createdObjectUrls.clear()
    resolvedMap.value = {}
  }

  function displaySrc(itemId, idx, img) {
    if (img?.type === 'idb') {
      return resolvedMap.value[itemId]?.[idx] || ''
    }
    return img?.src || ''
  }

  function isTemporary(img) {
    return img?.temporary === true || img?.type === 'url'
  }

  async function resolveSessionImages(items = [], sessionId = null) {
    const token = ++resolveToken
    const targetSessionId = sessionId ?? imageStore.activeId
    const next = {}
    const used = new Set()

    for (const item of items) {
      const images = item.images || []
      next[item.id] = {}
      for (let idx = 0; idx < images.length; idx += 1) {
        const img = images[idx]
        if (img?.type !== 'idb' || !img.id) continue

        const prev = resolvedMap.value[item.id]?.[idx]
        if (prev) {
          next[item.id][idx] = prev
          used.add(prev)
          continue
        }

        try {
          const url = await getImageObjectUrl(img.id)
          if (token !== resolveToken || imageStore.activeId !== targetSessionId) return
          if (url) {
            createdObjectUrls.add(url)
            used.add(url)
            next[item.id][idx] = url
          }
        } catch {
          // 缓存缺失时留空，模板侧可回退 remoteUrl
        }
      }
    }

    if (token !== resolveToken || imageStore.activeId !== targetSessionId) return
    ;[...createdObjectUrls].forEach((url) => {
      if (!used.has(url)) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
        createdObjectUrls.delete(url)
      }
    })

    resolvedMap.value = next
  }

  watch(
    () => {
      const s = session.value
      if (!s) return {id: null, keys: ''}
      const items = s.items || []
      return {
        id: s.id,
        keys: items
          .map((it) => `${it.id}:${(it.images || []).length}:${it.status || 'done'}`)
          .join('|'),
      }
    },
    () => {
      resolveSessionImages(session.value?.items || [], session.value?.id)
    },
    {immediate: true},
  )

  watch(
    () => session.value?.id,
    () => {
      refThumbMap.value = {}
      naturalRatioMap.value = {}
      // 切会话时滚到底；停留当前页生成时不自动拽底
      scheduleScrollToBottom({force: true})
    },
  )

  watch(
    sizeOptions,
    (opts) => {
      if (!opts.some((o) => o.value === size.value)) {
        const preferred = opts.find((o) => o.value === '1K') || opts[0]
        size.value = preferred?.value || '1024x1024'
      }
    },
    {immediate: true},
  )

  watch(
    aspectOptions,
    (opts) => {
      if (!opts.some((o) => o.value === aspectRatio.value)) {
        aspectRatio.value = opts[0]?.value || '1:1'
      }
    },
    {immediate: true},
  )

  onMounted(() => {
    window.addEventListener('paste', onPaste)
    scheduleScrollToBottom({force: true})
  })

  onActivated(() => {
    // 仅切回本页时滚到底
    scheduleScrollToBottom({force: true})
  })

  onBeforeUnmount(() => {
    mounted.value = false
    window.removeEventListener('paste', onPaste)
    revokeAllObjectUrls()
  })

  function onComposerFocus() {
    // 生图页不因输入框聚焦自动滚底
  }

  function sessionStillHasItem(sessionId, itemId) {
    const s = imageStore.sessions.find((x) => x.id === sessionId)
    return Boolean(s?.items?.some((i) => i.id === itemId))
  }

  async function generate() {
    const text = prompt.value.trim()
    if (!text) {
      message.warning('请输入提示词')
      return
    }
    if (!session.value || gen.busy) return
    if (!ensureProvider()) return
    if (mode.value === 'img2img' && !imageFile.value) {
      message.warning('图生图请先上传参考图')
      return
    }

    const sessionId = session.value.id
    gen.abort()
    const controller = new AbortController()
    gen.begin(sessionId, controller)

    prompt.value = ''

    const pending = imageStore.addItem(sessionId, {
      mode: mode.value,
      prompt: text,
      model: provider.value.imageModel,
      providerName: provider.value.name,
      images: [],
      refPreview: '',
      n: n.value,
      size: showSize.value ? size.value : undefined,
      aspectRatio: useAspectRatio.value ? aspectRatio.value : undefined,
      quality: supportsQuality.value ? quality.value : undefined,
      status: 'loading',
      errorMessage: '',
    })

    if (!pending?.id) {
      gen.end(sessionId)
      return
    }

    if (mode.value === 'img2img' && previewUrl.value) {
      refThumbMap.value = {...refThumbMap.value, [pending.id]: previewUrl.value}
    }

    // 用户主动生成：强制贴底并开启后续贴底跟随
    scheduleScrollToBottom({force: true})
    await nextTick()

    try {
      const rawImages =
        mode.value === 'txt2img'
          ? await generateImage(provider.value, {
              prompt: text,
              n: n.value,
              size: size.value,
              aspectRatio: aspectRatio.value,
              quality: supportsQuality.value ? quality.value : undefined,
              signal: controller.signal,
            })
          : await editImage(provider.value, {
              prompt: text,
              imageFile: imageFile.value,
              n: n.value,
              size: size.value,
              aspectRatio: aspectRatio.value,
              quality: supportsQuality.value ? quality.value : undefined,
              signal: controller.signal,
            })

      if (!sessionStillHasItem(sessionId, pending.id)) return
      if (controller.signal.aborted) return

      const images = await cacheGeneratedImages(rawImages)

      if (!sessionStillHasItem(sessionId, pending.id)) return
      if (controller.signal.aborted) return

      const tempCount = images.filter((img) => img.temporary).length

      imageStore.updateItem(sessionId, pending.id, {
        images,
        status: 'done',
        errorMessage: '',
      })
      if (imageStore.activeId === sessionId) scheduleScrollToBottom()

      if (mounted.value && imageStore.activeId === sessionId) {
        if (tempCount > 0) {
          message.warning(`生成成功，但有 ${tempCount} 张未缓存（临时链接，可能过期）`)
        } else {
          message.success(`生成成功，共 ${images.length} 张`)
        }
      }
    } catch (err) {
      if (!sessionStillHasItem(sessionId, pending.id)) return
      const current = imageStore.sessions
        .find((s) => s.id === sessionId)
        ?.items?.find((i) => i.id === pending.id)
      if (current?.errorMessage === '已取消') return
      if (
        err?.name === 'AbortError' ||
        err?.message === 'canceled' ||
        /cancel+ed|已取消/i.test(String(err?.message || '')) ||
        controller.signal.aborted
      ) {
        imageStore.updateItem(sessionId, pending.id, {
          status: 'error',
          errorMessage: '已取消',
        })
        if (imageStore.activeId === sessionId) scheduleScrollToBottom()
        return
      }
      const errText = toErrorMessage(err, '生成失败')
      imageStore.updateItem(sessionId, pending.id, {
        status: 'error',
        errorMessage: errText,
      })
      if (imageStore.activeId === sessionId) scheduleScrollToBottom()
      if (mounted.value && imageStore.activeId === sessionId) {
        message.error(errText)
      }
    } finally {
      gen.end(sessionId, controller)
    }
  }

  function selectSession(id) {
    imageStore.setActive(id)
  }

  function createSession() {
    imageStore.createSession()
    if (notifyCreateSession) message.success('已新建会话')
  }

  function removeSession(id) {
    gen.abortIfSession(id)
    imageStore.removeSession(id)
  }

  async function resolveImageSrc(itemId, idx, img) {
    let src = displaySrc(itemId, idx, img)
    if (!src && img?.type === 'idb' && img.id) {
      try {
        src = await getImageObjectUrl(img.id)
        if (src) {
          createdObjectUrls.add(src)
          if (!resolvedMap.value[itemId]) resolvedMap.value[itemId] = {}
          resolvedMap.value[itemId][idx] = src
        }
      } catch {
        // ignore
      }
    }
    if (!src && img?.remoteUrl) src = img.remoteUrl
    if (!src && img?.src) src = img.src
    return src || ''
  }

  async function openLightbox(item, idx, img) {
    const src = await resolveImageSrc(item.id, idx, img)
    if (!src) {
      message.warning('图片不可用')
      return
    }
    lightboxSrc.value = src
    lightboxTitle.value = item.prompt || '生成图片'
    lightboxPayload.value = {itemId: item.id, idx, img, name: `gen-${item.id}-${idx}.png`}
    lightboxShow.value = true
  }

  function openRefLightbox(src) {
    if (!src) {
      message.warning('图片不可用')
      return
    }
    lightboxSrc.value = src
    lightboxTitle.value = '参考图'
    lightboxPayload.value = null
    lightboxShow.value = true
  }

  function closeLightbox() {
    lightboxShow.value = false
    lightboxSrc.value = ''
    lightboxTitle.value = ''
    lightboxPayload.value = null
  }

  async function useAsReference(item, idx, img) {
    const src = await resolveImageSrc(item.id, idx, img)
    if (!src) {
      message.warning('图片不可用')
      return
    }
    try {
      const blob = await srcToBlob(src)
      const file = new File([blob], `ref-${item.id}-${idx}.png`, {
        type: blob.type || 'image/png',
      })
      await setReferenceFromFile(file)
    } catch {
      message.error('设置参考图失败')
    }
  }

  async function useLightboxAsReference() {
    if (!lightboxPayload.value) return
    const {itemId, idx, img} = lightboxPayload.value
    const item = session.value?.items?.find((i) => i.id === itemId)
    if (!item) {
      message.warning('图片不可用')
      return
    }
    await useAsReference(item, idx, img)
    lightboxShow.value = false
  }

  function stopGenerate() {
    const sessionId = session.value?.id
    if (!sessionId || !gen.isCurrent(sessionId)) return
    const loadingItem = session.value?.items?.find((i) => i.status === 'loading')
    if (loadingItem) {
      imageStore.updateItem(sessionId, loadingItem.id, {
        status: 'error',
        errorMessage: '已取消',
      })
    }
    gen.abort()
    gen.end(sessionId)
  }

  async function copyPrompt(item) {
    const ok = await copyText(item?.id, item?.prompt)
    if (!ok) message.error('复制失败')
  }

  async function copyErrorText(item) {
    const text = String(item?.errorMessage || '生成失败').trim()
    const ok = await copyText(`${item?.id || 'err'}-error`, text)
    if (!ok) message.error('复制失败')
  }

  function clearItems() {
    if (!session.value?.items?.length) return
    dialog.warning({
      title: '清空时间线',
      content: '确定清空当前会话的全部生成记录？',
      positiveText: '清空',
      negativeText: '取消',
      onPositiveClick: () => imageStore.clearItems(session.value.id),
    })
  }

  return {
    imageStore,
    settings,
    message,
    dialog,
    gen,
    copiedId,
    copyText,
    mode,
    prompt,
    n,
    size,
    aspectRatio,
    quality,
    imageFile,
    previewUrl,
    listRef,
    bottomRef,
    mounted,
    resolvedMap,
    refThumbMap,
    lightboxShow,
    lightboxSrc,
    lightboxTitle,
    lightboxPayload,
    session,
    provider,
    caps,
    imageCaps,
    supportsQuality,
    supportsN,
    showSize,
    useAspectRatio,
    isGeneratingCurrent,
    canGenerate,
    timelineItems,
    sizeOptions,
    aspectOptions,
    qualityOptions,
    modeLabel,
    sizeLabel,
    qualityLabel,
    paramsSummary,
    drawerHeight,
    sessionTitle,
    sendTooltip,
    itemStatus,
    thumbStyle,
    onThumbLoad,
    paramSummary,
    ensureProvider,
    setReferenceFromFile,
    onUpload,
    clearUpload,
    displaySrc,
    isTemporary,
    resolveImageSrc,
    openLightbox,
    openRefLightbox,
    closeLightbox,
    useAsReference,
    useLightboxAsReference,
    generate,
    stopGenerate,
    selectSession,
    createSession,
    removeSession,
    copyPrompt,
    copyErrorText,
    clearItems,
    onComposerFocus,
    scheduleScrollToBottom,
  }
}
