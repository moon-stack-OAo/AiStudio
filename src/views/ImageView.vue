<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {
  CheckmarkOutline,
  CopyOutline,
  DownloadOutline,
  ImageOutline,
  ListOutline,
  SparklesOutline,
  StopOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'
import ModelSelect from '@/components/ModelSelect.vue'
import {useImageStore} from '@/stores/image'
import {useSettingsStore} from '@/stores/settings'
import {editImage, fileToPreview, generateImage} from '@/api/client'
import {cacheGeneratedImages, getImageObjectUrl} from '@/utils/imageCache'
import {useBreakpoints} from '@/composables/useBreakpoints'
import {renderSelectLabel} from '@/utils/selectRender'

const imageStore = useImageStore()
const settings = useSettingsStore()
const message = useMessage()
const {isMobile, isCompact} = useBreakpoints()
const historyShow = ref(false)

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
const copiedId = ref('')
let copiedTimer = null

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

async function onUpload({file}) {
  imageFile.value = file.file
  previewUrl.value = await fileToPreview(file.file)
  return false
}

function clearUpload() {
  imageFile.value = null
  previewUrl.value = ''
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

onBeforeUnmount(() => {
  mounted.value = false
  abortRef.value?.abort()
  revokeAllObjectUrls()
  if (copiedTimer) clearTimeout(copiedTimer)
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

    // 生成中被删除：条目已不存在，直接结束
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
    imageFile.value = file
    previewUrl.value = await fileToPreview(file)
    mode.value = 'img2img'
    message.success('已设为参考图，可继续图生图')
  } catch {
    message.error('设置参考图失败')
  }
}

function stopGenerate() {
  if (!loading.value) return
  abortRef.value?.abort()
}

async function copyPrompt(item) {
  const text = String(item?.prompt || '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = item.id
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      if (copiedId.value === item.id) copiedId.value = ''
    }, 1600)
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <div :class="{ compact: isCompact, mobile: isMobile }" class="page">
    <SessionList
        v-if="!isCompact"
        :active-id="imageStore.activeId"
        :sessions="imageStore.sortedSessions"
        title="生图历史"
        @create="imageStore.createSession()"
        @remove="imageStore.removeSession"
        @rename="(id, title) => imageStore.renameSession(id, title)"
        @select="imageStore.setActive"
    />

    <n-drawer
        v-model:show="historyShow"
        :width="isMobile ? '86%' : 280"
        display-directive="show"
        placement="left"
    >
      <n-drawer-content closable title="生图历史">
        <SessionList
            :active-id="imageStore.activeId"
            :sessions="imageStore.sortedSessions"
            embedded
            title="生图历史"
            @create="imageStore.createSession(); historyShow = false"
            @remove="imageStore.removeSession"
            @rename="(id, title) => imageStore.renameSession(id, title)"
            @select="(id) => { imageStore.setActive(id); historyShow = false }"
        />
      </n-drawer-content>
    </n-drawer>

    <div class="image-main">
      <div class="toolbar">
        <div class="left">
          <n-button v-if="isCompact" circle quaternary size="small" @click="historyShow = true">
            <template #icon>
              <n-icon :component="ListOutline"/>
            </template>
          </n-button>
          <div class="session-name">{{ session?.title || '生图' }}</div>
        </div>
        <div class="right">
          <n-select
              :options="settings.providerOptions"
              :render-label="renderSelectLabel"
              :value="settings.activeProviderId"
              class="provider-select"
              size="small"
              @update:value="settings.setActiveProvider"
          />
          <ModelSelect kind="image"/>
        </div>
      </div>

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
                  <n-tooltip placement="bottom" trigger="hover">
                    <template #trigger>
                      <n-button circle quaternary size="tiny" @click="copyPrompt(item)">
                        <template #icon>
                          <n-icon
                              :component="copiedId === item.id ? CheckmarkOutline : CopyOutline"
                              :size="14"
                          />
                        </template>
                      </n-button>
                    </template>
                    {{ copiedId === item.id ? '已复制' : '复制提示词' }}
                  </n-tooltip>
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
                            circle
                            quaternary
                            size="tiny"
                            @click.stop="downloadImage(item.id, idx, img, `gen-${item.id}-${idx}.png`)"
                        >
                          <template #icon>
                            <n-icon :component="DownloadOutline" :size="14"/>
                          </template>
                        </n-button>
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
                <div
                    v-if="itemStatus(item) === 'done' && item.images?.length"
                    class="msg-actions"
                >
                  <n-button
                      circle
                      quaternary
                      size="tiny"
                      @click="downloadImage(item.id, 0, item.images[0], `gen-${item.id}-0.png`)"
                  >
                    <template #icon>
                      <n-icon :component="DownloadOutline" :size="14"/>
                    </template>
                  </n-button>
                  <n-button
                      circle
                      quaternary
                      size="tiny"
                      @click="useAsReference(item, 0, item.images[0])"
                  >
                    <template #icon>
                      <n-icon :component="ImageOutline" :size="14"/>
                    </template>
                  </n-button>
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
                  上传参考图
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
                <n-button
                    v-if="loading"
                    circle
                    class="action-btn send-btn"
                    size="medium"
                    type="warning"
                    @click="stopGenerate"
                >
                  <template #icon>
                    <n-icon :component="StopOutline"/>
                  </template>
                </n-button>
                <n-button
                    v-else
                    :disabled="!prompt.trim()"
                    circle
                    class="action-btn send-btn"
                    size="medium"
                    type="primary"
                    @click="generate"
                >
                  <template #icon>
                    <n-icon :component="SparklesOutline"/>
                  </template>
                </n-button>
              </div>
            </div>
            <div class="composer-hint">
              {{ loading ? '生成中可点击停止' : 'Enter 生成 · Shift+Enter 换行' }}
            </div>
          </div>
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
  </div>
</template>

<style lang="scss" scoped>
.page {
  display: flex;
  height: 100%;
}

.image-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.session-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-select {
  width: 160px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.gallery {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px;
}

.empty {
  margin-top: 18vh;
  text-align: center;
  color: var(--text-3);
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 13px;
}

.msg {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  max-width: 900px;
}

.msg.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.role {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  font-size: 11px;
  flex-shrink: 0;
  background: rgba(124, 156, 255, 0.2);
  color: #c5d2ff;
}

.msg.user .role {
  background: rgba(52, 211, 153, 0.18);
  color: #9af0c9;
}

.msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  min-width: 0;
  max-width: min(720px, 78vw);
  width: fit-content;
}

.msg.user .msg-body {
  align-items: flex-end;
}

.bubble {
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  width: fit-content;
  max-width: 100%;
}

.msg.user .bubble {
  background: rgba(124, 156, 255, 0.14);
}

.msg.error .bubble {
  border-color: rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.user-bubble {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-text {
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.ref-thumb {
  img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-muted);
  }
}

.ai-bubble {
  /* 贴合缩略图，避免单图时气泡右侧留白 */
  min-width: 0;
  padding: 6px;
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 4px;
  color: var(--text-3);
  font-size: 13px;
}

.ai-error {
  padding: 8px 2px;
  font-size: 13px;
  line-height: 1.5;
  color: #fecaca;
}

.msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  color: var(--text-4);
}

.msg:hover .msg-actions,
.msg-actions:focus-within {
  opacity: 1;
}

.msg-actions :deep(.n-button) {
  color: var(--text-4);
}

.msg-actions :deep(.n-button:hover) {
  color: var(--text-2);
}

.page.mobile .msg-actions {
  opacity: 1;
}

.imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
}

.img-wrap {
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg);
  border: 1px solid var(--border-subtle);
  width: 148px;
  height: 148px;
  flex: 0 0 auto;
  max-width: 100%;

  .img-actions {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 999px;
    padding: 2px;
  }

  &:hover .img-actions {
    opacity: 1;
  }

  img {
    display: block;
    width: 100%;
    height: 148px;
    object-fit: cover;
    cursor: zoom-in;
    background: var(--color-bg);
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.96;
    }
  }
}

.page.mobile .img-wrap .img-actions {
  opacity: 1;
}

.composer {
  flex-shrink: 0;
  background: transparent;
  padding: 10px 18px 14px;
}

.composer-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(22, 24, 32, 0.92);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28),
  inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus-within {
    border-color: rgba(124, 156, 255, 0.45);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(124, 156, 255, 0.18);
  }
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--surface-3);
  border: 1px solid var(--border-muted);
}

.mode-item {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  line-height: 1;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;

  &.active {
    color: #fff;
    background: rgba(124, 156, 255, 0.28);
    box-shadow: inset 0 0 0 1px rgba(124, 156, 255, 0.35);
  }

  &:hover:not(.active) {
    color: rgba(255, 255, 255, 0.85);
  }
}

.opt-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.opt-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px 0 10px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border-muted);
}

.opt-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.opt-count :deep(.n-input-number) {
  width: 84px;
}

.opt-size :deep(.n-select),
.opt-quality :deep(.n-select) {
  width: 118px;
}

.opt-ratio :deep(.n-select) {
  width: 96px;
}

.upload-row {
  margin-bottom: 0;
}

.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border-muted);

  img {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: var(--radius-sm);
  }
}

.ref-name {
  font-size: 12px;
  color: var(--text-2);
}

.composer-input {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.composer-field {
  flex: 1;
  min-width: 0;

  :deep(.n-input) {
    --n-border: transparent !important;
    --n-border-hover: transparent !important;
    --n-border-focus: transparent !important;
    --n-color: transparent !important;
    --n-color-focus: transparent !important;
    --n-box-shadow: none !important;
    --n-font-size: 14px;
    --n-line-height: 1.55;
    --n-padding-vertical: 6px;
    --n-padding-left: 4px;
    --n-padding-right: 4px;
    background: transparent !important;
  }

  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    display: none;
  }

  :deep(.n-input__textarea-el),
  :deep(.n-input__placeholder) {
    padding: var(--n-padding-vertical) var(--n-padding-right) var(--n-padding-vertical) var(--n-padding-left) !important;
    font-size: var(--n-font-size);
    line-height: var(--n-line-height);
  }

  :deep(.n-input__textarea-el) {
    cursor: text;
    caret-color: var(--color-primary-hover);
    color: var(--text-1);
  }
}

.composer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
  min-width: 0;
}

.composer-hint {
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  color: var(--text-4);
}

.action-btn {
  border-radius: 999px !important;
  font-weight: 600;
}

.send-btn {
  width: 40px;
  height: 40px;
  box-shadow: 0 6px 16px rgba(124, 156, 255, 0.28);
}

.temp-tip {
  position: absolute;
  left: 6px;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  text-align: center;
  color: #fff;
  background: rgba(230, 162, 60, 0.9);
  pointer-events: none;
}

.lightbox-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 240px;
  max-height: 72vh;
  overflow: auto;
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  cursor: zoom-out;

  img {
    max-width: 100%;
    max-height: 72vh;
    object-fit: contain;
    border-radius: var(--radius-sm);
  }
}

.lightbox-footer {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1279.98px) {
  .gallery {
    padding: 14px 16px;
  }

  .bubble {
    max-width: min(720px, 86vw);
  }

  .img-wrap {
    width: 128px;
    height: 128px;
  }

  .img-wrap img {
    height: 128px;
  }
}

@media (max-width: 767.98px) {
  .toolbar {
    padding: 10px 12px;
    flex-wrap: wrap;
  }

  .right {
    width: 100%;
    flex-wrap: wrap;
  }

  .provider-select {
    flex: 1;
    width: auto;
    min-width: 120px;
  }

  .right :deep(.model-select) {
    flex: 1;
    width: auto;
    min-width: 140px;
  }

  .gallery {
    padding: 12px;
  }

  .msg {
    max-width: 100%;
  }

  .bubble {
    max-width: calc(100vw - 72px);
  }

  .composer {
    padding: 8px 12px 12px;
  }

  .composer-card {
    border-radius: 16px;
    padding: 10px;
  }

  .composer-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .mode-switch {
    width: 100%;
  }

  .mode-item {
    flex: 1;
    text-align: center;
  }

  .opt-group {
    width: 100%;
  }

  .opt-item {
    flex: 1 1 calc(50% - 8px);
    min-width: 140px;
  }

  .opt-item :deep(.n-select),
  .opt-item :deep(.n-input-number) {
    width: 100%;
    flex: 1;
  }

  .composer-input {
    flex-direction: column;
    align-items: stretch;
  }

  .composer-actions {
    flex-direction: row;
    justify-content: flex-end;
    min-width: 0;
  }

  .img-wrap img {
    max-height: min(48vh, 420px);
  }

  .lightbox-body {
    max-height: 70vh;

    img {
      max-height: 70vh;
    }
  }
}
</style>
