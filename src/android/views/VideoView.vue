<script setup>
defineOptions({name: 'VideoView'})

import {computed, ref} from 'vue'
import {
  AddOutline,
  CreateOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  GridOutline,
  ImageOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionTopBar from '@/components/SessionTopBar.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import PromptAssist from '@core/components/PromptAssist.vue'
import PromptEnhanceButton from '@core/components/PromptEnhanceButton.vue'
import PromptBuilderPanel from '@core/components/PromptBuilderPanel.vue'
import {useVideoSession} from '@core/composables/useVideoSession'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import {getPromptPlaceholder} from '@core/prompts'
import {
  downloadMediaBlob,
  resolveVideoDownloadSrc,
  resolveVideoFallbackSrc,
  srcToBlob,
} from '@core/composables/useMediaDownload'
import {isAndroidTauri} from '@core/utils/request'
import {trySaveToAndroidGallery} from '@core/utils/androidMediaSave'
import {
  buildBubbleMetaParts,
  buildCardHdMeta,
  buildDayGroupedTimelineRows,
} from '@core/utils/mediaTimeline'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

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
  resolution,
  previewUrl,
  listRef,
  bottomRef,
  refThumbMap,
  session,
  provider,
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
  sizeLabel,
  durationLabel,
  drawerHeight,
  sessionTitle,
  sendTooltip,
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
  clearItems: clearItemsCore,
  removeQueueItem,
  onVideoError,
  isVideoBroken,
  canReloadVideo,
  reloadVideo,
  videoPlaybackErrorText,
  retryItem,
  onComposerFocus,
  openRefLightbox,
  closeLightbox,
  lightboxShow,
  lightboxSrc,
  lightboxTitle,
} = useVideoSession({notifyCreateSession: true})

const {tooltipTrigger} = useTooltipTrigger()

const enhanceStateKey = computed(() => `video:${session.value?.id || 'default'}`)

const paramsDrawerShow = ref(false)
const builderDrawerShow = ref(false)
const moreShow = ref(false)
const cardActionShow = ref(false)
const cardActionTarget = ref(null)
useBackCloseLayer(paramsDrawerShow)
useBackCloseLayer(builderDrawerShow)
useBackCloseLayer(moreShow)
useBackCloseLayer(cardActionShow)
useBackCloseLayer(lightboxShow)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('video', mode.value, {isMobile: true}),
)

const modelCapLabel = computed(() => {
  const raw = String(provider.value?.videoModel || '').trim()
  if (!raw) return '未选模型'
  const parts = raw.split(/[/:]/)
  return parts[parts.length - 1] || raw
})

const durationCapLabel = computed(() => {
  const raw = String(durationLabel.value || '').replace(/\s/g, '')
  return raw || `${seconds.value}s`
})

const sizeCapLabel = computed(() => sizeLabel.value || '画幅')

const timelineRows = computed(() => buildDayGroupedTimelineRows(timelineItems.value))

function progressLabel(item) {
  const p = Number(item?.progress)
  if (!Number.isFinite(p) || p <= 0) return '生成中'
  return `${Math.min(100, Math.round(p))}%`
}

function cardHdMeta(item) {
  return buildCardHdMeta({createdAt: item?.createdAt, summary: paramSummary(item)})
}

function bubbleMetaParts(item) {
  return buildBubbleMetaParts({
    modeLabel: item?.mode === 'img2video' ? '图生视频' : '文生视频',
    createdAt: item?.createdAt,
    summary: paramSummary(item),
  })
}

function onToolbarCreate() {
  moreShow.value = false
  createSession()
}

function onApplyPrompt(text) {
  prompt.value = text
}

function onApplyFromBuilder(text) {
  prompt.value = text
  builderDrawerShow.value = false
}

function onRefillPrompt(item) {
  const text = String(item?.prompt || '')
  if (!text.trim()) return
  prompt.value = text
}

function onContinueShot(item) {
  onRefillPrompt(item)
  message.info('已填回提示词，可续写镜头后生成')
}

function clearItems() {
  moreShow.value = false
  clearItemsCore()
}

function openCardActions(item) {
  cardActionTarget.value = item
  cardActionShow.value = true
}

async function downloadVideo(item, name) {
  const src = resolveVideoDownloadSrc(item)
  if (!src) {
    message.warning('视频不可用，请重新生成')
    return
  }
  const fileName = name || `video-${item.id}.mp4`
  const fallbackSrc = resolveVideoFallbackSrc(item)

  if (isAndroidTauri()) {
    const preferRemote = /^https?:\/\//i.test(String(src).trim())
    if (preferRemote) {
      const saved = await trySaveToAndroidGallery({
        src,
        displayName: fileName,
        mimeType: 'video/mp4',
        preferRemote: true,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    }
    try {
      const blob = await srcToBlob(src)
      const mime = blob.type || 'video/mp4'
      const saved = await trySaveToAndroidGallery({
        src,
        blob,
        displayName: fileName,
        mimeType: mime,
        preferRemote: false,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    } catch {
      // fall through to shared download
    }
  }

  await downloadMediaBlob({
    src,
    fileName,
    message,
    opts: {
      enableShare: true,
      shareTitle: fileName,
      defaultMime: 'video/mp4',
      mobileOpenHint: '下载失败，已尝试在新窗口打开',
      fallbackSrc,
    },
  })
}

async function onCardDownload() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  await downloadVideo(item, `video-${item.id}.mp4`)
}

async function onCardCopyError() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  await copyErrorText(item)
}

async function onCardRetry() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  await retryItem(item)
}

async function onCardReload() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  await reloadVideo(item)
}

function onCardResume() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  resumeItem(item)
}

function onCardAbandon() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  abandonPendingItem(item)
}

function onCardDelete() {
  const item = cardActionTarget.value
  cardActionShow.value = false
  if (!item) return
  removeQueueItem(item)
}

async function onAgainBatch(item) {
  await retryItem(item)
}
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
    <template #toolbar="{openHistory}">
      <SessionTopBar
        :history-count="videoStore.sessions.length"
        :title="sessionTitle || '视频'"
        @more="moreShow = true"
        @open-history="openHistory"
      />
    </template>

    <div class="param-capsule" aria-label="参数胶囊">
      <button class="param-cap" type="button" @click="moreShow = true">
        <strong>{{ modelCapLabel }}</strong>
      </button>
      <button class="param-cap" type="button" @click="paramsDrawerShow = true">
        时长 <strong>{{ durationCapLabel }}</strong>
      </button>
      <button class="param-cap" type="button" @click="paramsDrawerShow = true">
        画幅 <strong>{{ sizeCapLabel }}</strong>
      </button>
      <button
        v-if="mode === 'img2video'"
        class="param-cap"
        type="button"
        @click="paramsDrawerShow = true"
      >
        起始帧 · <strong>{{ previewUrl ? '已选' : '未选' }}</strong>
      </button>
      <button class="param-cap-more" type="button" @click="paramsDrawerShow = true">更多</button>
    </div>

    <div ref="listRef" class="gallery">
      <div v-if="!timelineItems.length" class="empty-card empty-state">
        <div class="empty-art art" aria-hidden="true">▶</div>
        <div class="empty-title">从一句话开始</div>
        <p class="empty-desc">像聊天一样生成视频。提示词进时间线，结果以卡片回传。</p>
      </div>

      <template v-for="row in timelineRows" :key="row.id">
        <div v-if="row.kind === 'day'" class="tl-day">{{ row.label }}</div>

        <div v-else class="tl-turn">
          <div class="msg user">
            <div class="msg-body">
              <div class="bubble user-bubble">
                <div
                  v-if="
                    row.item.mode === 'img2video' &&
                    (refThumbMap[row.item.id] || row.item.refPreview)
                  "
                  class="ref-thumb"
                >
                  <img
                    :src="refThumbMap[row.item.id] || row.item.refPreview"
                    alt="reference"
                    title="点击预览"
                    @click="openRefLightbox(refThumbMap[row.item.id] || row.item.refPreview)"
                  />
                </div>
                <div class="prompt-text">{{ row.item.prompt }}</div>
                <span class="bubble-meta">
                  <em v-for="(part, mi) in bubbleMetaParts(row.item)" :key="mi">{{ part }}</em>
                </span>
              </div>
              <div v-if="row.item.prompt" class="msg-actions">
                <CopyIconButton
                  :active="copiedId === row.item.id"
                  tooltip="复制提示词"
                  @click="copyPrompt(row.item)"
                />
                <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                  <template #trigger>
                    <n-button
                      aria-label="填回编辑"
                      circle
                      class="touch-target"
                      quaternary
                      size="tiny"
                      @click="onRefillPrompt(row.item)"
                    >
                      <template #icon>
                        <n-icon :component="CreateOutline" :size="14" />
                      </template>
                    </n-button>
                  </template>
                  填回编辑
                </n-tooltip>
              </div>
            </div>
          </div>

          <div v-if="itemStatus(row.item) === 'error'" class="err-card error-state">
            <div class="error-art art" aria-hidden="true">!</div>
            <div class="empty-title">生成失败</div>
            <p class="empty-desc">{{ row.item.errorMessage || '生成失败' }}</p>
            <div class="tl-actions">
              <button class="mini" type="button" @click="copyErrorText(row.item)">复制错误</button>
              <button
                class="mini primary"
                type="button"
                :disabled="gen.busy"
                @click="retryItem(row.item)"
              >
                重试这条
              </button>
            </div>
          </div>

          <div v-else-if="itemStatus(row.item) === 'pending_resume'" class="err-card error-state">
            <div class="error-art art" aria-hidden="true">…</div>
            <div class="empty-title">任务未完成</div>
            <p class="empty-desc">
              {{ row.item.errorMessage || '任务未完成，可恢复轮询或放弃' }}
            </p>
            <div class="tl-actions">
              <button
                class="mini primary"
                type="button"
                :disabled="gen.busy"
                @click="resumeItem(row.item)"
              >
                恢复轮询
              </button>
              <button class="mini" type="button" @click="abandonPendingItem(row.item)">放弃</button>
              <button
                v-if="row.item.errorMessage"
                class="mini"
                type="button"
                @click="copyErrorText(row.item)"
              >
                复制错误
              </button>
            </div>
          </div>

          <div
            v-else-if="!row.item.videoUrl || isVideoBroken(row.item)"
            class="err-card error-state"
          >
            <div class="error-art art" aria-hidden="true">!</div>
            <div class="empty-title">无法播放</div>
            <p class="empty-desc">{{ videoPlaybackErrorText(row.item) }}</p>
            <div class="tl-actions">
              <button class="mini" type="button" @click="copyErrorText(row.item)">复制错误</button>
              <button
                v-if="canReloadVideo(row.item)"
                class="mini"
                type="button"
                @click="reloadVideo(row.item)"
              >
                重新加载
              </button>
              <button
                class="mini primary"
                type="button"
                :disabled="gen.busy"
                @click="retryItem(row.item)"
              >
                重试这条
              </button>
            </div>
          </div>

          <div v-else class="tl-card">
            <div class="tl-card-hd">
              <strong>
                {{ itemStatus(row.item) === 'loading' ? '结果 · 生成中' : '结果 · 本批' }}
              </strong>
              <span class="tl-card-hd-grow" />
              <span v-if="itemStatus(row.item) === 'loading'" class="tl-pill run">
                {{ progressLabel(row.item) }}
              </span>
              <span v-else class="tl-card-meta">{{ cardHdMeta(row.item) }}</span>
            </div>

            <div v-if="itemStatus(row.item) === 'loading'" class="tl-video is-loading">
              <div class="gen-skel" aria-hidden="true" />
              <div class="ai-loading">
                <n-spin size="small" />
                <div class="loading-meta">
                  <span>生成中…</span>
                  <n-progress
                    v-if="row.item.progress != null && row.item.progress > 0"
                    :percentage="Math.min(100, Math.round(Number(row.item.progress) || 0))"
                    :show-indicator="true"
                    class="video-progress"
                    processing
                    type="line"
                  />
                </div>
              </div>
            </div>

            <div v-else class="video-wrap tl-video">
              <div class="video-actions">
                <n-button
                  aria-label="更多操作"
                  circle
                  class="touch-target"
                  quaternary
                  size="tiny"
                  @click.stop="openCardActions(row.item)"
                >
                  <template #icon>
                    <n-icon :component="EllipsisHorizontalOutline" :size="16" />
                  </template>
                </n-button>
              </div>
              <video
                :src="row.item.videoUrl"
                class="video-player"
                controls
                playsinline
                preload="metadata"
                @error="onVideoError(row.item.id)"
              />
            </div>

            <div
              v-if="
                itemStatus(row.item) !== 'loading' && row.item.videoUrl && !isVideoBroken(row.item)
              "
              class="tl-actions"
            >
              <button class="mini" type="button" @click="downloadVideo(row.item)">下载</button>
              <button class="mini" type="button" @click="onContinueShot(row.item)">续写镜头</button>
              <button
                class="mini primary"
                type="button"
                :disabled="gen.busy"
                @click="onAgainBatch(row.item)"
              >
                再来一批
              </button>
            </div>
          </div>
        </div>
      </template>
      <div ref="bottomRef" class="gallery-anchor" aria-hidden="true" />
    </div>

    <template #composer>
      <div class="composer">
        <div v-if="isGeneratingCurrent" class="composer-hint is-critical">生成中可点击停止</div>
        <div class="composer-card compose-box">
          <PromptAssist
            domain="video"
            :state-key="enhanceStateKey"
            :mode="mode"
            :disabled="isGeneratingCurrent"
            compact
            @apply="onApplyPrompt"
          />

          <div class="composer-input">
            <n-input
              v-model:value="prompt"
              :autosize="{minRows: 1, maxRows: 4}"
              :disabled="isGeneratingCurrent"
              class="composer-field"
              :placeholder="promptPlaceholder"
              type="textarea"
              @focus="onComposerFocus"
            />
            <div class="composer-actions">
              <ComposerSendStop
                variant="label"
                send-label="生成"
                :disabled="!canGenerate"
                :loading="isGeneratingCurrent"
                :send-tooltip="sendTooltip"
                @send="generate"
                @stop="stopGenerate"
              />
            </div>
          </div>

          <div class="compose-tools">
            <PromptEnhanceButton
              domain="video"
              :state-key="enhanceStateKey"
              :mode="mode"
              :text="prompt"
              :disabled="isGeneratingCurrent"
              compact
              @apply="onApplyPrompt"
            />
            <button
              class="builder-entry"
              type="button"
              :disabled="isGeneratingCurrent"
              @click="builderDrawerShow = true"
            >
              <n-icon :component="GridOutline" :size="14" class="builder-entry-icon" />
              <span>结构化</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </SessionWorkspaceShell>

  <n-drawer
    v-model:show="builderDrawerShow"
    :height="drawerHeight"
    display-directive="show"
    placement="bottom"
  >
    <n-drawer-content closable title="结构化提示">
      <div class="params-drawer">
        <PromptBuilderPanel
          domain="video"
          :mode="mode"
          :disabled="isGeneratingCurrent"
          compact
          @apply="onApplyFromBuilder"
        />
      </div>
    </n-drawer-content>
  </n-drawer>

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
            <div
              v-if="showAspectRatio"
              class="params-label"
              :class="{'params-label-gap': showSize}"
            >
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

        <n-button block class="params-done" type="primary" @click="paramsDrawerShow = false">
          完成
        </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>

  <n-drawer
    v-model:show="moreShow"
    class="more-drawer"
    display-directive="show"
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
          <ModelSelect kind="video" sheet size="medium" />
        </div>
        <n-button block secondary @click="onToolbarCreate">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          新建会话
        </n-button>
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
    <n-drawer-content closable title="视频操作">
      <div class="more-sheet">
        <n-button
          v-if="cardActionTarget && itemStatus(cardActionTarget) === 'pending_resume'"
          :disabled="gen.busy"
          block
          secondary
          type="primary"
          @click="onCardResume"
        >
          恢复轮询
        </n-button>
        <n-button
          v-if="cardActionTarget && itemStatus(cardActionTarget) === 'pending_resume'"
          block
          secondary
          @click="onCardAbandon"
        >
          放弃
        </n-button>
        <n-button
          v-if="
            cardActionTarget &&
            (itemStatus(cardActionTarget) === 'error' ||
              itemStatus(cardActionTarget) === 'pending_resume' ||
              isVideoBroken(cardActionTarget))
          "
          block
          secondary
          @click="onCardCopyError"
        >
          复制错误信息
        </n-button>
        <n-button
          v-if="
            cardActionTarget && isVideoBroken(cardActionTarget) && canReloadVideo(cardActionTarget)
          "
          block
          secondary
          @click="onCardReload"
        >
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          重新加载
        </n-button>
        <n-button
          v-if="
            cardActionTarget &&
            (itemStatus(cardActionTarget) === 'error' || isVideoBroken(cardActionTarget))
          "
          :disabled="gen.busy"
          block
          secondary
          @click="onCardRetry"
        >
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          重试
        </n-button>
        <n-button v-if="cardActionTarget?.videoUrl" block secondary @click="onCardDownload">
          <template #icon>
            <n-icon :component="DownloadOutline" />
          </template>
          下载
        </n-button>
        <n-button v-if="cardActionTarget" block secondary type="error" @click="onCardDelete">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          删除
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
      <img v-if="lightboxSrc" :src="lightboxSrc" alt="preview" />
    </div>
  </n-modal>
</template>

<style lang="scss" scoped src="./VideoView.scss"></style>
