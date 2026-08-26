<script setup>
import {computed} from 'vue'

const props = defineProps({
  show: {type: Boolean, default: false},
  original: {type: String, default: ''},
  polished: {type: String, default: ''},
  loading: {type: Boolean, default: false},
  styleValue: {type: String, default: ''},
  styleOptions: {type: Array, default: () => []},
})

const emit = defineEmits([
  'update:show',
  'update:styleValue',
  'replace',
  'repolish',
  'cancel',
])

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const currentStyle = computed({
  get: () => props.styleValue,
  set: (v) => emit('update:styleValue', v),
})

function onCancel() {
  emit('cancel')
  visible.value = false
}

function onReplace() {
  if (!props.polished.trim() || props.loading) return
  emit('replace')
}

function onRepolish() {
  if (props.loading) return
  emit('repolish')
}
</script>

<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="!loading"
    :closable="!loading"
    preset="card"
    title="润色结果"
    style="width: min(720px, 94vw)"
    @close="onCancel"
  >
    <div class="polish-body">
      <div v-if="styleOptions.length" class="style-row">
        <span class="style-label">风格</span>
        <n-select
          v-model:value="currentStyle"
          :disabled="loading"
          :options="styleOptions"
          size="small"
          style="width: 140px"
        />
      </div>

      <div class="compare">
        <div class="pane">
          <div class="pane-title">原文</div>
          <n-input
            :autosize="{ minRows: 4, maxRows: 10 }"
            :value="original"
            readonly
            type="textarea"
          />
        </div>
        <div class="pane">
          <div class="pane-title">润色结果</div>
          <n-spin :show="loading">
            <n-input
              :autosize="{ minRows: 4, maxRows: 10 }"
              :placeholder="loading ? '润色中…' : ''"
              :value="polished"
              readonly
              type="textarea"
            />
          </n-spin>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="footer-actions">
        <n-button :disabled="loading" @click="onCancel">取消</n-button>
        <n-button :disabled="loading" :loading="loading" @click="onRepolish">
          再润色
        </n-button>
        <n-button
          :disabled="!polished.trim() || loading"
          type="primary"
          @click="onReplace"
        >
          替换
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style lang="scss" scoped>
.polish-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.style-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.style-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.pane-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 767.98px) {
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
