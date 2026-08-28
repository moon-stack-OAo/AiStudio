<script setup>
import CopyIconButton from '@core/components/CopyIconButton.vue'

defineProps({
  /** 模式标签，如「文生图」「图生视频」 */
  modeLabel: {type: String, required: true},
  /** 参数摘要，如「2 张 · 1920×1080 · 标准」 */
  paramSummary: {type: String, default: ''},
  /** 提示词文本 */
  prompt: {type: String, default: ''},
  /** 可选参考图缩略图地址 */
  refThumbSrc: {type: String, default: null},
  /** 是否可点击参考图预览（图生图侧开启） */
  refPreviewable: {type: Boolean, default: false},
  /** 复制按钮激活态（已复制反馈） */
  copied: {type: Boolean, default: false},
})

defineEmits(['copy', 'preview-ref'])
</script>

<template>
  <div class="msg user">
    <div class="role">你</div>
    <div class="msg-body">
      <div class="bubble user-bubble">
        <div class="bubble-tags">
          <n-tag :bordered="false" size="tiny">
            {{ modeLabel }}
          </n-tag>
          <n-tag
            v-if="paramSummary"
            :bordered="false"
            size="tiny"
            type="info"
          >
            {{ paramSummary }}
          </n-tag>
        </div>
        <div
          v-if="refThumbSrc"
          class="ref-thumb"
        >
          <img
            :src="refThumbSrc"
            alt="reference"
            :title="refPreviewable ? '点击预览' : undefined"
            @click="refPreviewable && $emit('preview-ref', refThumbSrc)"
          />
        </div>
        <div class="prompt-text">{{ prompt }}</div>
      </div>
      <div v-if="prompt" class="msg-actions">
        <CopyIconButton
          :active="copied"
          tooltip="复制提示词"
          @click="$emit('copy')"
        />
      </div>
    </div>
  </div>
</template>
