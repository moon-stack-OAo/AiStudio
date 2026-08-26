<script setup>
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {ImageOutline, ListOutline, TrashOutline} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'
import PolishModal from '@/components/PolishModal.vue'
import {useImageStore} from '@/stores/image'
import {useSettingsStore} from '@/stores/settings'
import {editImage, fileToPreview, generateImage} from '@/api/client'
import {cacheGeneratedImages, getImageObjectUrl} from '@/utils/imageCache'
import {imageStyleOptions, polishText} from '@/utils/polish'
import {useBreakpoints} from '@/composables/useBreakpoints'

const imageStore = useImageStore()
const settings = useSettingsStore()
const message = useMessage()
const { isMobile, isCompact } = useBreakpoints()
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

const polishing = ref(false)
const polishOpen = ref(false)
const polishOriginal = ref('')
const polishResult = ref('')
const polishStyle = ref('detail')
const prevBeforeReplace = ref(null)
const polishAbortRef = ref(null)

/** itemId -> imageIndex -> objectURL，用于 idb 图片展示 */
const resolvedMap = ref({})
const createdObjectUrls = new Set()

/** 大图预览 */
const lightboxShow = ref(false)
const lightboxSrc = ref('')
const lightboxTitle = ref('')
const lightboxPayload = ref(null)

const session = computed(() => imageStore.activeSession)
const provider = computed(() => settings.activeProvider)
const isXai = computed(() => provider.value?.provider === 'xai')
const busy = computed(() => loading.value || polishing.value)

const sizeOptions = [
  { label: '1024×1024', value: '1024x1024' },
  { label: '1024×1536', value: '1024x1536' },
  { label: '1536×1024', value: '1536x1024' },
]

const aspectOptions = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: 'auto', value: 'auto' },
]

const qualityOptions = [
  { label: '低质量', value: 'low' },
  { label: '标准', value: 'medium' },
  { label: '高质量', value: 'high' },
]

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

function ensureChatProvider() {
  if (!provider.value?.baseUrl || !provider.value?.apiKey) {
    message.warning('请先在设置中填写 Base URL 和 API Key')
    return false
  }
  if (!provider.value?.chatModel) {
    message.warning('请先设置对话模型（润色需使用对话模型）')
    return false
  }
  return true
}

async function runPolish(sourceText) {
  const text = String(sourceText || '').trim()
  if (!text || polishing.value) return
  if (!ensureChatProvider()) return

  polishing.value = true
  const controller = new AbortController()
  polishAbortRef.value = controller

  try {
    const result = await polishText(provider.value, {
      text,
      mode: 'image',
      style: polishStyle.value,
      signal: controller.signal,
    })
    polishResult.value = result
  } catch (err) {
    if (err?.name !== 'AbortError' && err?.message !== 'canceled') {
      message.error(err?.message || '润色失败')
    }
  } finally {
    polishing.value = false
    polishAbortRef.value = null
  }
}

async function openPolish() {
  const text = prompt.value.trim()
  if (!text || busy.value) return
  if (!ensureChatProvider()) return

  polishOriginal.value = text
  polishResult.value = ''
  polishOpen.value = true
  await runPolish(text)
}

async function rePolish() {
  const text = (polishResult.value || polishOriginal.value).trim()
  if (!text) return
  polishOriginal.value = text
  polishResult.value = ''
  await runPolish(text)
}

function applyPolish() {
  const next = polishResult.value.trim()
  if (!next) return
  prevBeforeReplace.value = prompt.value
  prompt.value = next
  polishOpen.value = false
}

function undoPolish() {
  if (prevBeforeReplace.value == null) return
  prompt.value = prevBeforeReplace.value
  prevBeforeReplace.value = null
}

function cancelPolish() {
  polishAbortRef.value?.abort()
  polishOpen.value = false
}

async function onUpload({ file }) {
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

async function resolveSessionImages(items = []) {
  const next = {}
  const used = new Set()

  for (const item of items) {
    const images = item.images || []
    next[item.id] = {}
    for (let idx = 0; idx < images.length; idx += 1) {
      const img = images[idx]
      if (img?.type !== 'idb' || !img.id) continue

      // 复用已解析的 URL，避免闪烁
      const prev = resolvedMap.value[item.id]?.[idx]
      if (prev) {
        next[item.id][idx] = prev
        used.add(prev)
        continue
      }

      try {
        const url = await getImageObjectUrl(img.id)
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

  // 回收不再使用的 object URL
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
  () => session.value?.items,
  (items) => {
    resolveSessionImages(items || [])
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  revokeAllObjectUrls()
})

async function generate() {
  const text = prompt.value.trim()
  if (!text) {
    message.warning('请输入提示词')
    return
  }
  if (!session.value || busy.value) return
  if (!ensureProvider()) return
  if (mode.value === 'img2img' && !imageFile.value) {
    message.warning('图生图请先上传参考图')
    return
  }

  loading.value = true
  prevBeforeReplace.value = null
  try {
    const rawImages =
      mode.value === 'txt2img'
        ? await generateImage(provider.value, {
            prompt: text,
            n: n.value,
            size: size.value,
            aspectRatio: aspectRatio.value,
            quality: quality.value,
          })
        : await editImage(provider.value, {
            prompt: text,
            imageFile: imageFile.value,
            n: n.value,
            size: size.value,
            aspectRatio: aspectRatio.value,
            quality: quality.value,
          })

    // 将 url / b64 写入 IndexedDB，会话只存引用
    const images = await cacheGeneratedImages(rawImages)
    const tempCount = images.filter((img) => img.temporary).length

    imageStore.addItem(session.value.id, {
      mode: mode.value,
      prompt: text,
      model: provider.value.imageModel,
      providerName: provider.value.name,
      images,
      refPreview: mode.value === 'img2img' ? previewUrl.value : '',
    })

    if (tempCount > 0) {
      message.warning(`生成成功，但有 ${tempCount} 张未缓存（临时链接，可能过期）`)
    } else {
      message.success(`生成成功，共 ${images.length} 张`)
    }
  } catch (err) {
    message.error(err.message || '生成失败')
  } finally {
    loading.value = false
  }
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
  lightboxPayload.value = { itemId: item.id, idx, img, name: `gen-${item.id}-${idx}.png` }
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
    // dataURL / blobURL 可直接下载；远程 URL 尝试拉取后再下
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
              <n-icon :component="ListOutline" />
            </template>
          </n-button>
          <div class="session-name">{{ session?.title || '生图' }}</div>
          <n-tag :bordered="false" size="small" type="success">
            {{ provider?.imageModel || '未设置模型' }}
          </n-tag>
        </div>
        <n-select
          :options="settings.providerOptions"
          :value="settings.activeProviderId"
          class="provider-select"
          size="small"
          @update:value="settings.setActiveProvider"
        />
      </div>

      <div class="content">
        <div class="gallery">
          <div v-if="!session?.items?.length" class="empty">
            <div class="empty-title">生成结果会显示在这里</div>
            <div class="empty-desc">在下方输入提示词开始创作</div>
          </div>

          <div v-for="item in session?.items || []" :key="item.id" class="card">
            <div class="card-meta">
              <n-tag :bordered="false" size="tiny">
                {{ item.mode === 'txt2img' ? '文生图' : '图生图' }}
              </n-tag>
              <span class="prompt">{{ item.prompt }}</span>
              <n-button
                v-if="item.images?.length"
                secondary
                size="tiny"
                type="primary"
                @click="downloadImage(item.id, 0, item.images[0], `gen-${item.id}-0.png`)"
              >
                下载原图
              </n-button>
              <n-button
                quaternary
                size="tiny"
                type="error"
                @click="imageStore.removeItem(session.id, item.id)"
              >
                删除
              </n-button>
            </div>
            <div class="imgs">
              <div v-for="(img, idx) in item.images" :key="img.id || idx" class="img-wrap">
                <div v-if="item.images.length > 1" class="img-actions">
                  <n-button
                    secondary
                    size="tiny"
                    @click.stop="downloadImage(item.id, idx, img, `gen-${item.id}-${idx}.png`)"
                  >
                    下载
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

        <div class="composer">
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
                <n-input-number v-model:value="n" :max="4" :min="1" size="small" />
              </label>
              <label v-if="!isXai" class="opt-item opt-size">
                <span class="opt-label">尺寸</span>
                <n-select v-model:value="size" :options="sizeOptions" size="small" />
              </label>
              <label v-else class="opt-item opt-ratio">
                <span class="opt-label">比例</span>
                <n-select v-model:value="aspectRatio" :options="aspectOptions" size="small" />
              </label>
              <label class="opt-item opt-quality">
                <span class="opt-label">质量</span>
                <n-select v-model:value="quality" :options="qualityOptions" size="small" />
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
                  <n-icon :component="ImageOutline" />
                </template>
                上传参考图
              </n-button>
            </n-upload>
            <div v-else class="ref-chip">
              <img :src="previewUrl" alt="reference" />
              <span class="ref-name">参考图已选</span>
              <n-button quaternary size="tiny" @click="clearUpload">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
              </n-button>
            </div>
          </div>

          <div class="composer-input">
            <n-input
              v-model:value="prompt"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :disabled="busy"
              placeholder="描述你想生成的画面…"
              type="textarea"
            />
            <div class="composer-actions">
              <n-button
                v-if="prevBeforeReplace != null"
                quaternary
                size="large"
                @click="undoPolish"
              >
                撤销润色
              </n-button>
              <n-button
                :disabled="!prompt.trim() || busy"
                :loading="polishing"
                quaternary
                size="large"
                @click="openPolish"
              >
                润色
              </n-button>
              <n-button
                :disabled="!prompt.trim() || busy"
                :loading="loading"
                size="large"
                type="primary"
                @click="generate"
              >
                {{ mode === 'txt2img' ? '生成' : '图生图' }}
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PolishModal
      v-model:show="polishOpen"
      v-model:style-value="polishStyle"
      :loading="polishing"
      :original="polishOriginal"
      :polished="polishResult"
      :style-options="imageStyleOptions"
      @cancel="cancelPolish"
      @replace="applyPolish"
      @repolish="rePolish"
    />

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
        <img v-if="lightboxSrc" :src="lightboxSrc" alt="preview" />
      </div>
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
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.left {
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
  width: 180px;
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
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
}

.empty-title {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
}

.card {
  margin-bottom: 22px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.prompt {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imgs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
  gap: 14px;
}

.img-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0b0d12;
  border: 1px solid rgba(255, 255, 255, 0.06);

  .img-actions {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 2;
  }

  img {
    display: block;
    width: 100%;
    max-height: min(68vh, 760px);
    aspect-ratio: auto;
    object-fit: contain;
    cursor: zoom-in;
    background: #0b0d12;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.96;
    }
  }
}

.composer {
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(12, 14, 20, 0.92);
  padding: 12px 18px 16px;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-item {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  line-height: 1;
  padding: 8px 14px;
  border-radius: 8px;
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
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.opt-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
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
  margin-bottom: 10px;
}

.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);

  img {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 8px;
  }
}

.ref-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.composer-input {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.composer-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: flex-end;
}

@media (max-width: 1279.98px) {
  .gallery {
    padding: 14px 16px;
  }

  .imgs {
    grid-template-columns: 1fr;
  }

  .img-wrap img {
    max-height: min(62vh, 640px);
  }
}

@media (max-width: 767.98px) {
  .toolbar {
    padding: 10px 12px;
    flex-wrap: wrap;
  }

  .provider-select {
    width: 100%;
  }

  .gallery {
    padding: 12px;
  }

  .card {
    padding: 10px;
  }

  .card-meta {
    flex-wrap: wrap;
  }

  .prompt {
    flex-basis: 100%;
    order: 3;
  }

  .composer {
    padding: 10px 12px 12px;
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
    justify-content: flex-end;
  }

  .img-wrap img {
    max-height: min(55vh, 480px);
  }

  .lightbox-body {
    max-height: 70vh;

    img {
      max-height: 70vh;
    }
  }
}

.temp-tip {
  position: absolute;
  left: 6px;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 6px;
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
  background: #0b0d12;
  border-radius: 12px;
  cursor: zoom-out;

  img {
    max-width: 100%;
    max-height: 72vh;
    object-fit: contain;
    border-radius: 8px;
  }
}
</style>
