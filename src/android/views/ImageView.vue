<script setup>
defineOptions({name: 'ImageView'})

import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {
  AddOutline,
  CreateOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  GridOutline,
  ImageOutline,
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
import {useImageSession} from '@core/composables/useImageSession'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import {getPromptPlaceholder} from '@core/prompts'
import {downloadMediaBlob, srcToBlob} from '@core/composables/useMediaDownload'
import {isAndroidTauri} from '@core/utils/request'
import {trySaveToAndroidGallery} from '@core/utils/androidMediaSave'
import {
  buildBubbleMetaParts,
  buildCardHdMeta,
  buildDayGroupedTimelineRows,
} from '@core/utils/mediaTimeline'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

const router = useRouter()

const {
  imageStore,
  settings,
  message,
  copiedId,
  mode,
  prompt,
  n,
  size,
  aspectRatio,
  quality,
  previewUrl,
  listRef,
  bottomRef,
  refThumbMap,
  lightboxShow,
  lightboxSrc,
  lightboxTitle,
  lightboxPayload,
  session,
  provider,
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
  sizeLabel,
  qualityLabel,
  drawerHeight,
  sessionTitle,
  sendTooltip,
  itemStatus,
  thumbStyle,
  onThumbLoad,
  paramSummary,
  onUpload,
  clearUpload,
  displaySrc,
  isTemporary,
  openLightbox,
  openRefLightbox,
  closeLightbox,
  useAsReference,
  useLightboxAsReference,
  resolveImageSrc,
  resolveImageFallbackSrc,
  resolveImageBlob,
  generate,
  stopGenerate,
  selectSession,
  createSession,
  removeSession,
  copyPrompt,
  copyErrorText,
  clearItems: clearItemsCore,
  onComposerFocus,
} = useImageSession({notifyCreateSession: true})

const {tooltipTrigger} = useTooltipTrigger()

const paramsDrawerShow = ref(false)
const builderDrawerShow = ref(false)
const moreShow = ref(false)
const cardActionShow = ref(false)
const cardActionTarget = ref(null)
useBackCloseLayer(lightboxShow)
useBackCloseLayer(paramsDrawerShow)
useBackCloseLayer(builderDrawerShow)
useBackCloseLayer(moreShow)
useBackCloseLayer(cardActionShow)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('image', mode.value, {isMobile: true}),
)

const modelCapLabel = computed(() => {
  const raw = String(provider.value?.imageModel || '').trim()
  if (!raw) return '未选模型'
  const parts = raw.split(/[/:]/)
  return parts[parts.length - 1] || raw
})

const sizeCapLabel = computed(() => sizeLabel.value || '尺寸')

const timelineRows = computed(() => buildDayGroupedTimelineRows(timelineItems.value))

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

function applyItemParams(item) {
  if (!item) return
  if (item.mode === 'img2img' || item.mode === 'txt2img') mode.value = item.mode
  if (item.n != null && supportsN.value) n.value = Math.min(4, Math.max(1, Number(item.n) || 1))
  if (item.size && showSize.value) size.value = item.size
  if (item.aspectRatio && useAspectRatio.value) aspectRatio.value = item.aspectRatio
  if (item.quality && supportsQuality.value) quality.value = item.quality
}

function clearItems() {
  moreShow.value = false
  clearItemsCore()
}

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  const fallbackSrc = resolveImageFallbackSrc(img)
  if (!src && !fallbackSrc) {
    message.warning('图片不可用')
    return
  }

  if (isAndroidTauri()) {
    try {
      let blob = await resolveImageBlob(img)
      if (!blob && src) {
        try {
          blob = await srcToBlob(src)
        } catch {
          blob = null
        }
      }
      if (!blob && fallbackSrc && fallbackSrc !== src) {
        blob = await srcToBlob(fallbackSrc)
      }
      if (blob) {
        const mime = blob.type || 'image/png'
        const saved = await trySaveToAndroidGallery({
          src: src || fallbackSrc,
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
    } catch {
      // fall through to remote / shared download
    }

    const remoteSrc = fallbackSrc || src
    if (/^https?:\/\//i.test(String(remoteSrc || ''))) {
      const saved = await trySaveToAndroidGallery({
        src: remoteSrc,
        displayName: name,
        mimeType: 'image/png',
        preferRemote: true,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    }
  }

  await downloadMediaBlob({
    src: src || fallbackSrc,
    fileName: name,
    message,
    opts: {
      enableShare: true,
      shareTitle: name,
      defaultMime: 'image/png',
      mobileOpenHint: '请长按图片保存到相册',
      fallbackSrc,
      getBlob: () => resolveImageBlob(img),
    },
  })
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

async function onBatchDownload(item) {
  const images = item?.images || []
  if (!images.length) {
    message.warning('暂无图片')
    return
  }
  for (let idx = 0; idx < images.length; idx += 1) {
    await downloadImage(item.id, idx, images[idx], `gen-${item.id}-${idx}.png`)
  }
}

async function onUseFirstAsReference(item) {
  const img = item?.images?.[0]
  if (!img) {
    message.warning('暂无图片')
    return
  }
  await useAsReference(item, 0, img)
}

function onMakeVideo(item) {
  const img = item?.images?.[0]
  if (!img) {
    message.warning('暂无图片')
    return
  }
  message.info('请到「生视频」页上传参考图后继续')
  router.push('/video')
}

async function onAgainBatch(item) {
  const text = String(item?.prompt || '').trim()
  if (!text) {
    message.warning('缺少提示词')
    return
  }
  applyItemParams(item)
  prompt.value = text
  await generate()
}

async function onRetryItem(item) {
  const text = String(item?.prompt || '').trim()
  if (!text) {
    message.warning('缺少提示词，无法重试')
    return
  }
  if (
    item.mode === 'img2img' &&
    !previewUrl.value &&
    !(refThumbMap.value[item.id] || item.refPreview)
  ) {
    message.warning('图生图请先重新选择参考图')
    paramsDrawerShow.value = true
    applyItemParams(item)
    prompt.value = text
    return
  }
  applyItemParams(item)
  prompt.value = text
  await generate()
}

function cardHdMeta(item) {
  return buildCardHdMeta({createdAt: item?.createdAt, summary: paramSummary(item)})
}

function bubbleMetaParts(item) {
  return buildBubbleMetaParts({
    modeLabel: item?.mode === 'img2img' ? '图生图' : '文生图',
    createdAt: item?.createdAt,
    summary: paramSummary(item),
  })
}

function onToolbarCreate() {
  moreShow.value = false
  createSession()
}
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
    <template #toolbar="{openHistory}">
      <SessionTopBar
        :history-count="imageStore.sessions.length"
        :title="sessionTitle || '图片'"
        @more="moreShow = true"
        @open-history="openHistory"
      />
    </template>

    <div class="param-capsule" aria-label="参数胶囊">
      <button class="param-cap" type="button" @click="moreShow = true">
        <strong>{{ modelCapLabel }}</strong>
      </button>
      <button class="param-cap" type="button" @click="paramsDrawerShow = true">
        尺寸 <strong>{{ sizeCapLabel }}</strong>
      </button>
      <button v-if="supportsN" class="param-cap" type="button" @click="paramsDrawerShow = true">
        张数 <strong>{{ n }}</strong>
      </button>
      <button
        v-if="mode === 'img2img'"
        class="param-cap"
        type="button"
        @click="paramsDrawerShow = true"
      >
        参考 · <strong>{{ previewUrl ? '1' : '0' }}</strong>
      </button>
      <button
        v-if="supportsQuality"
        class="param-cap"
        type="button"
        @click="paramsDrawerShow = true"
      >
        质量 <strong>{{ qualityLabel }}</strong>
      </button>
      <button class="param-cap-more" type="button" @click="paramsDrawerShow = true">更多</button>
    </div>

    <div ref="listRef" class="gallery">
      <div v-if="!timelineItems.length" class="empty-card empty-state">
        <div class="empty-art art" aria-hidden="true">◇</div>
        <div class="empty-title">从一句话开始</div>
        <p class="empty-desc">像聊天一样生成图片。提示词进时间线，结果以卡片回传。</p>
      </div>

      <template v-for="row in timelineRows" :key="row.id">
        <div v-if="row.kind === 'day'" class="tl-day">{{ row.label }}</div>

        <div v-else class="tl-turn">
          <div class="msg user">
            <div class="msg-body">
              <div class="bubble user-bubble">
                <div
                  v-if="
                    row.item.mode === 'img2img' && (refThumbMap[row.item.id] || row.item.refPreview)
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
                :disabled="isGeneratingCurrent"
                @click="onRetryItem(row.item)"
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
              <span v-if="itemStatus(row.item) === 'loading'" class="tl-pill run"> 生成中 </span>
              <span v-else class="tl-card-meta">{{ cardHdMeta(row.item) }}</span>
            </div>

            <div v-if="itemStatus(row.item) === 'loading'" class="ai-loading">
              <n-spin size="small" />
              <span>生成中…</span>
            </div>
            <div v-else-if="!row.item.images?.length" class="ai-error">暂无图片</div>
            <div v-else class="imgs">
              <div
                v-for="(img, idx) in row.item.images"
                :key="img.id || idx"
                class="img-wrap"
                :style="thumbStyle(row.item, idx, 480)"
              >
                <div class="img-actions">
                  <n-button
                    aria-label="更多操作"
                    circle
                    class="touch-target"
                    quaternary
                    size="tiny"
                    @click.stop="openCardActions(row.item, idx, img)"
                  >
                    <template #icon>
                      <n-icon :component="EllipsisHorizontalOutline" :size="16" />
                    </template>
                  </n-button>
                </div>
                <img
                  :src="displaySrc(row.item.id, idx, img) || img.remoteUrl || img.src || ''"
                  alt="generated"
                  @click="openLightbox(row.item, idx, img)"
                  @load="onThumbLoad(row.item, idx, $event)"
                />
                <div v-if="isTemporary(img)" class="temp-tip" title="临时链接，可能过期">
                  临时链接，可能过期
                </div>
              </div>
            </div>

            <div
              v-if="itemStatus(row.item) !== 'loading' && row.item.images?.length"
              class="tl-actions"
            >
              <button class="mini" type="button" @click="onBatchDownload(row.item)">下载</button>
              <button class="mini" type="button" @click="onUseFirstAsReference(row.item)">
                用作参考
              </button>
              <button class="mini" type="button" @click="onMakeVideo(row.item)">做视频</button>
              <button
                class="mini primary"
                type="button"
                :disabled="isGeneratingCurrent"
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
            domain="image"
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
              domain="image"
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
          domain="image"
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
              :class="{active: mode === 'txt2img'}"
              class="mode-item"
              type="button"
              @click="mode = 'txt2img'"
            >
              文生图
            </button>
            <button
              :class="{active: mode === 'img2img'}"
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
          </div>
        </div>

        <div class="params-grid">
          <div v-if="supportsN" class="params-section">
            <div class="params-label">数量</div>
            <n-input-number
              v-model:value="n"
              :max="4"
              :min="1"
              class="params-control"
              size="medium"
            />
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

        <n-button block class="params-done" type="primary" @click="paramsDrawerShow = false">
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
      <img v-if="lightboxSrc" :src="lightboxSrc" alt="preview" />
    </div>
    <template v-if="lightboxPayload" #footer>
      <div class="lightbox-footer">
        <n-button class="lightbox-action" secondary size="small" @click="useLightboxAsReference">
          设为参考图
        </n-button>
        <n-button
          class="lightbox-action"
          secondary
          size="small"
          @click="
            downloadImage(
              lightboxPayload.itemId,
              lightboxPayload.idx,
              lightboxPayload.img,
              lightboxPayload.name,
            )
          "
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
          <ModelSelect kind="image" sheet size="medium" />
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
    <n-drawer-content closable title="图片操作">
      <div class="more-sheet">
        <n-button block secondary @click="onCardDownload">
          <template #icon>
            <n-icon :component="DownloadOutline" />
          </template>
          下载
        </n-button>
        <n-button block secondary @click="onCardUseAsReference">
          <template #icon>
            <n-icon :component="ImageOutline" />
          </template>
          设为参考图
        </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped src="./ImageView.scss"></style>
