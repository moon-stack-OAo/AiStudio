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
import GenerateComposerCard from '@/components/generate/GenerateComposerCard.vue'
import GenerateParamsDrawer from '@/components/generate/GenerateParamsDrawer.vue'
import GenerateParamsPanel from '@/components/generate/GenerateParamsPanel.vue'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import {useImageSession} from '@core/composables/useImageSession'
import {downloadMediaBlob} from '@core/composables/useMediaDownload'
import {useManualDropdown} from '@/composables/useManualDropdown'
import {getPromptPlaceholder} from '@core/prompts'
import {formatBatchSectionLabel} from '@core/utils/datetime'
import {renderSelectLabel} from '@core/utils/selectRender'

const {isMobile, isCompact, isWide} = useBreakpoints()
const {tooltipTrigger} = useTooltipTrigger()
const {
  imageStore,
  settings,
  message,
  mode,
  prompt,
  n,
  size,
  aspectRatio,
  quality,
  previewUrl,
  listRef,
  bottomRef,
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
  onThumbLoad,
  onUpload,
  clearUpload,
  displaySrc,
  isTemporary,
  openLightbox,
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
  clearItems,
  copyErrorText,
  onComposerFocus,
} = useImageSession()

const paramsDrawerShow = ref(false)
const useStudioSplit = computed(() => isWide.value)

const promptPlaceholder = computed(() =>
  getPromptPlaceholder('image', mode.value, {isMobile: isMobile.value}),
)

const generateLabel = computed(() => {
  if (supportsN.value && Number(n.value) > 1) return `生成 ${n.value} 张`
  return '生成'
})

const galleryBatches = computed(() => {
  const groups = new Map()
  for (const item of timelineItems.value) {
    const t = Number(item?.createdAt) || 0
    const d = new Date(t || Date.now())
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!groups.has(key)) {
      groups.set(key, {key, createdAt: t || Date.now(), items: []})
    }
    const g = groups.get(key)
    g.items.push(item)
    if (t && (!g.createdAt || t < g.createdAt)) g.createdAt = t
  }
  return [...groups.values()].map((g) => ({
    ...g,
    label: formatBatchSectionLabel(g.createdAt),
    cells: g.items.flatMap((item) => buildGalleryCells(item)),
  }))
})

function buildGalleryCells(item) {
  const status = itemStatus(item)
  if (status === 'loading') {
    const count = Math.max(1, Number(item?.n) || Number(n.value) || 1)
    return Array.from({length: count}, (_, idx) => ({
      key: `${item.id}:loading:${idx}`,
      kind: 'loading',
      item,
      idx,
      label: idx === 0 ? '生成中…' : '排队',
    }))
  }
  if (status === 'error' || !item?.images?.length) {
    return [
      {
        key: `${item.id}:error`,
        kind: 'error',
        item,
        idx: 0,
        label: '失败',
        errorMessage: item?.errorMessage || '生成失败',
      },
    ]
  }
  return item.images.map((img, idx) => ({
    key: `${item.id}:${img.id || idx}`,
    kind: 'done',
    item,
    img,
    idx,
    label: `${String(idx + 1).padStart(2, '0')} · 完成`,
  }))
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

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  const fallbackSrc = resolveImageFallbackSrc(img)
  if (!src && !fallbackSrc) {
    message.warning('图片不可用')
    return
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

function onThumbContextMenu(e, cell) {
  if (cell.kind === 'loading') return
  if (cell.kind === 'error') {
    openCtxMenu(e, [{label: '复制错误信息', key: 'copy-error'}], (key) => {
      if (key === 'copy-error') copyErrorText(cell.item)
    })
    return
  }
  openCtxMenu(
    e,
    [
      {label: '下载', key: 'download'},
      {label: '设为参考图', key: 'ref'},
    ],
    (key) => {
      if (key === 'download') {
        downloadImage(cell.item.id, cell.idx, cell.img, `gen-${cell.item.id}-${cell.idx}.png`)
      } else if (key === 'ref') {
        useAsReference(cell.item, cell.idx, cell.img)
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
      <ModelSelect kind="image" />
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
        aria-label="清空画廊"
        quaternary
        size="small"
        class="toolbar-clear"
        @click="clearItems"
      >
        清空
      </n-button>
    </template>

    <div :class="['content', {'gen-split': useStudioSplit}]">
      <div ref="listRef" class="gallery">
        <div v-if="!timelineItems.length" class="empty empty-state gallery-empty">
          <div class="empty-art" aria-hidden="true">▦</div>
          <div class="empty-title">开始创作</div>
          <div class="empty-desc">
            {{
              useStudioSplit
                ? '在右侧填写提示词，生成结果将显示在画廊中'
                : '在下方输入提示词，生成结果将显示在画廊中'
            }}
          </div>
        </div>

        <div v-for="batch in galleryBatches" :key="batch.key" class="gallery-batch">
          <div class="section-label">{{ batch.label }}</div>
          <div class="gallery-grid">
            <div
              v-for="cell in batch.cells"
              :key="cell.key"
              :class="[
                'gallery-thumb',
                {
                  'is-generating': cell.kind === 'loading',
                  'is-error': cell.kind === 'error',
                },
              ]"
              @contextmenu="onThumbContextMenu($event, cell)"
            >
              <template v-if="cell.kind === 'done'">
                <div class="gallery-thumb-actions">
                  <n-tooltip :trigger="tooltipTrigger" placement="bottom">
                    <template #trigger>
                      <n-button
                        circle
                        quaternary
                        size="tiny"
                        aria-label="下载图片"
                        class="touch-target"
                        @click.stop="
                          downloadImage(
                            cell.item.id,
                            cell.idx,
                            cell.img,
                            `gen-${cell.item.id}-${cell.idx}.png`,
                          )
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
                        @click.stop="useAsReference(cell.item, cell.idx, cell.img)"
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
                  :src="
                    displaySrc(cell.item.id, cell.idx, cell.img) ||
                    cell.img.remoteUrl ||
                    cell.img.src ||
                    ''
                  "
                  alt="generated"
                  @click="openLightbox(cell.item, cell.idx, cell.img)"
                  @load="onThumbLoad(cell.item, cell.idx, $event)"
                />
                <div v-if="isTemporary(cell.img)" class="temp-tip" title="临时链接，可能过期">
                  临时
                </div>
              </template>
              <template v-else-if="cell.kind === 'error'">
                <div class="gallery-thumb-error">{{ cell.errorMessage }}</div>
              </template>
              <span class="gallery-thumb-label">{{ cell.label }}</span>
            </div>
          </div>
        </div>
        <div ref="bottomRef" class="gallery-anchor" aria-hidden="true" />
      </div>

      <GenerateParamsPanel v-if="useStudioSplit" title="参数">
        <div class="params-field">
          <div class="params-field-label">模式</div>
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
              domain="image"
              :mode="mode"
              :text="prompt"
              :disabled="isGeneratingCurrent"
              @apply="onApplyPrompt"
            />
            <PromptAssist
              domain="image"
              :mode="mode"
              :disabled="isGeneratingCurrent"
              @apply="onApplyPrompt"
            />
          </div>
          <PromptBuilderCollapse
            domain="image"
            :mode="mode"
            :disabled="isGeneratingCurrent"
            @apply="onApplyPrompt"
          />
        </div>

        <div v-if="mode === 'img2img'" class="params-field">
          <div class="params-field-label">参考图</div>
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
              上传 / 粘贴参考图
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

        <div v-if="supportsN" class="params-field">
          <div class="params-field-label">数量</div>
          <div class="chip-row">
            <button
              v-for="count in [1, 2, 3, 4]"
              :key="count"
              :class="['opt-chip', {'is-active': n === count}]"
              type="button"
              @click="n = count"
            >
              ×{{ count }}
            </button>
          </div>
        </div>

        <div v-if="useAspectRatio" class="params-field">
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
          <div class="params-field-label">尺寸</div>
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

        <div v-if="supportsQuality" class="params-field">
          <div class="params-field-label">质量</div>
          <div class="chip-row">
            <button
              v-for="opt in qualityOptionsDesktop"
              :key="opt.value"
              :class="['opt-chip', {'is-active': quality === opt.value}]"
              type="button"
              @click="quality = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
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
            {{ generateLabel }}
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
        :send-label="generateLabel"
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

    <GenerateParamsDrawer
      v-if="!useStudioSplit"
      v-model:show="paramsDrawerShow"
      :height="drawerHeight"
    >
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
