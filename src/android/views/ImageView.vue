<script setup>
defineOptions({name: 'ImageView'})

import {ref} from 'vue'
import {
  AddOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  ImageOutline,
  OptionsOutline,
  SparklesOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import {useImageSession} from '@core/composables/useImageSession'
import {appFetch} from '@core/utils/http'
import {isAndroidTauri, isDesktopTauri} from '@core/utils/request'
import {trySaveToAndroidGallery} from '@core/utils/androidMediaSave'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

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
  sizeOptions,
  aspectOptions,
  qualityOptions,
  paramsSummary,
  drawerHeight,
  sessionTitle,
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
  clearItems: clearItemsCore,
  onComposerFocus,
} = useImageSession({notifyCreateSession: true})

const paramsDrawerShow = ref(false)
const moreShow = ref(false)
const cardActionShow = ref(false)
const cardActionTarget = ref(null)
useBackCloseLayer(lightboxShow)
useBackCloseLayer(paramsDrawerShow)
useBackCloseLayer(moreShow)
useBackCloseLayer(cardActionShow)

function clearItems() {
  moreShow.value = false
  clearItemsCore()
}

async function srcToBlob(src) {
  if (src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }
  if (src.startsWith('data:')) {
    const res = await fetch(src)
    return res.blob()
  }
  const res = await appFetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

function triggerAnchorDownload(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  a.click()
}

async function downloadImage(itemId, idx, img, name = 'image.png') {
  const src = await resolveImageSrc(itemId, idx, img)
  if (!src) {
    message.warning('图片不可用')
    return
  }

  const mobileLike = !isDesktopTauri()

  try {
    const blob = await srcToBlob(src)
    const mime = blob.type || 'image/png'

    if (isAndroidTauri()) {
      const saved = await trySaveToAndroidGallery({
        src,
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

    const file = new File([blob], name, {type: mime})

    if (
      mobileLike &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function'
    ) {
      try {
        if (navigator.canShare({files: [file]})) {
          await navigator.share({files: [file], title: name})
          message.success('已分享图片')
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      triggerAnchorDownload(objectUrl, name)
      if (mobileLike) message.success('已开始下载')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    } catch {
      window.open(objectUrl, '_blank', 'noopener')
      message.warning(mobileLike ? '请长按图片保存到相册' : '下载失败，已尝试在新窗口打开')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
  } catch {
    if (isAndroidTauri()) {
      const saved = await trySaveToAndroidGallery({
        src,
        displayName: name,
        mimeType: 'image/png',
        preferRemote: true,
      })
      if (saved.ok) {
        message.success('已保存到相册')
        return
      }
    }
    try {
      triggerAnchorDownload(src, name)
      if (mobileLike) message.success('已开始下载')
    } catch {
      window.open(src, '_blank', 'noopener')
      message.warning(mobileLike ? '请长按图片保存到相册' : '下载失败，已尝试在新窗口打开')
    }
  }
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
      <div class="image-toolbar">
        <SessionHistoryButton :count="imageStore.sessions.length" @click="openHistory" />

        <div class="image-title">{{ sessionTitle }}</div>

        <n-button
          aria-label="新建会话"
          circle
          class="touch-target"
          quaternary
          @click="createSession"
        >
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
        </n-button>

        <n-button aria-label="更多" circle class="touch-target" quaternary @click="moreShow = true">
          <template #icon>
            <n-icon :component="EllipsisHorizontalOutline" />
          </template>
        </n-button>
      </div>
    </template>

    <div ref="listRef" class="gallery">
      <div v-if="!timelineItems.length" class="empty">
        <div class="empty-title">开始创作</div>
        <div class="empty-desc">输入提示词即可生成</div>
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
                <n-tag v-if="paramSummary(item)" :bordered="false" size="tiny" type="info">
                  {{ paramSummary(item) }}
                </n-tag>
              </div>
              <div
                v-if="item.mode === 'img2img' && (refThumbMap[item.id] || item.refPreview)"
                class="ref-thumb"
              >
                <img
                  :src="refThumbMap[item.id] || item.refPreview"
                  alt="reference"
                  title="点击预览"
                  @click="openRefLightbox(refThumbMap[item.id] || item.refPreview)"
                />
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

        <div :class="['msg', 'assistant', {error: itemStatus(item) === 'error'}]">
          <div class="role">AI</div>
          <div class="msg-body">
            <div class="bubble ai-bubble">
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
                    <n-button
                      aria-label="更多操作"
                      circle
                      class="touch-target"
                      quaternary
                      size="tiny"
                      @click.stop="openCardActions(item, idx, img)"
                    >
                      <template #icon>
                        <n-icon :component="EllipsisHorizontalOutline" :size="16" />
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
          </div>
        </div>
      </template>
    </div>

    <template #composer>
      <div class="composer">
        <div v-if="isGeneratingCurrent" class="composer-hint is-critical">生成中可点击停止</div>
        <div class="composer-card">
          <button class="params-summary" type="button" @click="paramsDrawerShow = true">
            <n-icon :component="OptionsOutline" :size="16" class="params-summary-icon" />
            <span class="params-summary-text">{{ paramsSummary }}</span>
            <span class="params-summary-action">设置</span>
          </button>

          <button
            v-if="mode === 'img2img' && previewUrl"
            class="ref-chip ref-chip-mobile"
            type="button"
            @click="paramsDrawerShow = true"
          >
            <img :src="previewUrl" alt="reference" />
            <span class="ref-name">参考图已选，点击可更换</span>
          </button>

          <div class="composer-input">
            <n-input
              v-model:value="prompt"
              :autosize="{minRows: 1, maxRows: 4}"
              :disabled="isGeneratingCurrent"
              class="composer-field"
              placeholder="描述画面…"
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
    </template>
  </SessionWorkspaceShell>

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
