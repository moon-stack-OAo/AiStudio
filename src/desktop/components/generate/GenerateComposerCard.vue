<script setup>
import {SparklesOutline} from '@vicons/ionicons5'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'

defineProps({
  /** 提示词，配合 v-model:prompt */
  prompt: {type: String, default: ''},
  /** 是否移动端布局 */
  isMobile: {type: Boolean, default: false},
  /** 当前会话是否正在生成 */
  loading: {type: Boolean, default: false},
  /** 发送按钮是否禁用 */
  disabled: {type: Boolean, default: false},
  /** 输入框占位文案 */
  placeholder: {type: String, default: ''},
  /** 是否显示 composer-hint（桌面常显；移动端仅生成中显示） */
  showHint: {type: Boolean, default: true},
  /** hint 是否 critical/错误样式（移动端生成中） */
  hintCritical: {type: Boolean, default: false},
  /** 空闲时 hint 文案 */
  hintIdle: {
    type: String,
    default: 'Enter 生成 · Shift+Enter 换行 · Ctrl+V 粘贴参考图',
  },
  /** 生成中 hint 文案 */
  hintLoading: {type: String, default: '生成中可点击停止'},
  /** 发送按钮图标 */
  sendIcon: {type: [Object, Function], default: () => SparklesOutline},
  /** 发送按钮 tooltip */
  sendTooltip: {type: String, default: '生成'},
})

const emit = defineEmits(['update:prompt', 'send', 'stop', 'focus', 'keydown'])
</script>

<template>
  <div class="composer">
    <div v-if="showHint" :class="{'is-critical': hintCritical}" class="composer-hint">
      {{ loading ? hintLoading : hintIdle }}
    </div>
    <div class="composer-card">
      <!-- 桌面端参数条 -->
      <div v-if="!isMobile && $slots.toolbar" class="composer-toolbar">
        <slot name="toolbar" />
      </div>

      <!-- 移动端参数摘要 -->
      <slot v-else-if="isMobile" name="params-summary" />

      <!-- 参考图 / ref-chip -->
      <slot name="reference" />

      <!-- 提示词辅助（示例 chips / 随机等） -->
      <slot name="prompt-assist" />

      <div class="composer-input">
        <n-input
          :value="prompt"
          :autosize="{minRows: isMobile ? 1 : 3, maxRows: isMobile ? 4 : 8}"
          :disabled="loading"
          class="composer-field"
          :placeholder="placeholder"
          type="textarea"
          @update:value="emit('update:prompt', $event)"
          @focus="emit('focus', $event)"
          @keydown="emit('keydown', $event)"
        />
        <div class="composer-actions">
          <slot name="footer">
            <ComposerSendStop
              with-tooltip
              :disabled="disabled"
              :loading="loading"
              :send-icon="sendIcon"
              :send-tooltip="sendTooltip"
              @send="emit('send')"
              @stop="emit('stop')"
            />
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 壳内 .composer* 节点需本组件 scoped；slot（toolbar/reference）仍由父级 scoped 生效 */
@use '@/styles/session-workspace.scss';
@use '@/styles/generate-workspace.scss';
</style>
