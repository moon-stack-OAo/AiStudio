<script setup>
import {computed, ref} from 'vue'
import {FlashOutline, RefreshOutline, TrashOutline} from '@vicons/ionicons5'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useProvidersSettings} from '@core/composables/useProvidersSettings'

const {
  settings,
  showViteCorsProxy,
  selectedId,
  testing,
  current,
  baseUrlRiskHint,
  modelsLoading,
  chatModelOptions,
  imageModelOptions,
  videoModelOptions,
  canRemoveCurrent,
  providerTypeOptions,
  providerTypeLabel,
  onSelect,
  patch,
  addCustom,
  removeCurrent,
  reset,
  testConnection,
  refreshModelLists,
} = useProvidersSettings()

const tipsOpen = ref(false)

const providerOptions = computed(() =>
  settings.providers.map((p) => ({
    label: p.id === settings.activeProviderId ? `${p.name}（当前）` : p.name,
    value: p.id,
  })),
)

defineExpose({addCustom, reset})
</script>

<template>
  <div class="providers-page">
    <div class="picker-card">
      <div class="picker-label">当前提供商</div>
      <n-select
        :options="providerOptions"
        :render-label="renderSelectLabel"
        :value="selectedId"
        @update:value="onSelect"
      />
      <div v-if="current" class="picker-meta">
        <span class="type-tag">{{ providerTypeLabel(current.provider) }}</span>
        <span class="url">{{ current.baseUrl || '未填写 Base URL' }}</span>
      </div>
    </div>

    <div v-if="current" class="form-card">
      <div class="group">
        <div class="group-title">基本信息</div>
        <div class="field">
          <div class="field-label">名称</div>
          <n-input
            :value="current.name"
            placeholder="例如 OpenAI / Grok / 中转站"
            @update:value="(v) => patch('name', v)"
          />
        </div>
        <div class="field">
          <div class="field-label">接口类型</div>
          <n-select
            :options="providerTypeOptions"
            :render-label="renderSelectLabel"
            :value="current.provider"
            @update:value="(v) => patch('provider', v)"
          />
          <div class="hint">部分中转会按 URL / 模型名自动识别，不必强选专用类型</div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">连接</div>
        <div class="field">
          <div class="field-label">Base URL</div>
          <n-input
            :value="current.baseUrl"
            placeholder="https://api.openai.com/v1"
            @update:value="(v) => patch('baseUrl', v)"
          />
          <div v-if="baseUrlRiskHint" class="hint hint-warn">{{ baseUrlRiskHint }}</div>
        </div>
        <div class="field">
          <div class="field-label">API Key</div>
          <n-input
            :value="current.apiKey"
            placeholder="sk-..."
            show-password-on="click"
            type="password"
            @update:value="(v) => patch('apiKey', v)"
          />
        </div>
        <div v-if="showViteCorsProxy" class="field">
          <div class="field-label">开发代理（绕过 CORS）</div>
          <div class="inline-row">
            <n-switch
              :value="Boolean(current.useCorsProxy)"
              @update:value="(v) => patch('useCorsProxy', v)"
            />
            <span class="hint">浏览器开发时访问中转站请开启</span>
          </div>
        </div>
        <n-button :loading="testing" block class="action-btn" @click="testConnection">
          <template #icon>
            <n-icon :component="FlashOutline" />
          </template>
          测试连接
        </n-button>
      </div>

      <div class="group">
        <div class="group-title">
          <span>模型</span>
          <n-button :loading="modelsLoading" quaternary size="small" @click="refreshModelLists">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新
          </n-button>
        </div>
        <div class="field">
          <div class="field-label">对话模型</div>
          <n-select
            :loading="modelsLoading"
            :options="chatModelOptions"
            :render-label="renderSelectLabel"
            :value="current.chatModel || null"
            filterable
            placeholder="gpt-4o / grok-4.5"
            tag
            @update:value="(v) => patch('chatModel', v || '')"
          />
        </div>
        <div class="field">
          <div class="field-label">生图模型</div>
          <n-select
            :loading="modelsLoading"
            :options="imageModelOptions"
            :render-label="renderSelectLabel"
            :value="current.imageModel || null"
            filterable
            placeholder="gpt-image-1 / grok-imagine-image"
            tag
            @update:value="(v) => patch('imageModel', v || '')"
          />
        </div>
        <div class="field">
          <div class="field-label">视频模型</div>
          <n-select
            :loading="modelsLoading"
            :options="videoModelOptions"
            :render-label="renderSelectLabel"
            :value="current.videoModel || null"
            filterable
            placeholder="sora-2 / grok-imagine-video"
            tag
            @update:value="(v) => patch('videoModel', v || '')"
          />
        </div>
      </div>

      <div v-if="showViteCorsProxy" class="tip-bar tip-warn">
        出现 net::ERR_FAILED 多为浏览器 CORS，请开启上方「开发代理」。
      </div>

      <button class="tips-toggle" type="button" @click="tipsOpen = !tipsOpen">
        {{ tipsOpen ? '收起使用说明' : '查看使用说明' }}
      </button>
      <div v-if="tipsOpen" class="tip-bar tip-muted">
        <ul class="tips">
          <li>对话：POST {BaseURL}/chat/completions</li>
          <li>文生图：POST {BaseURL}/images/generations</li>
          <li>图生图：OpenAI multipart / xAI JSON /images/edits</li>
          <li>视频：OpenAI 兼容 /videos；xAI /videos/generations</li>
          <li>兼容中转站：填 Base URL + Key 即可</li>
        </ul>
      </div>

      <div v-if="canRemoveCurrent" class="danger">
        <n-button block quaternary type="error" @click="removeCurrent">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          删除自定义提供商
        </n-button>
      </div>
      <div v-else class="builtin-hint">内置提供商不可删除，可用右上角恢复预设。</div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ProvidersSettings.scss"></style>
