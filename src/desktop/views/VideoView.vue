<script setup>
defineOptions({name: 'VideoView'})

import {computed, ref} from 'vue'
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
import GenerateTimelineUserBubble from '@/components/generate/GenerateTimelineUserBubble.vue'
import GenerateComposerCard from '@/components/generate/GenerateComposerCard.vue'
import GenerateParamsDrawer from '@/components/generate/GenerateParamsDrawer.vue'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import {useVideoSession} from '@core/composables/useVideoSession'
import {downloadMediaBlob} from '@core/composables/useMediaDownload'
import {useManualDropdown} from '@/composables/useManualDropdown'
import {getPromptPlaceholder} from '@core/prompts'
import {renderSelectLabel} from '@core/utils/selectRender'

const {isMobile, isCompact} = useBreakpoints()
const {tooltipTrigger} = useTooltipTrigger()
const {
  videoStore,
  settings,
  message,
  copiedId,
  gen,
  mode,
  prompt,
  seconds,
  size,
  aspectRatio,
  previewUrl,
  listRef,
  bottomRef,
  refThumbMap,
  session,
  showSize,
  showAspectRatio,
  isGeneratingCurrent,
  canGenerate,
  timelineItems,
  sizeOptions: sizeOptionsDesktop,
  aspectOptions,
  durationOptions,
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
  copyPrompt,
  copyErrorText,
  clearItems,
  onVideoError,
  isVideoBroken,
  retryItem,
  onComposerFocus,
} = useVideoSession()

const paramsDrawerShow = ref(false)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('video', mode.value, {isMobile: isMobile.value}),
)

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

function onRefillPrompt(item) {
  const text = String(item?.prompt || '')
  if (!text.trim()) return
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

function onUserBubbleContextMenu(e, item) {
  if (!String(item?.prompt || '').trim()) return
  openCtxMenu(
    e,
    [
      {label: '复制提示词', key: 'copy'},
      {label: '填回编辑', key: 'refill'},
    ],
    (key) => {
      if (key === 'copy') copyPrompt(item)
      else if (key === 'refill') onRefillPrompt(item)
    },
  )
}

async function downloadVideo(item, name) {
  const src = item?.videoUrl
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
    },
  })
}

function onAiBubbleContextMenu(e, item) {
  const status = itemStatus(item)
  if (status === 'loading' || status === 'pending_resume') return

  const options = []
  if (status === 'error' || isVideoBroken(item)) {
    options.push({label: '复制错误信息', key: 'copy-error'})
    options.push({label: '重试', key: 'retry', disabled: gen.busy})
  } else if (item?.videoUrl) {
    options.push({label: '下载', key: 'download'})
  }
  if (!options.length) return

  openCtxMenu(e, options, (key) => {
    if (key === 'copy-error') copyErrorText(item)
    else if (key === 'retry') retryItem(item)
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
      <n-select
        :options="settings.providerOptions"
        :render-label="renderSelectLabel"
        :value="settings.activeProviderId"
        class="provider-select"
        size="small"
        @update:value="settings.setActiveProvider"
      />
      <ModelSelect kind="video" />
      <n-button
        :disabled="!session?.items?.length"
        aria-label="清空时间线"
        quaternary
        size="small"
        class="toolbar-clear"
        @click="clearItems"
      >
        清空
      </n-button>
    </template>

    <div class="content">
      <div ref="listRef" class="gallery">
        <div v-if="!timelineItems.length" class="empty">
          <div class="empty-title">开始创作</div>
          <div class="empty-desc">{{ emptyDesc }}</div>
        </div>

        <template v-for="item in timelineItems" :key="item.id">
          <GenerateTimelineUserBubble
            :mode-label="item.mode === 'img2video' ? '图生视频' : '文生视频'"
            :param-summary="paramSummary(item)"
            :prompt="item.prompt"
            :ref-thumb-src="
              item.mode === 'img2video' ? refThumbMap[item.id] || item.refPreview || null : null
            "
            :copied="copiedId === item.id"
            show-refill
            @copy="copyPrompt(item)"
            @refill="onRefillPrompt(item)"
            @contextmenu="onUserBubbleContextMenu($event, item)"
          />

          <div :class="['msg', 'assistant', {error: itemStatus(item) === 'error'}]">
            <div class="role">AI</div>
            <div class="msg-body">
              <div class="bubble ai-bubble" @contextmenu="onAiBubbleContextMenu($event, item)">
                <div
                  v-if="itemStatus(item) === 'loading' || itemStatus(item) === 'pending_resume'"
                  class="ai-loading"
                >
                  <n-spin size="small" />
                  <div class="loading-meta">
                    <span>
                      {{ itemStatus(item) === 'pending_resume' ? '等待恢复…' : '生成中…' }}
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
                  <n-button size="tiny" secondary :disabled="gen.busy" @click="retryItem(item)">
                    <template #icon>
                      <n-icon :component="RefreshOutline" :size="14" />
                    </template>
                    重试
                  </n-button>
                </div>
                <div v-else-if="!item.videoUrl || isVideoBroken(item)" class="ai-error-block">
                  <div class="ai-error">
                    {{
                      item.videoUrl ? '视频链接已失效，请重新生成' : item.errorMessage || '暂无视频'
                    }}
                  </div>
                  <n-button size="tiny" secondary :disabled="gen.busy" @click="retryItem(item)">
                    <template #icon>
                      <n-icon :component="RefreshOutline" :size="14" />
                    </template>
                    重试
                  </n-button>
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
        <div ref="bottomRef" class="gallery-anchor" aria-hidden="true" />
      </div>

      <GenerateComposerCard
        v-model:prompt="prompt"
        :is-mobile="isMobile"
        :loading="isGeneratingCurrent"
        :disabled="!canGenerate"
        :show-hint="!isMobile || isGeneratingCurrent"
        :hint-critical="isMobile && isGeneratingCurrent"
        :placeholder="promptPlaceholder"
        :send-icon="SparklesOutline"
        :send-tooltip="sendTooltip"
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

    <GenerateParamsDrawer v-model:show="paramsDrawerShow" :height="drawerHeight">
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
        </div>
      </div>
    </GenerateParamsDrawer>
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
