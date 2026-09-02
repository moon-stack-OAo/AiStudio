<script setup>
defineOptions({name: 'VideoView'})

import {computed, ref, watch} from 'vue'
import {
  DownloadOutline,
  ImageOutline,
  OptionsOutline,
  RefreshOutline,
  SparklesOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import PromptAssist from '@core/components/PromptAssist.vue'
import PromptEnhanceButton from '@core/components/PromptEnhanceButton.vue'
import PromptBuilderCollapse from '@core/components/PromptBuilderCollapse.vue'
import GenerateComposerCard from '@/components/generate/GenerateComposerCard.vue'
import GenerateParamsDrawer from '@/components/generate/GenerateParamsDrawer.vue'
import GenerateParamsPanel from '@/components/generate/GenerateParamsPanel.vue'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import {useVideoSession} from '@core/composables/useVideoSession'
import {
  downloadMediaBlob,
  resolveVideoDownloadSrc,
  resolveVideoFallbackSrc,
} from '@core/composables/useMediaDownload'
import {useManualDropdown} from '@/composables/useManualDropdown'
import {getPromptPlaceholder} from '@core/prompts'
import {renderSelectLabel} from '@core/utils/selectRender'

const {isMobile, isCompact, isWide} = useBreakpoints()
const {tooltipTrigger} = useTooltipTrigger()
const {
  videoStore,
  settings,
  message,
  gen,
  mode,
  prompt,
  seconds,
  size,
  aspectRatio,
  resolution,
  previewUrl,
  listRef,
  bottomRef,
  lightboxShow,
  lightboxSrc,
  lightboxTitle,
  session,
  showSize,
  showAspectRatio,
  showResolution,
  isGeneratingCurrent,
  canGenerate,
  resumeItem,
  abandonPendingItem,
  timelineItems,
  sizeOptions: sizeOptionsDesktop,
  aspectOptions,
  durationOptions,
  resolutionOptions,
  paramsSummary,
  drawerHeight,
  sendTooltip,
  emptyDesc,
  itemStatus,
  paramSummary,
  onUpload,
  clearUpload,
  generate,
  stopGenerate,
  selectSession,
  createSession,
  removeSession,
  copyErrorText,
  clearItems,
  onVideoError,
  isVideoBroken,
  canReloadVideo,
  reloadVideo,
  videoPlaybackErrorText,
  retryItem,
  onComposerFocus,
  closeLightbox,
} = useVideoSession()

const paramsDrawerShow = ref(false)
const selectedTaskId = ref(null)
const useStudioSplit = computed(() => isWide.value)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('video', mode.value, {isMobile: isMobile.value}),
)

const queueItems = computed(() => [...timelineItems.value].reverse())

const selectedItem = computed(() => {
  const items = timelineItems.value
  if (!items.length) return null
  if (selectedTaskId.value) {
    const found = items.find((i) => i.id === selectedTaskId.value)
    if (found) return found
  }
  const running = [...items].reverse().find((i) => itemStatus(i) === 'loading')
  if (running) return running
  return items[items.length - 1]
})

watch(
  () => session.value?.id,
  () => {
    selectedTaskId.value = null
  },
)

watch(
  timelineItems,
  (items) => {
    if (!items?.length) {
      selectedTaskId.value = null
      return
    }
    if (selectedTaskId.value && items.some((i) => i.id === selectedTaskId.value)) return
    const running = [...items].reverse().find((i) => itemStatus(i) === 'loading')
    selectedTaskId.value = (running || items[items.length - 1]).id
  },
  {immediate: true},
)

const previewStatus = computed(() => {
  const item = selectedItem.value
  if (!item) return {kind: 'empty', label: '等待任务', pill: ''}
  const status = itemStatus(item)
  if (status === 'loading') {
    const p = item.progress != null ? Math.min(100, Math.round(Number(item.progress) || 0)) : null
    return {
      kind: 'loading',
      label: p != null ? `生成预览 · ${p}%` : '生成中…',
      pill: 'run',
      progress: p,
      title: taskTitle(item),
    }
  }
  if (status === 'pending_resume') {
    return {
      kind: 'pending',
      label: '待恢复',
      pill: '',
      title: taskTitle(item),
      message: item.errorMessage || '任务未完成，可恢复轮询或放弃',
    }
  }
  if (status === 'error') {
    return {
      kind: 'error',
      label: '失败',
      pill: 'err',
      title: taskTitle(item),
      message: item.errorMessage || '生成失败',
    }
  }
  if (!item.videoUrl || isVideoBroken(item)) {
    return {
      kind: 'error',
      label: '不可播放',
      pill: 'err',
      title: taskTitle(item),
      message: videoPlaybackErrorText(item),
    }
  }
  return {
    kind: 'ready',
    label: '完成',
    pill: 'ok',
    title: taskTitle(item),
    progress: 100,
  }
})

function taskTitle(item) {
  const text = String(item?.prompt || '').trim()
  if (text) return text.length > 36 ? `${text.slice(0, 36)}…` : text
  return item?.mode === 'img2video' ? '图生视频' : '文生视频'
}

function taskStatusMeta(item) {
  const status = itemStatus(item)
  if (status === 'loading') {
    const p = item.progress != null ? Math.min(100, Math.round(Number(item.progress) || 0)) : null
    return {
      pill: 'run',
      pillText: p != null ? `进行中 ${p}%` : '进行中',
      meta: paramSummary(item) || '预计稍后完成',
    }
  }
  if (status === 'pending_resume') {
    return {pill: '', pillText: '待恢复', meta: item.errorMessage || '可恢复轮询'}
  }
  if (status === 'error') {
    return {pill: 'err', pillText: '失败', meta: item.errorMessage || '生成失败'}
  }
  if (!item.videoUrl || isVideoBroken(item)) {
    return {pill: 'err', pillText: '失败', meta: videoPlaybackErrorText(item)}
  }
  return {pill: 'ok', pillText: '完成', meta: paramSummary(item) || '可下载 MP4'}
}

const {
  show: ctxShow,
  x: ctxX,
  y: ctxY,
  options: ctxOptions,
  open: openCtxMenu,
  handleSelect: onCtxSelect,
  handleUpdateShow: onCtxUpdateShow,
  handleClickOutside: onCtxClickOutside,
} = useManualDropdown()

function onApplyPrompt(text) {
  prompt.value = text
}

function onKeydown(e) {
  if (isMobile.value) return
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    generate()
  }
}

async function downloadVideo(item, name) {
  const src = resolveVideoDownloadSrc(item)
  if (!src) {
    message.warning('视频不可用，请重新生成')
    return
  }
  await downloadMediaBlob({
    src,
    fileName: name || `video-${item.id}.mp4`,
    message,
    opts: {
      defaultMime: 'video/mp4',
      mobileOpenHint: '下载失败，已尝试在新窗口打开',
      fallbackSrc: resolveVideoFallbackSrc(item),
    },
  })
}

function selectTask(item) {
  selectedTaskId.value = item?.id || null
}

function onTaskContextMenu(e, item) {
  const status = itemStatus(item)
  if (status === 'loading') return

  const options = []
  if (status === 'pending_resume') {
    options.push({label: '恢复轮询', key: 'resume', disabled: gen.busy})
    options.push({label: '放弃', key: 'abandon'})
    if (item?.errorMessage) options.push({label: '复制错误信息', key: 'copy-error'})
  } else if (status === 'error' || isVideoBroken(item)) {
    options.push({label: '复制错误信息', key: 'copy-error'})
    if (canReloadVideo(item)) options.push({label: '重新加载', key: 'reload'})
    options.push({label: '重试', key: 'retry', disabled: gen.busy})
  } else if (resolveVideoDownloadSrc(item)) {
    options.push({label: '下载', key: 'download'})
  }
  if (!options.length) return

  openCtxMenu(e, options, (key) => {
    if (key === 'copy-error') copyErrorText(item)
    else if (key === 'reload') reloadVideo(item)
    else if (key === 'retry') retryItem(item)
    else if (key === 'resume') resumeItem(item)
    else if (key === 'abandon') abandonPendingItem(item)
    else if (key === 'download') downloadVideo(item, `video-${item.id}.mp4`)
  })
}
</script>

<template>
  <SessionWorkspaceShell
    :active-id="videoStore.activeId"
    :history-title="'生视频历史'"
    :is-compact="isCompact"
    :is-mobile="isMobile"
    :session-title="session?.title || '生视频'"
    :sessions="videoStore.sortedSessions"
    @create="createSession"
    @remove="removeSession"
    @rename="(id, title) => videoStore.renameSession(id, title)"
    @select="selectSession"
  >
    <template #toolbar-right>
      <ModelSelect kind="video" />
      <n-select
        :options="settings.providerOptions"
        :render-label="renderSelectLabel"
        :value="settings.activeProviderId"
        class="provider-select provider-select-muted"
        size="small"
        @update:value="settings.setActiveProvider"
      />
      <n-button
        :disabled="!session?.items?.length"
        aria-label="清空任务"
        quaternary
        size="small"
        class="toolbar-clear"
        @click="clearItems"
      >
        清空
      </n-button>
    </template>

    <div :class="['content', {'gen-split': useStudioSplit}]">
      <div ref="listRef" class="video-stage">
        <template v-if="useStudioSplit">
          <div class="preview-card">
            <div class="preview-frame">
              <template v-if="previewStatus.kind === 'ready' && selectedItem?.videoUrl">
                <div class="preview-video-wrap">
                  <div class="video-actions">
                    <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                      <template #trigger>
                        <n-button
                          circle
                          quaternary
                          size="tiny"
                          aria-label="下载视频"
                          class="touch-target"
                          @click.stop="downloadVideo(selectedItem, `video-${selectedItem.id}.mp4`)"
                        >
                          <template #icon>
                            <n-icon :component="DownloadOutline" :size="14" />
                          </template>
                        </n-button>
                      </template>
                      下载
                    </n-tooltip>
                  </div>
                  <video
                    :key="`${selectedItem.id}:${selectedItem.videoUrl || ''}`"
                    :src="selectedItem.videoUrl"
                    controls
                    playsinline
                    preload="auto"
                    class="video-player preview-player"
                    @error="onVideoError(selectedItem.id)"
                  />
                </div>
              </template>
              <template v-else-if="previewStatus.kind === 'loading'">
                <div class="preview-ring" aria-hidden="true" />
                <div class="preview-status-float">
                  <span class="status-pill run">{{ previewStatus.label }}</span>
                </div>
              </template>
              <template
                v-else-if="previewStatus.kind === 'error' || previewStatus.kind === 'pending'"
              >
                <div class="preview-error">
                  <div class="preview-error-title">{{ previewStatus.label }}</div>
                  <div class="preview-error-desc">{{ previewStatus.message }}</div>
                  <div class="error-actions">
                    <n-button
                      v-if="previewStatus.kind === 'pending'"
                      :disabled="gen.busy"
                      secondary
                      size="tiny"
                      type="primary"
                      @click="resumeItem(selectedItem)"
                    >
                      恢复轮询
                    </n-button>
                    <n-button
                      v-if="previewStatus.kind === 'pending'"
                      secondary
                      size="tiny"
                      @click="abandonPendingItem(selectedItem)"
                    >
                      放弃
                    </n-button>
                    <n-button
                      v-if="previewStatus.kind === 'error'"
                      secondary
                      size="tiny"
                      @click="copyErrorText(selectedItem)"
                    >
                      复制错误
                    </n-button>
                    <n-button
                      v-if="previewStatus.kind === 'error' && canReloadVideo(selectedItem)"
                      secondary
                      size="tiny"
                      @click="reloadVideo(selectedItem)"
                    >
                      <template #icon>
                        <n-icon :component="RefreshOutline" :size="14" />
                      </template>
                      重新加载
                    </n-button>
                    <n-button
                      v-if="previewStatus.kind === 'error'"
                      :disabled="gen.busy"
                      secondary
                      size="tiny"
                      @click="retryItem(selectedItem)"
                    >
                      <template #icon>
                        <n-icon :component="RefreshOutline" :size="14" />
                      </template>
                      重试
                    </n-button>
                  </div>
                </div>
              </template>
              <div v-else class="preview-frame-empty">选择或提交一条视频任务</div>
            </div>
            <div class="preview-meta">
              <strong class="preview-meta-title">{{ previewStatus.title || '视频预览' }}</strong>
              <span v-if="previewStatus.pill" :class="['status-pill', previewStatus.pill]">
                {{ previewStatus.label }}
              </span>
              <span v-else-if="previewStatus.progress != null" class="preview-meta-pct">
                {{ previewStatus.progress }}%
              </span>
            </div>
            <div
              v-if="previewStatus.kind === 'loading' && previewStatus.progress != null"
              class="preview-progress"
              :style="{'--p': `${previewStatus.progress}%`}"
            >
              <span />
            </div>
          </div>

          <div class="section-label">任务队列</div>
          <div v-if="!queueItems.length" class="empty empty-state gallery-empty">
            <div class="empty-art" aria-hidden="true">▶</div>
            <div class="empty-title">开始创作</div>
            <div class="empty-desc">{{ emptyDesc.replace('时间线', '任务队列') }}</div>
          </div>
          <div v-else class="task-list">
            <button
              v-for="item in queueItems"
              :key="item.id"
              type="button"
              :class="['task-item', {'is-active': selectedItem?.id === item.id}]"
              @click="selectTask(item)"
              @contextmenu="onTaskContextMenu($event, item)"
            >
              <strong class="task-item-title">{{ taskTitle(item) }}</strong>
              <span :class="['status-pill', taskStatusMeta(item).pill]">
                {{ taskStatusMeta(item).pillText }}
              </span>
              <span class="task-item-meta">{{ taskStatusMeta(item).meta }}</span>
              <div
                v-if="
                  itemStatus(item) === 'error' ||
                  itemStatus(item) === 'pending_resume' ||
                  isVideoBroken(item)
                "
                class="task-item-actions"
                @click.stop
              >
                <n-button
                  v-if="itemStatus(item) === 'pending_resume'"
                  :disabled="gen.busy"
                  secondary
                  size="tiny"
                  type="primary"
                  @click="resumeItem(item)"
                >
                  恢复
                </n-button>
                <n-button
                  v-if="itemStatus(item) === 'error' || isVideoBroken(item)"
                  :disabled="gen.busy"
                  secondary
                  size="tiny"
                  @click="retryItem(item)"
                >
                  重试
                </n-button>
              </div>
            </button>
          </div>
        </template>

        <template v-else>
          <div v-if="!timelineItems.length" class="empty empty-state">
            <div class="empty-art" aria-hidden="true">◇</div>
            <div class="empty-title">开始创作</div>
            <div class="empty-desc">{{ emptyDesc }}</div>
          </div>

          <template v-for="item in timelineItems" :key="item.id">
            <div class="compact-task-card" @contextmenu="onTaskContextMenu($event, item)">
              <div class="compact-task-head">
                <strong class="task-item-title">{{ taskTitle(item) }}</strong>
                <span :class="['status-pill', taskStatusMeta(item).pill]">
                  {{ taskStatusMeta(item).pillText }}
                </span>
              </div>
              <div class="task-item-meta">{{ taskStatusMeta(item).meta }}</div>

              <div v-if="itemStatus(item) === 'loading'" class="ai-loading">
                <n-spin size="small" />
                <div class="loading-meta">
                  <span>生成中…</span>
                  <n-progress
                    v-if="item.progress != null && item.progress > 0"
                    :percentage="Math.min(100, Math.round(Number(item.progress) || 0))"
                    :show-indicator="true"
                    processing
                    type="line"
                    class="video-progress"
                  />
                </div>
              </div>
              <div v-else-if="itemStatus(item) === 'pending_resume'" class="ai-error-block">
                <div class="ai-error">
                  {{ item.errorMessage || '任务未完成，可恢复轮询或放弃' }}
                </div>
                <div class="error-actions">
                  <n-button
                    :disabled="gen.busy"
                    secondary
                    size="tiny"
                    type="primary"
                    @click="resumeItem(item)"
                  >
                    恢复轮询
                  </n-button>
                  <n-button secondary size="tiny" @click="abandonPendingItem(item)">放弃</n-button>
                </div>
              </div>
              <div v-else-if="itemStatus(item) === 'error'" class="ai-error-block">
                <div class="ai-error">{{ item.errorMessage || '生成失败' }}</div>
                <div class="error-actions">
                  <n-button secondary size="tiny" @click="copyErrorText(item)">复制错误</n-button>
                  <n-button :disabled="gen.busy" secondary size="tiny" @click="retryItem(item)">
                    <template #icon>
                      <n-icon :component="RefreshOutline" :size="14" />
                    </template>
                    重试
                  </n-button>
                </div>
              </div>
              <div v-else-if="!item.videoUrl || isVideoBroken(item)" class="ai-error-block">
                <div class="ai-error">{{ videoPlaybackErrorText(item) }}</div>
                <div class="error-actions">
                  <n-button
                    v-if="canReloadVideo(item)"
                    secondary
                    size="tiny"
                    @click="reloadVideo(item)"
                  >
                    重新加载
                  </n-button>
                  <n-button :disabled="gen.busy" secondary size="tiny" @click="retryItem(item)">
                    重试
                  </n-button>
                </div>
              </div>
              <div v-else class="video-wrap">
                <div class="video-actions">
                  <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                    <template #trigger>
                      <n-button
                        circle
                        quaternary
                        size="tiny"
                        aria-label="下载视频"
                        class="touch-target"
                        @click.stop="downloadVideo(item, `video-${item.id}.mp4`)"
                      >
                        <template #icon>
                          <n-icon :component="DownloadOutline" :size="14" />
                        </template>
                      </n-button>
                    </template>
                    下载
                  </n-tooltip>
                </div>
                <video
                  :key="`${item.id}:${item.videoUrl || ''}`"
                  :src="item.videoUrl"
                  controls
                  playsinline
                  preload="auto"
                  class="video-player"
                  @error="onVideoError(item.id)"
                />
              </div>
            </div>
          </template>
        </template>
        <div ref="bottomRef" class="gallery-anchor" aria-hidden="true" />
      </div>

      <GenerateParamsPanel v-if="useStudioSplit" title="生成参数">
        <div class="params-field">
          <div class="params-field-label">模式</div>
          <div class="mode-switch mode-switch-full">
            <button
              :class="{active: mode === 'txt2video'}"
              class="mode-item"
              type="button"
              @click="mode = 'txt2video'"
            >
              文生视频
            </button>
            <button
              :class="{active: mode === 'img2video'}"
              class="mode-item"
              type="button"
              @click="mode = 'img2video'"
            >
              图生视频
            </button>
          </div>
        </div>

        <div class="params-field">
          <div class="params-field-label">提示词</div>
          <n-input
            v-model:value="prompt"
            :autosize="{minRows: 3, maxRows: 8}"
            :disabled="isGeneratingCurrent"
            :placeholder="promptPlaceholder"
            type="textarea"
            @focus="onComposerFocus"
            @keydown="onKeydown"
          />
          <div class="params-prompt-tools">
            <PromptEnhanceButton
              domain="video"
              :mode="mode"
              :text="prompt"
              :disabled="isGeneratingCurrent"
              @apply="onApplyPrompt"
            />
            <PromptAssist
              domain="video"
              :mode="mode"
              :disabled="isGeneratingCurrent"
              @apply="onApplyPrompt"
            />
          </div>
          <PromptBuilderCollapse
            domain="video"
            :mode="mode"
            :disabled="isGeneratingCurrent"
            @apply="onApplyPrompt"
          />
        </div>

        <div class="params-field">
          <div class="params-field-label">时长</div>
          <div class="chip-row">
            <button
              v-for="opt in durationOptions"
              :key="opt.value"
              :class="['opt-chip', {'is-active': seconds === opt.value}]"
              type="button"
              @click="seconds = opt.value"
            >
              {{ opt.label.replace(' 秒', 's') }}
            </button>
          </div>
        </div>

        <div v-if="showAspectRatio" class="params-field">
          <div class="params-field-label">比例</div>
          <div class="chip-row">
            <button
              v-for="opt in aspectOptions"
              :key="opt.value"
              :class="['opt-chip', {'is-active': aspectRatio === opt.value}]"
              type="button"
              @click="aspectRatio = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="showSize" class="params-field">
          <div class="params-field-label">画幅</div>
          <div class="chip-row">
            <button
              v-for="opt in sizeOptionsDesktop"
              :key="opt.value"
              :class="['opt-chip', {'is-active': size === opt.value}]"
              type="button"
              @click="size = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="showResolution" class="params-field">
          <div class="params-field-label">清晰度</div>
          <div class="chip-row">
            <button
              v-for="opt in resolutionOptions"
              :key="opt.value"
              :class="['opt-chip', {'is-active': resolution === opt.value}]"
              type="button"
              @click="resolution = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="mode === 'img2video'" class="params-field">
          <div class="params-field-label">起始帧</div>
          <n-upload
            v-if="!previewUrl"
            :custom-request="onUpload"
            :show-file-list="false"
            accept="image/*"
          >
            <n-button block dashed>
              <template #icon>
                <n-icon :component="ImageOutline" />
              </template>
              上传起始帧
            </n-button>
          </n-upload>
          <div v-else class="ref-chip ref-chip-drawer">
            <img :src="previewUrl" alt="reference" />
            <div class="ref-chip-meta">
              <span class="ref-name">起始帧已选</span>
              <span class="ref-hint">可清除后重新选择</span>
            </div>
            <n-button
              aria-label="清除起始帧"
              class="touch-target"
              quaternary
              size="small"
              @click="clearUpload"
            >
              <template #icon>
                <n-icon :component="TrashOutline" />
              </template>
            </n-button>
          </div>
          <p class="ref-compress-hint">参考图会自动压缩后上传，建议不超过 4K 原图</p>
        </div>

        <template #actions>
          <n-button
            v-if="isGeneratingCurrent"
            class="params-action-btn params-action-stop"
            @click="stopGenerate"
          >
            停止
          </n-button>
          <n-button
            class="params-action-btn"
            type="primary"
            :disabled="!canGenerate"
            :loading="isGeneratingCurrent"
            @click="generate"
          >
            提交任务
          </n-button>
        </template>
      </GenerateParamsPanel>

      <GenerateComposerCard
        v-if="!useStudioSplit"
        v-model:prompt="prompt"
        :is-mobile="isMobile"
        :loading="isGeneratingCurrent"
        :disabled="!canGenerate"
        :show-hint="!isMobile || isGeneratingCurrent"
        :hint-critical="isMobile && isGeneratingCurrent"
        :placeholder="promptPlaceholder"
        :send-icon="SparklesOutline"
        :send-tooltip="sendTooltip"
        send-variant="label"
        send-label="提交任务"
        @send="generate"
        @stop="stopGenerate"
        @focus="onComposerFocus"
        @keydown="onKeydown"
      >
        <template #prompt-assist>
          <div class="prompt-assist-stack">
            <div class="prompt-assist-row">
              <PromptAssist
                domain="video"
                :mode="mode"
                :disabled="isGeneratingCurrent"
                :compact="isMobile"
                @apply="onApplyPrompt"
              />
              <PromptEnhanceButton
                domain="video"
                :mode="mode"
                :text="prompt"
                :disabled="isGeneratingCurrent"
                :compact="isMobile"
                @apply="onApplyPrompt"
              />
            </div>
            <PromptBuilderCollapse
              domain="video"
              :mode="mode"
              :disabled="isGeneratingCurrent"
              :compact="isMobile"
              @apply="onApplyPrompt"
            />
          </div>
        </template>
        <template #toolbar>
          <div class="mode-switch">
            <button
              :class="{active: mode === 'txt2video'}"
              class="mode-item"
              type="button"
              @click="mode = 'txt2video'"
            >
              文生视频
            </button>
            <button
              :class="{active: mode === 'img2video'}"
              class="mode-item"
              type="button"
              @click="mode = 'img2video'"
            >
              图生视频
            </button>
          </div>

          <div class="opt-group">
            <label class="opt-item opt-duration" title="时长">
              <span class="opt-label">时长</span>
              <n-select
                v-model:value="seconds"
                :options="durationOptions"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
            <label v-if="showSize" class="opt-item opt-size" title="画幅">
              <span class="opt-label">画幅</span>
              <n-select
                v-model:value="size"
                :options="sizeOptionsDesktop"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
            <label v-if="showAspectRatio" class="opt-item opt-ratio" title="比例">
              <span class="opt-label">比例</span>
              <n-select
                v-model:value="aspectRatio"
                :options="aspectOptions"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
            <label v-if="showResolution" class="opt-item opt-ratio" title="清晰度">
              <span class="opt-label">清晰度</span>
              <n-select
                v-model:value="resolution"
                :options="resolutionOptions"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
          </div>
        </template>

        <template #params-summary>
          <button class="params-summary" type="button" @click="paramsDrawerShow = true">
            <n-icon :component="OptionsOutline" :size="16" class="params-summary-icon" />
            <span class="params-summary-text">{{ paramsSummary }}</span>
            <span class="params-summary-action">设置</span>
          </button>
        </template>

        <template #reference>
          <div v-if="mode === 'img2video' && !isMobile" class="upload-row">
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
                上传 / 粘贴参考图
              </n-button>
            </n-upload>
            <div v-else class="ref-chip">
              <img :src="previewUrl" alt="reference" />
              <span class="ref-name">参考图已选</span>
              <n-button
                aria-label="清除参考图"
                class="touch-target"
                quaternary
                size="tiny"
                @click="clearUpload"
              >
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
              </n-button>
            </div>
          </div>

          <button
            v-else-if="mode === 'img2video' && isMobile && previewUrl"
            class="ref-chip ref-chip-mobile"
            type="button"
            @click="paramsDrawerShow = true"
          >
            <img :src="previewUrl" alt="reference" />
            <span class="ref-name">参考图已选，点击可更换</span>
          </button>
        </template>
      </GenerateComposerCard>
    </div>

    <GenerateParamsDrawer
      v-if="!useStudioSplit"
      v-model:show="paramsDrawerShow"
      :height="drawerHeight"
    >
      <div class="params-section">
        <div class="params-label">模式</div>
        <div class="mode-switch mode-switch-full">
          <button
            :class="{active: mode === 'txt2video'}"
            class="mode-item"
            type="button"
            @click="mode = 'txt2video'"
          >
            文生视频
          </button>
          <button
            :class="{active: mode === 'img2video'}"
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
                <n-icon :component="ImageOutline" />
              </template>
              从相册选择参考图
            </n-button>
          </n-upload>
          <div v-else class="ref-chip ref-chip-drawer">
            <img :src="previewUrl" alt="reference" />
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
                <n-icon :component="TrashOutline" />
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
          <div v-if="showSize" class="params-label">画幅</div>
          <n-select
            v-if="showSize"
            v-model:value="size"
            :options="sizeOptionsDesktop"
            :render-label="renderSelectLabel"
            class="params-control"
            size="medium"
          />
          <div v-if="showAspectRatio" class="params-label" :class="{'params-label-gap': showSize}">
            比例
          </div>
          <n-select
            v-if="showAspectRatio"
            v-model:value="aspectRatio"
            :options="aspectOptions"
            :render-label="renderSelectLabel"
            class="params-control"
            size="medium"
          />
          <div
            v-if="showResolution"
            :class="{'params-label-gap': showSize || showAspectRatio}"
            class="params-label"
          >
            清晰度
          </div>
          <n-select
            v-if="showResolution"
            v-model:value="resolution"
            :options="resolutionOptions"
            :render-label="renderSelectLabel"
            class="params-control"
            size="medium"
          />
        </div>
      </div>
    </GenerateParamsDrawer>

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
  </SessionWorkspaceShell>

  <n-dropdown
    placement="bottom-start"
    trigger="manual"
    :x="ctxX"
    :y="ctxY"
    :options="ctxOptions"
    :show="ctxShow"
    :on-clickoutside="onCtxClickOutside"
    @select="onCtxSelect"
    @update:show="onCtxUpdateShow"
  />
</template>

<style lang="scss" scoped src="./VideoView.scss"></style>
