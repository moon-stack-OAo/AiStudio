<script setup>
defineOptions({name: 'ImageView'})

import {computed, ref} from 'vue'
import {
  DownloadOutline,
  ImageOutline,
  OptionsOutline,
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
import {useImageSession} from '@core/composables/useImageSession'
import {downloadMediaBlob} from '@core/composables/useMediaDownload'
import {useManualDropdown} from '@/composables/useManualDropdown'
import {getPromptPlaceholder} from '@core/prompts'
import {renderSelectLabel} from '@core/utils/selectRender'

const {isMobile, isCompact} = useBreakpoints()
const {tooltipTrigger} = useTooltipTrigger()
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
  refThumbMap,
  lightboxShow,
  lightboxSrc,
  lightboxTitle,
  lightboxPayload,
  session,
  supportsQuality,
  supportsN,
  showSize,
  useAspectRatio,
  isGeneratingCurrent,
  canGenerate,
  timelineItems,
  sizeOptions: sizeOptionsDesktop,
  aspectOptions,
  qualityOptions: qualityOptionsDesktop,
  paramsSummary,
  drawerHeight,
  sendTooltip,
  itemStatus,
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
  generate,
  stopGenerate,
  selectSession,
  createSession,
  removeSession,
  copyPrompt,
  copyErrorText,
  clearItems,
  onComposerFocus,
} = useImageSession()

const paramsDrawerShow = ref(false)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('image', mode.value, {isMobile: isMobile.value}),
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

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  if (!src) {
    message.warning('图片不可用')
    return
  }
  await downloadMediaBlob({
    src,
    fileName: name,
    message,
    opts: {
      enableShare: true,
      shareTitle: name,
      defaultMime: 'image/png',
      mobileOpenHint: '请长按图片保存到相册',
    },
  })
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

function onAiBubbleContextMenu(e, item) {
  const status = itemStatus(item)
  if (status === 'loading') return

  if (status === 'error' || !item?.images?.length) {
    openCtxMenu(e, [{label: '复制错误信息', key: 'copy-error'}], (key) => {
      if (key === 'copy-error') copyErrorText(item)
    })
    return
  }

  openCtxMenu(
    e,
    [
      {label: '下载全部', key: 'download-all'},
      {label: '设为首图为参考图', key: 'ref-first'},
    ],
    (key) => {
      if (key === 'download-all') {
        item.images.forEach((img, idx) => {
          downloadImage(item.id, idx, img, `gen-${item.id}-${idx}.png`)
        })
      } else if (key === 'ref-first') {
        useAsReference(item, 0, item.images[0])
      }
    },
  )
}
</script>

<template>
  <SessionWorkspaceShell
    :active-id="imageStore.activeId"
    :history-title="'生图历史'"
    :is-compact="isCompact"
    :is-mobile="isMobile"
    :session-title="session?.title || '生图'"
    :sessions="imageStore.sortedSessions"
    @create="createSession"
    @remove="removeSession"
    @rename="(id, title) => imageStore.renameSession(id, title)"
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
      <ModelSelect kind="image" />
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
          <div class="empty-desc">在下方输入提示词，生成结果将以时间线展示</div>
        </div>

        <template v-for="item in timelineItems" :key="item.id">
          <GenerateTimelineUserBubble
            :mode-label="item.mode === 'txt2img' ? '文生图' : '图生图'"
            :param-summary="paramSummary(item)"
            :prompt="item.prompt"
            :ref-thumb-src="
              item.mode === 'img2img' ? refThumbMap[item.id] || item.refPreview || null : null
            "
            ref-previewable
            :copied="copiedId === item.id"
            show-refill
            @copy="copyPrompt(item)"
            @refill="onRefillPrompt(item)"
            @preview-ref="openRefLightbox"
            @contextmenu="onUserBubbleContextMenu($event, item)"
          />

          <div :class="['msg', 'assistant', {error: itemStatus(item) === 'error'}]">
            <div class="role">AI</div>
            <div class="msg-body">
              <div class="bubble ai-bubble" @contextmenu="onAiBubbleContextMenu($event, item)">
                <div v-if="itemStatus(item) === 'loading'" class="ai-loading">
                  <n-spin size="small" />
                  <span>生成中…</span>
                </div>
                <div v-else-if="itemStatus(item) === 'error'" class="ai-error">
                  {{ item.errorMessage || '生成失败' }}
                </div>
                <div v-else-if="!item.images?.length" class="ai-error">暂无图片</div>
                <div v-else class="imgs">
                  <div v-for="(img, idx) in item.images" :key="img.id || idx" class="img-wrap">
                    <div class="img-actions">
                      <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                        <template #trigger>
                          <n-button
                            circle
                            quaternary
                            size="tiny"
                            aria-label="下载图片"
                            class="touch-target"
                            @click.stop="
                              downloadImage(item.id, idx, img, `gen-${item.id}-${idx}.png`)
                            "
                          >
                            <template #icon>
                              <n-icon :component="DownloadOutline" :size="14" />
                            </template>
                          </n-button>
                        </template>
                        下载
                      </n-tooltip>
                      <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                        <template #trigger>
                          <n-button
                            circle
                            quaternary
                            size="tiny"
                            aria-label="设为参考图"
                            class="touch-target"
                            @click.stop="useAsReference(item, idx, img)"
                          >
                            <template #icon>
                              <n-icon :component="ImageOutline" :size="14" />
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
                domain="image"
                :mode="mode"
                :disabled="isGeneratingCurrent"
                :compact="isMobile"
                @apply="onApplyPrompt"
              />
              <PromptEnhanceButton
                domain="image"
                :mode="mode"
                :text="prompt"
                :disabled="isGeneratingCurrent"
                :compact="isMobile"
                @apply="onApplyPrompt"
              />
            </div>
            <PromptBuilderCollapse
              domain="image"
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

          <div class="opt-group">
            <label v-if="supportsN" class="opt-item opt-count" title="数量">
              <span class="opt-label">数量</span>
              <n-input-number v-model:value="n" :max="4" :min="1" size="small" />
            </label>
            <label v-if="showSize" class="opt-item opt-size" title="尺寸">
              <span class="opt-label">尺寸</span>
              <n-select
                v-model:value="size"
                :options="sizeOptionsDesktop"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
            <label v-if="useAspectRatio" class="opt-item opt-ratio" title="比例">
              <span class="opt-label">比例</span>
              <n-select
                v-model:value="aspectRatio"
                :options="aspectOptions"
                :render-label="renderSelectLabel"
                size="small"
              />
            </label>
            <label v-if="supportsQuality" class="opt-item opt-quality" title="质量">
              <span class="opt-label">质量</span>
              <n-select
                v-model:value="quality"
                :options="qualityOptionsDesktop"
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
          <div v-if="mode === 'img2img' && !isMobile" class="upload-row">
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
            v-else-if="mode === 'img2img' && isMobile && previewUrl"
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
            :options="qualityOptionsDesktop"
            :render-label="renderSelectLabel"
            class="params-control"
            size="medium"
          />
        </div>

        <div v-if="showSize" class="params-section params-section-full">
          <div class="params-label">尺寸</div>
          <n-select
            v-model:value="size"
            :options="sizeOptionsDesktop"
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

<style lang="scss" scoped src="./ImageView.scss"></style>
