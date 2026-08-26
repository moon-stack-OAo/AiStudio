<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {
  DownloadOutline,
  ImageOutline,
  SparklesOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import ModelSelect from '@/components/ModelSelect.vue'
import CopyIconButton from '@/components/CopyIconButton.vue'
import ComposerSendStop from '@/components/ComposerSendStop.vue'
import {useImageStore} from '@/stores/image'
import {useSettingsStore} from '@/stores/settings'
import {editImage, fileToPreview, generateImage} from '@/api/client'
import {cacheGeneratedImages, getImageObjectUrl} from '@/utils/imageCache'
import {useBreakpoints} from '@/composables/useBreakpoints'
import {useCopyFeedback} from '@/composables/useCopyFeedback'
import {renderSelectLabel} from '@/utils/selectRender'

const imageStore = useImageStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const {isMobile, isCompact} = useBreakpoints()
const {copiedId, copyText} = useCopyFeedback()

const mode = ref('txt2img')
const prompt = ref('')
const loading = ref(false)
const n = ref(1)
const size = ref('1024x1024')
const aspectRatio = ref('1:1')
const quality = ref('medium')
const imageFile = ref(null)
const previewUrl = ref('')

const listRef = ref(null)
const abortRef = ref(null)
/** 当前进行中的生成条目 id，停止时用于回写状态 */
const pendingItemId = ref('')
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

const session = computed(() => imageStore.activeSession)
const provider = computed(() => settings.activeProvider)
const isXai = computed(() => provider.value?.provider === 'xai')

const canGenerate = computed(() => {
  if (!prompt.value.trim() || loading.value) return false
  if (mode.value === 'img2img' && !imageFile.value) return false
  return true
})

const timelineItems = computed(() => {
  const items = session.value?.items || []
  return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
})

const sizeOptions = [
  {label: '1024×1024', value: '1024x1024'},
  {label: '1024×1536', value: '1024x1536'},
  {label: '1536×1024', value: '1536x1024'},
]

const aspectOptions = [
  {label: '1:1', value: '1:1'},
  {label: '16:9', value: '16:9'},
  {label: '9:16', value: '9:16'},
  {label: '4:3', value: '4:3'},
  {label: '3:4', value: '3:4'},
  {label: 'auto', value: 'auto'},
]

const qualityOptions = [
  {label: '低质量', value: 'low'},
  {label: '标准', value: 'medium'},
  {label: '高质量', value: 'high'},
]

function itemStatus(item) {
  return item?.status || 'done'
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
    () => timelineItems.value.length,
    async () => {
      await nextTick()
      scrollToBottom()
    },
)

watch(
    () => session.value?.id,
    () => {
      refThumbMap.value = {}
    },
)

function scrollToBottom() {
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  mounted.value = false
  window.removeEventListener('paste', onPaste)
  abortRef.value?.abort()
  revokeAllObjectUrls()
})

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    generate()
  }
}

async function generate() {
  const text = prompt.value.trim()
  if (!text) {
    message.warning('请输入提示词')
    return
  }
  if (!session.value || loading.value) return
  if (!ensureProvider()) return
  if (mode.value === 'img2img' && !imageFile.value) {
    message.warning('图生图请先上传参考图')
    return
  }

  const sessionId = session.value.id
  abortRef.value?.abort()
  const controller = new AbortController()
  abortRef.value = controller

  prompt.value = ''

  const pending = imageStore.addItem(sessionId, {
    mode: mode.value,
    prompt: text,
    model: provider.value.imageModel,
    providerName: provider.value.name,
    images: [],
    refPreview: '',
    n: n.value,
    size: isXai.value ? undefined : size.value,
    aspectRatio: isXai.value ? aspectRatio.value : undefined,
    quality: quality.value,
    status: 'loading',
    errorMessage: '',
  })

  if (!pending?.id) {
    loading.value = false
    return
  }

  pendingItemId.value = pending.id

  if (mode.value === 'img2img' && previewUrl.value) {
    refThumbMap.value = {...refThumbMap.value, [pending.id]: previewUrl.value}
  }

  loading.value = true
  await nextTick()
  scrollToBottom()

  try {
    const rawImages =
        mode.value === 'txt2img'
            ? await generateImage(provider.value, {
              prompt: text,
              n: n.value,
              size: size.value,
              aspectRatio: aspectRatio.value,
              quality: quality.value,
              signal: controller.signal,
            })
            : await editImage(provider.value, {
              prompt: text,
              imageFile: imageFile.value,
              n: n.value,
              size: size.value,
              aspectRatio: aspectRatio.value,
              quality: quality.value,
              signal: controller.signal,
            })

    if (!sessionStillHasItem(sessionId, pending.id)) return
    if (controller.signal.aborted || !mounted.value) return

    const images = await cacheGeneratedImages(rawImages)

    if (!sessionStillHasItem(sessionId, pending.id)) return
    if (controller.signal.aborted || !mounted.value) return

    const tempCount = images.filter((img) => img.temporary).length

    imageStore.updateItem(sessionId, pending.id, {
      images,
      status: 'done',
      errorMessage: '',
    })

    if (tempCount > 0) {
      message.warning(`生成成功，但有 ${tempCount} 张未缓存（临时链接，可能过期）`)
    } else {
      message.success(`生成成功，共 ${images.length} 张`)
    }

    await nextTick()
    scrollToBottom()
  } catch (err) {
    if (!sessionStillHasItem(sessionId, pending.id)) return
    if (err?.name === 'AbortError' || err?.message === 'canceled' || controller.signal.aborted) {
      imageStore.updateItem(sessionId, pending.id, {
        status: 'error',
        errorMessage: '已取消',
      })
      return
    }
    if (!mounted.value) return
    const errText = err.message || '生成失败'
    imageStore.updateItem(sessionId, pending.id, {
      status: 'error',
      errorMessage: errText,
    })
    message.error(errText)
  } finally {
    if (abortRef.value === controller) abortRef.value = null
    if (pendingItemId.value === pending.id) pendingItemId.value = ''
    loading.value = false
  }
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

function closeLightbox() {
  lightboxShow.value = false
  lightboxSrc.value = ''
  lightboxTitle.value = ''
  lightboxPayload.value = null
}

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  if (!src) {
    message.warning('图片不可用')
    return
  }

  try {
    if (src.startsWith('blob:') || src.startsWith('data:')) {
      const a = document.createElement('a')
      a.href = src
      a.download = name
      a.click()
      return
    }
    const res = await fetch(src)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(src, '_blank', 'noopener')
  }
}

async function useAsReference(item, idx, img) {
  const src = await resolveImageSrc(item.id, idx, img)
  if (!src) {
    message.warning('图片不可用')
    return
  }
  try {
    const res = await fetch(src)
    const blob = await res.blob()
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
  if (!loading.value) return
  abortRef.value?.abort()
}

async function copyPrompt(item) {
  const ok = await copyText(item?.id, item?.prompt)
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

const sendTooltip = computed(() =>
  mode.value === 'img2img' && !imageFile.value ? '请先上传参考图' : '生成',
)
</script>

<template>
  <SessionWorkspaceShell
    :active-id="imageStore.activeId"
    :history-title="'生图历史'"
    :is-compact="isCompact"
    :is-mobile="isMobile"
    :session-title="session?.title || '生图'"
    :sessions="imageStore.sortedSessions"
    @create="imageStore.createSession()"
    @remove="imageStore.removeSession"
    @rename="(id, title) => imageStore.renameSession(id, title)"
    @select="imageStore.setActive"
  >
    <template #toolbar-right>
      <n-select
        :options="settings.providerOptions"
        :render-label="renderSelectLabel"
        :value="settings.activeProviderId"
        class="provider-select"
        size="small"
        @update:value="settings.setActiveProvider"
      />
      <ModelSelect kind="image"/>
      <n-button
        :disabled="!session?.items?.length"
        quaternary
        size="small"
        @click="clearItems"
      >
        清空
      </n-button>
    </template>

    <div class="content">
      <div ref="listRef" class="gallery">
        <div v-if="!timelineItems.length" class="empty">
          <div class="empty-title">开始创作</div>
          <div class="empty-desc">在下方输入提示词，生成结果将以时间线展示</div>
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
                  <img :src="refThumbMap[item.id] || item.refPreview" alt="reference"/>
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
                      <n-tooltip placement="bottom" trigger="hover">
                        <template #trigger>
                          <n-button
                            circle
                            quaternary
                            size="tiny"
                            @click.stop="downloadImage(item.id, idx, img, `gen-${item.id}-${idx}.png`)"
                          >
                            <template #icon>
                              <n-icon :component="DownloadOutline" :size="14"/>
                            </template>
                          </n-button>
                        </template>
                        下载
                      </n-tooltip>
                      <n-tooltip placement="bottom" trigger="hover">
                        <template #trigger>
                          <n-button
                            circle
                            quaternary
                            size="tiny"
                            @click.stop="useAsReference(item, idx, img)"
                          >
                            <template #icon>
                              <n-icon :component="ImageOutline" :size="14"/>
                            </template>
                          </n-button>
                        </template>
                        设为参考图
                      </n-tooltip>
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

      <div class="composer">
        <div class="composer-card">
          <div class="composer-toolbar">
            <div class="mode-switch">
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

            <div class="opt-group">
              <label class="opt-item opt-count">
                <span class="opt-label">数量</span>
                <n-input-number v-model:value="n" :max="4" :min="1" size="small"/>
              </label>
              <label v-if="!isXai" class="opt-item opt-size">
                <span class="opt-label">尺寸</span>
                <n-select
                  v-model:value="size"
                  :options="sizeOptions"
                  :render-label="renderSelectLabel"
                  size="small"
                />
              </label>
              <label v-else class="opt-item opt-ratio">
                <span class="opt-label">比例</span>
                <n-select
                  v-model:value="aspectRatio"
                  :options="aspectOptions"
                  :render-label="renderSelectLabel"
                  size="small"
                />
              </label>
              <label class="opt-item opt-quality">
                <span class="opt-label">质量</span>
                <n-select
                  v-model:value="quality"
                  :options="qualityOptions"
                  :render-label="renderSelectLabel"
                  size="small"
                />
              </label>
            </div>
          </div>

          <div v-if="mode === 'img2img'" class="upload-row">
            <n-upload
              v-if="!previewUrl"
              :custom-request="onUpload"
              :show-file-list="false"
              accept="image/*"
            >
              <n-button dashed size="small">
                <template #icon>
                  <n-icon :component="ImageOutline"/>
                </template>
                上传 / 粘贴参考图
              </n-button>
            </n-upload>
            <div v-else class="ref-chip">
              <img :src="previewUrl" alt="reference"/>
              <span class="ref-name">参考图已选</span>
              <n-button quaternary size="tiny" @click="clearUpload">
                <template #icon>
                  <n-icon :component="TrashOutline"/>
                </template>
              </n-button>
            </div>
          </div>

          <div class="composer-input">
            <n-input
              v-model:value="prompt"
              :autosize="{ minRows: 3, maxRows: 8 }"
              :disabled="loading"
              class="composer-field"
              placeholder="描述你想生成的画面，Enter 生成，Shift+Enter 换行"
              type="textarea"
              @keydown="onKeydown"
            />
            <div class="composer-actions">
              <ComposerSendStop
                :disabled="!canGenerate"
                :loading="loading"
                :send-icon="SparklesOutline"
                :send-tooltip="sendTooltip"
                @send="generate"
                @stop="stopGenerate"
              />
            </div>
          </div>
        </div>
        <div class="composer-hint">
          {{
            loading
              ? '生成中可点击停止'
              : 'Enter 生成 · Shift+Enter 换行 · Ctrl+V 粘贴参考图'
          }}
        </div>
      </div>
    </div>

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
            secondary
            size="small"
            @click="useLightboxAsReference"
          >
            设为参考图
          </n-button>
          <n-button
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
  </SessionWorkspaceShell>
</template>

<style lang="scss" scoped src="./ImageView.scss"></style>
