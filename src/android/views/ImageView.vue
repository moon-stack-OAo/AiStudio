<script setup>
defineOptions({name: 'ImageView'})

import {computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {
  AddOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  ImageOutline,
  OptionsOutline,
  SparklesOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
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
import {appFetch} from '@core/utils/http'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {isAndroidTauri, isDesktopTauri} from '@core/utils/request'
import {trySaveToAndroidGallery} from '@core/utils/androidMediaSave'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'
import {imageGeneration} from '@core/runtime/generationRuntime'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'

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
const {scheduleScrollToBottom} = useScrollToBottom(listRef)
const mounted = ref(true)

/** itemId -> imageIndex -> objectURL，用于 idb 图片展示 */
const resolvedMap = ref({})
const createdObjectUrls = new Set()
let resolveToken = 0

/** 当前会话内图生图参考缩略图（不持久化，避免撑爆 localStorage） */
const refThumbMap = ref({})

/** 大图预览 */
const lightboxShow = ref(false)
const lightboxSrc = ref('')
const lightboxTitle = ref('')
const lightboxPayload = ref(null)

/** 参数抽屉 */
const paramsDrawerShow = ref(false)
/** 更多（模型 / 清空） */
const moreShow = ref(false)
/** 单图卡片操作 sheet */
const cardActionShow = ref(false)
const cardActionTarget = ref(null)
useBackCloseLayer(lightboxShow)
useBackCloseLayer(paramsDrawerShow)
useBackCloseLayer(moreShow)
useBackCloseLayer(cardActionShow)

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

const sizeOptionsDefault = [
  {label: '1920×1080', value: '1920x1080'},
  {label: '1080×1920', value: '1080x1920'},
  {label: '2560×1440', value: '2560x1440'},
  {label: '1440×2560', value: '1440x2560'},
  {label: '3840×2160', value: '3840x2160'},
  {label: '2160×3840', value: '2160x3840'},
]

function formatSizeLabel(v) {
  const s = String(v || '')
  if (/^\d+x\d+$/i.test(s)) return s.replace(/x/i, '×')
  return s
}

const sizeOptions = computed(() => {
  const list = imageCaps.value.sizes
  if (Array.isArray(list) && list.length) {
    return list.map((v) => ({label: formatSizeLabel(v), value: v}))
  }
  return sizeOptionsDefault
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

const qualityOptionsDesktop = [
  {label: '低质量', value: 'low'},
  {label: '标准', value: 'medium'},
  {label: '高质量', value: 'high'},
]
const qualityOptions = computed(() => qualityOptionsDesktop)

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
  return qualityOptionsDesktop.find((o) => o.value === quality.value)?.label || quality.value
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

function itemStatus(item) {
  return item?.status || 'done'
}

function paramSummary(item) {
  const parts = []
  if (item?.n && item.n > 1) parts.push(`${item.n} 张`)
  if (item?.size) parts.push(String(item.size).replace('x', '×'))
  if (item?.aspectRatio) parts.push(item.aspectRatio)
  if (item?.quality) {
    const q = qualityOptionsDesktop.find((o) => o.value === item.quality)
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

function getClipboardImageFile(clipboardData) {
  if (!clipboardData) return null
  const items = clipboardData.items
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }
  const files = clipboardData.files
  if (files?.length) {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      if (file && String(file.type || '').startsWith('image/')) return file
    }
  }
  return null
}

async function onPaste(e) {
  const file = getClipboardImageFile(e.clipboardData)
  if (!file) return
  e.preventDefault()
  try {
    await setReferenceFromFile(file)
  } catch {
    message.error('粘贴参考图失败')
  }
}

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
      ;
  [...createdObjectUrls].forEach((url) => {
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
      // 切会话时滚到底；停留当前页生成时不自动拽底
      scheduleScrollToBottom({force: true})
    },
)

watch(
  sizeOptions,
  (opts) => {
    if (!opts.some((o) => o.value === size.value)) {
      size.value = opts[0]?.value || '1024x1024'
    }
  },
  { immediate: true },
)

watch(
  aspectOptions,
  (opts) => {
    if (!opts.some((o) => o.value === aspectRatio.value)) {
      aspectRatio.value = opts[0]?.value || '1:1'
    }
  },
  { immediate: true },
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

    if (mounted.value && imageStore.activeId === sessionId) {
      if (tempCount > 0) {
        message.warning(`生成成功，但有 ${tempCount} 张未缓存（临时链接，可能过期）`)
      } else {
        message.success(`生成成功，共 ${images.length} 张`)
      }
    }
  } catch (err) {
    if (!sessionStillHasItem(sessionId, pending.id)) return
    const current = imageStore.sessions.find((s) => s.id === sessionId)?.items?.find((i) => i.id === pending.id)
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
      return
    }
    const errText = toErrorMessage(err, '生成失败')
    imageStore.updateItem(sessionId, pending.id, {
      status: 'error',
      errorMessage: errText,
    })
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
  message.success('已新建会话')
}

function removeSession(id) {
  gen.abortIfSession(id)
  imageStore.removeSession(id)
}

function sessionStillHasItem(sessionId, itemId) {
  const s = imageStore.sessions.find((x) => x.id === sessionId)
  return Boolean(s?.items?.some((i) => i.id === itemId))
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

async function srcToBlob(src) {
  if (src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }
  if (src.startsWith('data:')) {
    const res = await fetch(src)
    return res.blob()
  }
  const res = await appFetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

function triggerAnchorDownload(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  a.click()
}

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  if (!src) {
    message.warning('图片不可用')
    return
  }

  const mobileLike = !isDesktopTauri()

  try {
    const blob = await srcToBlob(src)
    const mime = blob.type || 'image/png'

    if (isAndroidTauri()) {
      const saved = await trySaveToAndroidGallery({
        src,
        blob,
        displayName: name,
        mimeType: mime,
        preferRemote: false,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    }

    const file = new File([blob], name, {type: mime})

    if (
        mobileLike &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function'
    ) {
      try {
        if (navigator.canShare({files: [file]})) {
          await navigator.share({files: [file], title: name})
          message.success('已分享图片')
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerAnchorDownload(objectUrl, name)
      if (mobileLike) message.success('已开始下载')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    } catch {
      window.open(objectUrl, '_blank', 'noopener')
      message.warning(mobileLike ? '请长按图片保存到相册' : '下载失败，已尝试在新窗口打开')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
  } catch {
    if (isAndroidTauri()) {
      const saved = await trySaveToAndroidGallery({
        src,
        displayName: name,
        mimeType: 'image/png',
        preferRemote: true,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    }
    try {
      triggerAnchorDownload(src, name)
      if (mobileLike) message.success('已开始下载')
    } catch {
      window.open(src, '_blank', 'noopener')
      message.warning(mobileLike ? '请长按图片保存到相册' : '下载失败，已尝试在新窗口打开')
    }
  }
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

function openCardActions(item, idx, img) {
  cardActionTarget.value = {item, idx, img}
  cardActionShow.value = true
}

async function onCardDownload() {
  const t = cardActionTarget.value
  cardActionShow.value = false
  if (!t) return
  await downloadImage(t.item.id, t.idx, t.img, `gen-${t.item.id}-${t.idx}.png`)
}

async function onCardUseAsReference() {
  const t = cardActionTarget.value
  cardActionShow.value = false
  if (!t) return
  await useAsReference(t.item, t.idx, t.img)
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

function clearItems() {
  if (!session.value?.items?.length) return
  moreShow.value = false
  dialog.warning({
    title: '清空时间线',
    content: '确定清空当前会话的全部生成记录？',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => imageStore.clearItems(session.value.id),
  })
}

const sessionTitle = computed(() => session.value?.title || '生图')

const sendTooltip = computed(() =>
    mode.value === 'img2img' && !imageFile.value ? '请先上传参考图' : '生成',
)
</script>

<template>
  <SessionWorkspaceShell
      :active-id="imageStore.activeId"
      :history-title="'生图历史'"
      :sessions="imageStore.sortedSessions"
      @create="createSession"
      @remove="removeSession"
      @rename="(id, title) => imageStore.renameSession(id, title)"
      @select="selectSession"
  >
    <template #toolbar="{ openHistory }">
      <div class="image-toolbar">
        <SessionHistoryButton
            :count="imageStore.sessions.length"
            @click="openHistory"
        />

        <div class="image-title">{{ sessionTitle }}</div>

        <n-button
            aria-label="新建会话"
            circle
            class="touch-target"
            quaternary
            @click="createSession"
        >
          <template #icon>
            <n-icon :component="AddOutline"/>
          </template>
        </n-button>

        <n-button
            aria-label="更多"
            circle
            class="touch-target"
            quaternary
            @click="moreShow = true"
        >
          <template #icon>
            <n-icon :component="EllipsisHorizontalOutline"/>
          </template>
        </n-button>
      </div>
    </template>

    <div ref="listRef" class="gallery">
      <div v-if="!timelineItems.length" class="empty">
        <div class="empty-title">开始创作</div>
        <div class="empty-desc">输入提示词即可生成</div>
      </div>

      <template v-for="item in timelineItems" :key="item.id">
        <div class="msg user">
          <div class="role">你</div>
          <div class="msg-body">
            <div class="bubble user-bubble">
              <div class="bubble-tags">
                <n-tag :bordered="false" size="tiny">
                  {{ item.mode === 'txt2img' ? '文生图' : '图生图' }}
                </n-tag>
                <n-tag
                    v-if="paramSummary(item)"
                    :bordered="false"
                    size="tiny"
                    type="info"
                >
                  {{ paramSummary(item) }}
                </n-tag>
              </div>
              <div
                  v-if="item.mode === 'img2img' && (refThumbMap[item.id] || item.refPreview)"
                  class="ref-thumb"
              >
                <img
                    :src="refThumbMap[item.id] || item.refPreview"
                    alt="reference"
                    title="点击预览"
                    @click="openRefLightbox(refThumbMap[item.id] || item.refPreview)"
                />
              </div>
              <div class="prompt-text">{{ item.prompt }}</div>
            </div>
            <div v-if="item.prompt" class="msg-actions">
              <CopyIconButton
                  :active="copiedId === item.id"
                  tooltip="复制提示词"
                  @click="copyPrompt(item)"
              />
            </div>
          </div>
        </div>

        <div
            :class="['msg', 'assistant', { error: itemStatus(item) === 'error' }]"
        >
          <div class="role">AI</div>
          <div class="msg-body">
            <div class="bubble ai-bubble">
              <div v-if="itemStatus(item) === 'loading'" class="ai-loading">
                <n-spin size="small"/>
                <span>生成中…</span>
              </div>
              <div v-else-if="itemStatus(item) === 'error'" class="ai-error">
                {{ item.errorMessage || '生成失败' }}
              </div>
              <div v-else-if="!item.images?.length" class="ai-error">暂无图片</div>
              <div v-else class="imgs">
                <div
                    v-for="(img, idx) in item.images"
                    :key="img.id || idx"
                    class="img-wrap"
                >
                  <div class="img-actions">
                    <n-button
                        aria-label="更多操作"
                        circle
                        class="touch-target"
                        quaternary
                        size="tiny"
                        @click.stop="openCardActions(item, idx, img)"
                    >
                      <template #icon>
                        <n-icon :component="EllipsisHorizontalOutline" :size="16"/>
                      </template>
                    </n-button>
                  </div>
                  <img
                      :src="displaySrc(item.id, idx, img) || img.remoteUrl || img.src || ''"
                      alt="generated"
                      @click="openLightbox(item, idx, img)"
                  />
                  <div v-if="isTemporary(img)" class="temp-tip" title="临时链接，可能过期">
                    临时链接，可能过期
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #composer>
      <div class="composer">
        <div
            v-if="isGeneratingCurrent"
            class="composer-hint is-critical"
        >
          生成中可点击停止
        </div>
        <div class="composer-card">
          <button
              class="params-summary"
              type="button"
              @click="paramsDrawerShow = true"
          >
            <n-icon :component="OptionsOutline" :size="16" class="params-summary-icon"/>
            <span class="params-summary-text">{{ paramsSummary }}</span>
            <span class="params-summary-action">设置</span>
          </button>

          <button
              v-if="mode === 'img2img' && previewUrl"
              class="ref-chip ref-chip-mobile"
              type="button"
              @click="paramsDrawerShow = true"
          >
            <img :src="previewUrl" alt="reference"/>
            <span class="ref-name">参考图已选，点击可更换</span>
          </button>

          <div class="composer-input">
            <n-input
                v-model:value="prompt"
                :autosize="{ minRows: 1, maxRows: 4 }"
                :disabled="isGeneratingCurrent"
                class="composer-field"
                placeholder="描述画面…"
                type="textarea"
                @focus="onComposerFocus"
            />
            <div class="composer-actions">
              <ComposerSendStop
                  :disabled="!canGenerate"
                  :loading="isGeneratingCurrent"
                  :send-icon="SparklesOutline"
                  :send-tooltip="sendTooltip"
                  @send="generate"
                  @stop="stopGenerate"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </SessionWorkspaceShell>

  <n-drawer
      v-model:show="paramsDrawerShow"
      :height="drawerHeight"
      display-directive="show"
      placement="bottom"
  >
    <n-drawer-content closable title="生成参数">
      <div class="params-drawer">
        <div class="params-section">
          <div class="params-label">模式</div>
          <div class="mode-switch mode-switch-full">
            <button
                :class="{ active: mode === 'txt2img' }"
                class="mode-item"
                type="button"
                @click="mode = 'txt2img'"
            >
              文生图
            </button>
            <button
                :class="{ active: mode === 'img2img' }"
                class="mode-item"
                type="button"
                @click="mode = 'img2img'"
            >
              图生图
            </button>
          </div>
        </div>

        <div v-if="mode === 'img2img'" class="params-section">
          <div class="params-label">参考图</div>
          <div class="params-upload">
            <n-upload
                v-if="!previewUrl"
                :custom-request="onUpload"
                :show-file-list="false"
                accept="image/*"
            >
              <n-button block class="params-upload-btn" dashed>
                <template #icon>
                  <n-icon :component="ImageOutline"/>
                </template>
                从相册选择参考图
              </n-button>
            </n-upload>
            <div v-else class="ref-chip ref-chip-drawer">
              <img :src="previewUrl" alt="reference"/>
              <div class="ref-chip-meta">
                <span class="ref-name">参考图已选</span>
                <span class="ref-hint">可清除后重新选择</span>
              </div>
              <n-button
                  aria-label="清除参考图"
                  class="touch-target"
                  quaternary
                  size="small"
                  @click="clearUpload"
              >
                <template #icon>
                  <n-icon :component="TrashOutline"/>
                </template>
              </n-button>
            </div>
          </div>
        </div>

        <div class="params-grid">
          <div v-if="supportsN" class="params-section">
            <div class="params-label">数量</div>
            <n-input-number v-model:value="n" :max="4" :min="1" class="params-control" size="medium"/>
          </div>

          <div v-if="supportsQuality" class="params-section">
            <div class="params-label">质量</div>
            <n-select
                v-model:value="quality"
                :options="qualityOptions"
                :render-label="renderSelectLabel"
                class="params-control"
                size="medium"
            />
          </div>

          <div v-if="showSize" class="params-section params-section-full">
            <div class="params-label">尺寸</div>
            <n-select
                v-model:value="size"
                :options="sizeOptions"
                :render-label="renderSelectLabel"
                class="params-control"
                size="medium"
            />
          </div>
          <div v-if="useAspectRatio" class="params-section params-section-full">
            <div class="params-label">比例</div>
            <n-select
                v-model:value="aspectRatio"
                :options="aspectOptions"
                :render-label="renderSelectLabel"
                class="params-control"
                size="medium"
            />
          </div>
        </div>

        <n-button
            block
            class="params-done"
            type="primary"
            @click="paramsDrawerShow = false"
        >
          完成
        </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>

  <n-modal
      v-model:show="lightboxShow"
      :bordered="false"
      :mask-closable="true"
      :title="lightboxTitle"
      preset="card"
      size="huge"
      style="width: min(920px, 94vw)"
      @after-leave="closeLightbox"
  >
    <div class="lightbox-body" title="点击关闭预览" @click="lightboxShow = false">
      <img v-if="lightboxSrc" :src="lightboxSrc" alt="preview"/>
    </div>
    <template v-if="lightboxPayload" #footer>
      <div class="lightbox-footer">
        <n-button
            class="lightbox-action"
            secondary
            size="small"
            @click="useLightboxAsReference"
        >
          设为参考图
        </n-button>
        <n-button
            class="lightbox-action"
            secondary
            size="small"
            @click="downloadImage(
            lightboxPayload.itemId,
            lightboxPayload.idx,
            lightboxPayload.img,
            lightboxPayload.name,
          )"
        >
          下载原图
        </n-button>
      </div>
    </template>
  </n-modal>

  <n-drawer
      v-model:show="moreShow"
      class="more-drawer"
      display-directive="show"
      height="auto"
      placement="bottom"
  >
    <n-drawer-content closable title="生图设置">
      <div class="more-sheet">
        <div class="more-field">
          <div class="more-label">提供商</div>
          <n-select
              :options="settings.providerOptions"
              :render-label="renderSelectLabel"
              :value="settings.activeProviderId"
              size="medium"
              @update:value="settings.setActiveProvider"
          />
        </div>
        <div class="more-field">
          <div class="more-label">模型</div>
          <ModelSelect kind="image" sheet size="medium"/>
        </div>
        <n-button
            :disabled="!session?.items?.length"
            block
            secondary
            type="warning"
            @click="clearItems"
        >
          清空当前会话
        </n-button>
        <div class="more-hint">接口密钥请到「设置」页管理</div>
      </div>
    </n-drawer-content>
  </n-drawer>

  <n-drawer
      v-model:show="cardActionShow"
      class="more-drawer"
      display-directive="show"
      height="auto"
      placement="bottom"
  >
    <n-drawer-content closable title="图片操作">
      <div class="more-sheet">
        <n-button block secondary @click="onCardDownload">
          <template #icon>
            <n-icon :component="DownloadOutline"/>
          </template>
          下载
        </n-button>
        <n-button block secondary @click="onCardUseAsReference">
          <template #icon>
            <n-icon :component="ImageOutline"/>
          </template>
          设为参考图
        </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped src="./ImageView.scss"></style>
