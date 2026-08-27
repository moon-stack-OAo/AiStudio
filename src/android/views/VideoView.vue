<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {
  AddOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  ImageOutline,
  ListOutline,
  OptionsOutline,
  RefreshOutline,
  SparklesOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import ModelSelect from '@/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@/components/ComposerSendStop.vue'
import {useVideoStore} from '@core/stores/video'
import {useSettingsStore} from '@core/stores/settings'
import {fileToPreview} from '@core/api/client'
import {useVideoGeneration} from '@core/composables/useVideoGeneration'
import {appFetch} from '@core/utils/http'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {isDesktopTauri} from '@core/utils/request'
import {renderSelectLabel} from '@core/utils/selectRender'

const videoStore = useVideoStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const {copiedId, copyText} = useCopyFeedback()
const {generating, runGenerate} = useVideoGeneration()

const mode = ref('txt2video')
const prompt = ref('')
const seconds = ref(8)
const size = ref('1280x720')
const aspectRatio = ref('16:9')
const imageFile = ref(null)
const previewUrl = ref('')

const listRef = ref(null)
const abortRef = ref(null)
const pendingItemId = ref('')
const generatingSessionId = ref(null)
const mounted = ref(true)
const resumeAbortRef = ref(null)

/** 当前会话内图生视频参考缩略图（不持久化大图） */
const refThumbMap = ref({})
/** video 元素加载失败的 itemId */
const videoErrorIds = ref({})

const paramsDrawerShow = ref(false)
const moreShow = ref(false)

const session = computed(() => videoStore.activeSession)
const provider = computed(() => settings.activeProvider)
const isXai = computed(() => provider.value?.provider === 'xai')
const isGeneratingCurrent = computed(
  () => generating.value && generatingSessionId.value === session.value?.id,
)

const canGenerate = computed(() => {
  if (!prompt.value.trim() || isGeneratingCurrent.value) return false
  if (mode.value === 'img2video' && !imageFile.value) return false
  return true
})

const timelineItems = computed(() => {
  const items = session.value?.items || []
  return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
})

const sizeOptionsDesktop = [
  {label: '1280×720', value: '1280x720'},
  {label: '720×1280', value: '720x1280'},
  {label: '1792×1024', value: '1792x1024'},
  {label: '1024×1792', value: '1024x1792'},
]

const aspectOptions = [
  {label: '16:9', value: '16:9'},
  {label: '9:16', value: '9:16'},
  {label: '1:1', value: '1:1'},
  {label: '4:3', value: '4:3'},
  {label: '3:4', value: '3:4'},
]

const durationOptionsOpenAi = [
  {label: '4 秒', value: 4},
  {label: '8 秒', value: 8},
  {label: '12 秒', value: 12},
]

const durationOptionsXai = Array.from({length: 15}, (_, i) => ({
  label: `${i + 1} 秒`,
  value: i + 1,
}))

const durationOptions = computed(() =>
  isXai.value ? durationOptionsXai : durationOptionsOpenAi,
)

const modeLabel = computed(() => (mode.value === 'img2video' ? '图生视频' : '文生视频'))

const sizeLabel = computed(() => {
  if (isXai.value) {
    return aspectOptions.find((o) => o.value === aspectRatio.value)?.label || aspectRatio.value
  }
  return sizeOptionsDesktop.find((o) => o.value === size.value)?.label || size.value
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

const sessionTitle = computed(() => session.value?.title || '生视频')

function itemStatus(item) {
  return item?.status || 'success'
}

function paramSummary(item) {
  const parts = []
  const p = item?.params || {}
  const sec = p.seconds ?? p.duration
  if (sec != null && sec !== '') parts.push(`${sec} 秒`)
  if (p.size) parts.push(String(p.size).replace('x', '×'))
  if (p.aspectRatio) parts.push(p.aspectRatio)
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

async function setReferenceFromFile(file, {notify = true} = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    if (notify) message.warning('请提供图片文件')
    return false
  }
  imageFile.value = file
  previewUrl.value = await fileToPreview(file)
  mode.value = 'img2video'
  if (notify) message.success('已设为参考图，可继续图生视频')
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
    videoErrorIds.value = {}
  },
)

watch(isXai, (xai) => {
  if (xai) {
    if (seconds.value < 1 || seconds.value > 15) seconds.value = 8
  } else if (![4, 8, 12].includes(seconds.value)) {
    seconds.value = 8
  }
})

function scrollToBottom() {
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function scheduleScrollToBottom() {
  nextTick(() => {
    scrollToBottom()
    window.setTimeout(scrollToBottom, 180)
    window.setTimeout(scrollToBottom, 360)
  })
}

function getProviderById(id) {
  if (!id) return null
  return settings.providers.find((p) => p.id === id) || null
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
  const controller = new AbortController()
  resumeAbortRef.value = controller
  videoStore
    .resumePendingJobs(getProviderById, {signal: controller.signal})
    .catch((e) => {
      if (e?.name === 'AbortError') return
      console.warn('[video] resumePendingJobs', e)
    })
})

onBeforeUnmount(() => {
  mounted.value = false
  window.removeEventListener('paste', onPaste)
  abortRef.value?.abort()
  resumeAbortRef.value?.abort()
})

function onComposerFocus() {
  scheduleScrollToBottom()
}

async function generate() {
  const text = prompt.value.trim()
  if (!text) {
    message.warning('请输入提示词')
    return
  }
  if (!session.value || generating.value) return
  if (!ensureProvider()) return
  if (mode.value === 'img2video' && !imageFile.value) {
    message.warning('图生视频请先上传参考图')
    return
  }

  const sessionId = session.value.id
  abortRef.value?.abort()
  const controller = new AbortController()
  abortRef.value = controller

  const savedPrompt = text
  const savedMode = mode.value
  const savedFile = imageFile.value
  const savedPreview = previewUrl.value

  prompt.value = ''
  generatingSessionId.value = sessionId

  const itemsBefore = new Set((session.value?.items || []).map((i) => i.id))

  await nextTick()
  scrollToBottom()

  try {
    const result = await runGenerate(provider.value, sessionId, {
      prompt: savedPrompt,
      mode: savedMode,
      imageFile: savedMode === 'img2video' ? savedFile : undefined,
      seconds: seconds.value,
      duration: seconds.value,
      size: isXai.value ? undefined : size.value,
      aspectRatio: isXai.value ? aspectRatio.value : undefined,
      signal: controller.signal,
    })

    const newItemId =
      result?.itemId ||
      (session.value?.items || []).find((i) => !itemsBefore.has(i.id))?.id
    if (savedMode === 'img2video' && savedPreview && newItemId) {
      refThumbMap.value = {...refThumbMap.value, [newItemId]: savedPreview}
    }

    if (!mounted.value) return
    if (controller.signal.aborted) return

    message.success('视频生成成功')
    await nextTick()
    if (videoStore.activeId === sessionId) scrollToBottom()
  } catch (err) {
    const newItemId = (session.value?.items || []).find((i) => !itemsBefore.has(i.id))?.id
    if (savedMode === 'img2video' && savedPreview && newItemId) {
      refThumbMap.value = {...refThumbMap.value, [newItemId]: savedPreview}
    }
    if (err?.name === 'AbortError' || err?.message === 'canceled' || controller.signal.aborted) {
      return
    }
    if (!mounted.value) return
    message.error(err?.message || '生成失败')
  } finally {
    if (abortRef.value === controller) abortRef.value = null
    if (generatingSessionId.value === sessionId) {
      generatingSessionId.value = null
    }
    pendingItemId.value = ''
  }
}

function abortIfLeavingGenerate(nextId) {
  if (!generating.value || !generatingSessionId.value) return
  if (nextId != null && generatingSessionId.value === nextId) return
  abortRef.value?.abort()
}

function selectSession(id) {
  abortIfLeavingGenerate(id)
  videoStore.setActive(id)
}

function createSession() {
  abortIfLeavingGenerate(null)
  videoStore.createSession()
}

function removeSession(id) {
  if (generating.value && generatingSessionId.value === id) {
    abortRef.value?.abort()
  }
  videoStore.removeSession(id)
}

function stopGenerate() {
  if (!generating.value) return
  abortRef.value?.abort()
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
    onPositiveClick: () => videoStore.clearItems(session.value.id),
  })
}

function onVideoError(itemId) {
  videoErrorIds.value = {...videoErrorIds.value, [itemId]: true}
}

function isVideoBroken(item) {
  return Boolean(videoErrorIds.value[item?.id]) || !item?.videoUrl
}

function triggerAnchorDownload(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  a.click()
}

async function srcToBlob(src) {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }
  const res = await appFetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

async function downloadVideo(item, name) {
  const src = item?.videoUrl
  if (!src) {
    message.warning('视频不可用，请重新生成')
    return
  }
  const fileName = name || `video-${item.id}.mp4`
  const mobileLike = !isDesktopTauri()

  try {
    const blob = await srcToBlob(src)
    const file = new File([blob], fileName, {type: blob.type || 'video/mp4'})

    if (
      mobileLike &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function'
    ) {
      try {
        if (navigator.canShare({files: [file]})) {
          await navigator.share({files: [file], title: fileName})
          message.success('已分享视频')
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerAnchorDownload(objectUrl, fileName)
      if (mobileLike) message.success('已开始下载')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    } catch {
      window.open(objectUrl, '_blank', 'noopener')
      message.warning('下载失败，已尝试在新窗口打开')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
  } catch {
    try {
      triggerAnchorDownload(src, fileName)
      if (mobileLike) message.success('已开始下载')
    } catch {
      window.open(src, '_blank', 'noopener')
      message.warning('下载失败，已尝试在新窗口打开')
    }
  }
}

async function retryItem(item) {
  if (!item || generating.value) return
  if (!ensureProvider()) return
  if (!session.value) return

  const sessionId = session.value.id
  const text = String(item.prompt || '').trim()
  if (!text) {
    message.warning('缺少提示词，无法重试')
    return
  }

  const itemMode = item.mode || 'txt2video'
  if (itemMode === 'img2video') {
    message.warning('图生视频需重新上传参考图后再生成')
    mode.value = 'img2video'
    prompt.value = text
    return
  }

  abortRef.value?.abort()
  const controller = new AbortController()
  abortRef.value = controller
  generatingSessionId.value = sessionId

  const p = item.params || {}
  try {
    await runGenerate(provider.value, sessionId, {
      prompt: text,
      mode: 'txt2video',
      seconds: p.seconds ?? p.duration ?? seconds.value,
      duration: p.seconds ?? p.duration ?? seconds.value,
      size: p.size || size.value,
      aspectRatio: p.aspectRatio || aspectRatio.value,
      signal: controller.signal,
    })
    if (!mounted.value || controller.signal.aborted) return
    message.success('视频生成成功')
    await nextTick()
    if (videoStore.activeId === sessionId) scrollToBottom()
  } catch (err) {
    if (err?.name === 'AbortError' || controller.signal.aborted) return
    if (!mounted.value) return
    message.error(err?.message || '重试失败')
  } finally {
    if (abortRef.value === controller) abortRef.value = null
    if (generatingSessionId.value === sessionId) generatingSessionId.value = null
  }
}

const sendTooltip = computed(() =>
  mode.value === 'img2video' && !imageFile.value ? '请先上传参考图' : '生成',
)

const emptyDesc = computed(() => {
  if (!provider.value?.videoModel) {
    return '请先在设置中配置视频模型（videoModel），再输入提示词生成'
  }
  return '在下方输入提示词，生成结果将以时间线展示'
})
</script>

<template>
  <SessionWorkspaceShell
    :active-id="videoStore.activeId"
    :history-title="'生视频历史'"
    :sessions="videoStore.sortedSessions"
    @create="createSession"
    @remove="removeSession"
    @rename="(id, title) => videoStore.renameSession(id, title)"
    @select="selectSession"
  >
    <template #toolbar="{ openHistory }">
      <div class="video-toolbar">
        <n-button
          aria-label="打开会话列表"
          circle
          class="touch-target"
          quaternary
          @click="openHistory"
        >
          <template #icon>
            <n-icon :component="ListOutline"/>
          </template>
        </n-button>

        <div class="video-title">{{ sessionTitle }}</div>

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

    <div class="content">
      <div ref="listRef" class="gallery">
        <div v-if="!timelineItems.length" class="empty">
          <div class="empty-title">开始创作</div>
          <div class="empty-desc">{{ emptyDesc }}</div>
        </div>

        <template v-for="item in timelineItems" :key="item.id">
          <div class="msg user">
            <div class="role">你</div>
            <div class="msg-body">
              <div class="bubble user-bubble">
                <div class="bubble-tags">
                  <n-tag :bordered="false" size="tiny">
                    {{ item.mode === 'img2video' ? '图生视频' : '文生视频' }}
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
                  v-if="item.mode === 'img2video' && (refThumbMap[item.id] || item.refPreview)"
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
                <div
                  v-if="itemStatus(item) === 'loading' || itemStatus(item) === 'pending_resume'"
                  class="ai-loading"
                >
                  <n-spin size="small"/>
                  <div class="loading-meta">
                    <span>
                      {{
                        itemStatus(item) === 'pending_resume'
                          ? '等待恢复…'
                          : '生成中…'
                      }}
                    </span>
                    <n-progress
                      v-if="item.progress != null && item.progress > 0"
                      :percentage="Math.min(100, Math.round(Number(item.progress) || 0))"
                      :show-indicator="true"
                      processing
                      type="line"
                      class="video-progress"
                    />
                    <span v-else-if="item.progress != null" class="progress-text">
                      {{ Math.round(Number(item.progress) || 0) }}%
                    </span>
                  </div>
                </div>
                <div v-else-if="itemStatus(item) === 'error'" class="ai-error-block">
                  <div class="ai-error">{{ item.errorMessage || '生成失败' }}</div>
                  <n-button
                    size="tiny"
                    secondary
                    :disabled="generating"
                    class="retry-btn"
                    @click="retryItem(item)"
                  >
                    <template #icon>
                      <n-icon :component="RefreshOutline" :size="14"/>
                    </template>
                    重试
                  </n-button>
                </div>
                <div v-else-if="!item.videoUrl || isVideoBroken(item)" class="ai-error-block">
                  <div class="ai-error">
                    {{
                      item.videoUrl
                        ? '视频链接已失效，请重新生成'
                        : (item.errorMessage || '暂无视频')
                    }}
                  </div>
                  <n-button
                    size="tiny"
                    secondary
                    :disabled="generating"
                    class="retry-btn"
                    @click="retryItem(item)"
                  >
                    <template #icon>
                      <n-icon :component="RefreshOutline" :size="14"/>
                    </template>
                    重试
                  </n-button>
                </div>
                <div v-else class="video-wrap">
                  <div class="video-actions">
                    <n-button
                      circle
                      quaternary
                      size="tiny"
                      aria-label="下载视频"
                      class="touch-target"
                      @click.stop="downloadVideo(item, `video-${item.id}.mp4`)"
                    >
                      <template #icon>
                        <n-icon :component="DownloadOutline" :size="14"/>
                      </template>
                    </n-button>
                  </div>
                  <video
                    :src="item.videoUrl"
                    controls
                    playsinline
                    preload="metadata"
                    class="video-player"
                    @error="onVideoError(item.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

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
            v-if="mode === 'img2video' && previewUrl"
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
              placeholder="描述画面与运动…"
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
    </div>

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
                :class="{ active: mode === 'txt2video' }"
                class="mode-item"
                type="button"
                @click="mode = 'txt2video'"
              >
                文生视频
              </button>
              <button
                :class="{ active: mode === 'img2video' }"
                class="mode-item"
                type="button"
                @click="mode = 'img2video'"
              >
                图生视频
              </button>
            </div>
          </div>

          <div v-if="mode === 'img2video'" class="params-section">
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
              <p class="ref-compress-hint">参考图会自动压缩后上传，建议不超过 4K 原图</p>
            </div>
          </div>

          <div class="params-grid">
            <div class="params-section">
              <div class="params-label">时长</div>
              <n-select
                v-model:value="seconds"
                :options="durationOptions"
                :render-label="renderSelectLabel"
                class="params-control"
                size="medium"
              />
            </div>

            <div class="params-section params-section-full">
              <div class="params-label">{{ isXai ? '比例' : '画幅' }}</div>
              <n-select
                v-if="!isXai"
                v-model:value="size"
                :options="sizeOptionsDesktop"
                :render-label="renderSelectLabel"
                class="params-control"
                size="medium"
              />
              <n-select
                v-else
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
  </SessionWorkspaceShell>

  <n-drawer
    v-model:show="moreShow"
    height="auto"
    placement="bottom"
  >
    <n-drawer-content closable title="生视频设置">
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
          <ModelSelect kind="video" sheet size="medium"/>
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
</template>

<style lang="scss" scoped src="./VideoView.scss"></style>
