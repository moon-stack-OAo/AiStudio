<script setup>
import {TrashOutline, CopyOutline} from '@vicons/ionicons5'
import {useLogsSettings} from '@core/composables/useLogsSettings'

defineProps({
  /** desktop | android */
  variant: {
    type: String,
    default: 'desktop',
  },
})

const {
  logs,
  listRef,
  copying,
  levelOptions,
  summaryText,
  formatEntryTime,
  onCopyAll,
  onCopyEntry,
  onClear,
} = useLogsSettings()
</script>

<template>
  <div class="tab-pane logs-pane">
    <div class="logs-wrap">
      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">运行日志</div>
            <div class="section-desc">记录应用关键事件与控制台输出，仅保存在本机</div>
          </div>
        </div>

        <div class="logs-toolbar">
          <n-select
            class="logs-filter"
            :options="levelOptions"
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="logs.levelFilter"
            @update:value="(v) => logs.setLevelFilter(v)"
          />
          <n-input
            class="logs-search"
            clearable
            placeholder="搜索消息 / 来源"
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="logs.query"
            @update:value="(v) => logs.setQuery(v)"
          />
          <span class="logs-summary">{{ summaryText }}</span>
        </div>

        <div class="logs-actions">
          <n-button
            :loading="copying"
            :size="variant === 'desktop' ? 'small' : undefined"
            quaternary
            @click="onCopyAll"
          >
            <template #icon>
              <n-icon :component="CopyOutline" />
            </template>
            复制
          </n-button>
          <n-button
            :size="variant === 'desktop' ? 'small' : undefined"
            quaternary
            type="error"
            @click="onClear"
          >
            <template #icon>
              <n-icon :component="TrashOutline" />
            </template>
            清空
          </n-button>
        </div>
      </div>

      <div class="section-card data-card logs-list-card">
        <div ref="listRef" class="logs-list">
          <div v-if="!logs.filtered.length" class="logs-empty">暂无匹配的日志</div>
          <div
            v-for="item in logs.filtered"
            :key="item.id"
            class="log-item"
            :class="[`log-item--${item.level}`]"
          >
            <span class="log-item-time">{{ formatEntryTime(item.ts) }}</span>
            <span class="log-item-level">{{ item.level }}</span>
            <div class="log-item-body">
              <span class="log-item-source" :title="item.source">[{{ item.source }}]</span>
              <span class="log-item-message">{{ item.message }}</span>
              <div v-if="item.detail" class="log-item-detail">{{ item.detail }}</div>
            </div>
            <n-button
              class="log-item-copy"
              :size="variant === 'desktop' ? 'tiny' : 'small'"
              quaternary
              aria-label="复制本条"
              @click="onCopyEntry(item)"
            >
              <template #icon>
                <n-icon :component="CopyOutline" />
              </template>
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
