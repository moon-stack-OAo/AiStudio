<script setup>
import {computed, ref, watch} from 'vue'
import {useChatStore} from '@core/stores/chat'
import {useSettingsStore} from '@core/stores/settings'

const props = defineProps({
  sessionId: {type: String, default: ''},
})

const emit = defineEmits(['saved'])

const chatStore = useChatStore()
const settings = useSettingsStore()

const session = computed(() => chatStore.sessions.find((s) => s.id === props.sessionId) || null)

const useCustomTemp = ref(false)
const useCustomSystem = ref(false)
const draftTemp = ref(settings.chatTemperature)
const draftSystem = ref('')

function syncFromSession() {
  const ov = session.value?.overrides || {}
  useCustomTemp.value =
    Object.prototype.hasOwnProperty.call(ov, 'temperature') && ov.temperature != null
  useCustomSystem.value =
    Object.prototype.hasOwnProperty.call(ov, 'systemPrompt') && ov.systemPrompt != null
  draftTemp.value = useCustomTemp.value ? Number(ov.temperature) : settings.chatTemperature
  draftSystem.value = useCustomSystem.value ? String(ov.systemPrompt ?? '') : settings.chatSystemPrompt
}

watch(
  () => [props.sessionId, session.value?.updatedAt],
  () => syncFromSession(),
  {immediate: true},
)

function save() {
  if (!props.sessionId) return
  const patch = {}
  patch.temperature = useCustomTemp.value ? draftTemp.value : null
  patch.systemPrompt = useCustomSystem.value ? draftSystem.value : null
  chatStore.setSessionOverrides(props.sessionId, patch)
  emit('saved')
}

defineExpose({save, syncFromSession})
</script>

<template>
  <div class="overrides-panel">
    <div class="ov-block">
      <div class="ov-row">
        <n-switch :value="useCustomTemp" size="small" @update:value="(v) => (useCustomTemp = v)" />
        <span class="ov-label">自定义 Temperature</span>
        <span v-if="!useCustomTemp" class="ov-meta">全局 {{ settings.chatTemperature.toFixed(1) }}</span>
        <span v-else class="ov-meta">{{ Number(draftTemp).toFixed(1) }}</span>
      </div>
      <n-slider
        v-if="useCustomTemp"
        :max="2"
        :min="0"
        :step="0.1"
        :value="draftTemp"
        size="small"
        @update:value="(v) => (draftTemp = v)"
      />
    </div>

    <div class="ov-block">
      <div class="ov-row">
        <n-switch
          :value="useCustomSystem"
          size="small"
          @update:value="(v) => (useCustomSystem = v)"
        />
        <span class="ov-label">自定义 System Prompt</span>
      </div>
      <div v-if="!useCustomSystem" class="ov-hint">
        跟随全局{{ settings.chatSystemPrompt ? '（已配置）' : '（空）' }}
      </div>
      <n-input
        v-else
        :autosize="{minRows: 3, maxRows: 8}"
        :value="draftSystem"
        placeholder="本会话专用 System Prompt；可留空表示本会话不发送 system"
        size="small"
        type="textarea"
        @update:value="(v) => (draftSystem = v)"
      />
    </div>

    <div class="ov-actions">
      <n-button size="small" type="primary" @click="save">保存</n-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.overrides-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ov-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ov-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ov-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}

.ov-meta {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-hover);
  font-variant-numeric: tabular-nums;
}

.ov-hint {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.45;
}

.ov-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}
</style>
