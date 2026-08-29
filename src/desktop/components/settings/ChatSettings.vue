<script setup>
import {computed, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {API_TIMEOUT_MS, CHAT_CONTEXT_MAX_TURNS_OPTIONS} from '@core/utils/constants'
import {renderSelectLabel} from '@core/utils/selectRender'
import {
  applySettingsImport,
  buildSettingsExport,
  importContainsSecrets,
  parseSettingsImport,
} from '@core/utils/settingsBackup'

const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

const includeSecretsOnExport = ref(false)
const fileInputRef = ref(null)
const importing = ref(false)

const maxTurnsOptions = computed(() => {
  const opts = CHAT_CONTEXT_MAX_TURNS_OPTIONS.map((n) => ({
    label: `${n} 轮`,
    value: n,
  }))
  const cur = settings.chatContextMaxTurns
  if (!CHAT_CONTEXT_MAX_TURNS_OPTIONS.includes(cur)) {
    opts.push({label: `${cur} 轮`, value: cur})
  }
  return opts
})

function onTrimEnabledChange(v) {
  if (v) {
    settings.setChatContextTrimEnabled(true)
    return
  }
  dialog.warning({
    title: '关闭自动裁剪？',
    content:
      '关闭后将发送全部对话历史。长会话可能超出模型上下文上限，导致请求失败，并可能显著增加费用。确定关闭？',
    positiveText: '仍要关闭',
    negativeText: '取消',
    onPositiveClick: () => {
      settings.setChatContextTrimEnabled(false)
    },
  })
}

function onMaxTurnsUpdate(v) {
  const n = Math.max(1, Math.floor(Number(v) || 1))
  settings.setChatContextMaxTurns(n)
}

function onMaxCharsUpdate(v) {
  const n = Math.max(1, Math.floor(Number(v) || 1))
  settings.setChatContextMaxChars(n)
}

function onMaxTokensUpdate(v) {
  const n = Math.max(0, Math.floor(Number(v) || 0))
  settings.setChatMaxTokens(n)
}

const apiTimeoutSec = computed(() => Math.round((settings.apiTimeoutMs || API_TIMEOUT_MS) / 1000))

function onTimeoutSecUpdate(v) {
  const sec = Math.max(5, Math.floor(Number(v) || 180))
  settings.setApiTimeoutMs(sec * 1000)
}

const maxTokensOptions = [
  {label: '不限制', value: 0},
  {label: '1024', value: 1024},
  {label: '2048', value: 2048},
  {label: '4096', value: 4096},
  {label: '8192', value: 8192},
]

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function setIncludeSecretsOnExport(v) {
  includeSecretsOnExport.value = Boolean(v)
}

function onExport() {
  const data = buildSettingsExport(settings, {includeSecrets: includeSecretsOnExport.value})
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  downloadJson(`ai-studio-settings-${stamp}.json`, data)
  message.success(
    includeSecretsOnExport.value ? '已导出（含 API Key）' : '已导出（API Key 已脱敏）',
  )
}

function onImportClick() {
  fileInputRef.value?.click()
}

async function onImportFile(e) {
  const file = e.target?.files?.[0]
  e.target.value = ''
  if (!file || importing.value) return
  importing.value = true
  try {
    const text = await file.text()
    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      message.error('JSON 解析失败')
      return
    }
    const parsed = parseSettingsImport(raw)
    if (!parsed.ok) {
      message.error(parsed.error)
      return
    }
    const hasSecrets = importContainsSecrets(parsed.value)
    const run = () => {
      try {
        applySettingsImport(settings, parsed.value, {mergeProviders: true})
        message.success(
          hasSecrets ? '已导入设置（含 API Key）' : '已导入设置（提供商与对话偏好已合并）',
        )
      } catch (err) {
        message.error(err?.message || '导入失败')
      }
    }
    if (hasSecrets) {
      dialog.warning({
        title: '导入含 API Key',
        content: '文件中包含 API Key，导入后将写入本机设置。确定继续？',
        positiveText: '导入',
        negativeText: '取消',
        onPositiveClick: run,
      })
    } else {
      run()
    }
  } catch (err) {
    message.error(err?.message || '导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="tab-pane chat-pane">
    <div class="chat-wrap">
      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">对话上下文</div>
            <div class="section-desc">
              双上限取更严：先按轮再按字符（实际发送轮数可能少于轮数上限）。本地记录仍完整保留；轮数不能保证不超模型上下文，长文请开启字符预算。
            </div>
          </div>
        </div>
        <div class="data-row">
          <div class="inline-row">
            <n-switch
              :value="settings.chatContextTrimEnabled"
              size="small"
              @update:value="onTrimEnabledChange"
            />
            <span class="field-label tight">自动裁剪</span>
          </div>
          <n-select
            :disabled="!settings.chatContextTrimEnabled"
            :filterable="true"
            :options="maxTurnsOptions"
            :render-label="renderSelectLabel"
            :tag="true"
            :value="settings.chatContextMaxTurns"
            class="select-turns"
            placeholder="保留轮数"
            size="small"
            @update:value="onMaxTurnsUpdate"
          />
        </div>
        <div class="hint context-extra-hint">
          1 轮 = 一次用户提问及其后回复。可输入自定义整数（≥1）。接近上限时对话页会提示。
        </div>

        <div class="data-row chars-row">
          <div class="inline-row">
            <n-switch
              :value="settings.chatContextMaxCharsEnabled"
              size="small"
              @update:value="(v) => settings.setChatContextMaxCharsEnabled(v)"
            />
            <span class="field-label tight">字符预算</span>
          </div>
          <n-input-number
            :disabled="!settings.chatContextMaxCharsEnabled"
            :min="1"
            :show-button="false"
            :value="settings.chatContextMaxChars"
            class="input-chars"
            placeholder="字符上限"
            size="small"
            @update:value="onMaxCharsUpdate"
          />
        </div>
        <div class="hint context-extra-hint">
          开启后，在按轮裁剪后再按粗估字符从最旧轮丢弃（非精确 Token）。建议档：16000 / 32000 /
          64000。
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">对话参数</div>
            <div class="section-desc">影响每次对话请求的采样与系统提示</div>
          </div>
        </div>
        <div class="param-block">
          <div class="param-label-row">
            <span class="field-label">Temperature</span>
            <span class="param-value">{{ settings.chatTemperature.toFixed(1) }}</span>
          </div>
          <n-slider
            :max="2"
            :min="0"
            :step="0.1"
            :value="settings.chatTemperature"
            size="small"
            @update:value="(v) => settings.setChatTemperature(v)"
          />
          <div class="hint">默认 0.7；越高越随机，越低越稳定</div>
        </div>
        <div class="param-block">
          <div class="field-label">System Prompt</div>
          <n-input
            :autosize="{minRows: 3, maxRows: 8}"
            :value="settings.chatSystemPrompt"
            placeholder="可选。非空时作为 system 消息插入请求最前"
            size="small"
            type="textarea"
            @update:value="(v) => settings.setChatSystemPrompt(v)"
          />
          <div class="hint">不会写入本地会话气泡，仅附加到 API 请求</div>
        </div>
        <div class="param-block">
          <div class="param-label-row">
            <span class="field-label">Max Tokens</span>
            <span class="param-value">{{
              settings.chatMaxTokens > 0 ? settings.chatMaxTokens : '不限制'
            }}</span>
          </div>
          <n-select
            :filterable="true"
            :options="maxTokensOptions"
            :render-label="renderSelectLabel"
            :tag="true"
            :value="settings.chatMaxTokens"
            class="select-turns"
            placeholder="0 = 不限制"
            size="small"
            @update:value="onMaxTokensUpdate"
          />
          <div class="hint">0 表示不传 max_tokens；可输入自定义正整数</div>
        </div>
        <div class="param-block">
          <div class="param-label-row">
            <span class="field-label">请求超时</span>
            <span class="param-value">{{ apiTimeoutSec }} 秒</span>
          </div>
          <n-input-number
            :max="600"
            :min="5"
            :show-button="true"
            :step="10"
            :value="apiTimeoutSec"
            class="input-chars"
            size="small"
            @update:value="onTimeoutSecUpdate"
          />
          <div class="hint">默认 180 秒；范围 5–600 秒。连接与非流式请求均使用此超时</div>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">设置备份</div>
            <div class="section-desc">导出 / 导入提供商与对话相关设置（JSON）</div>
          </div>
        </div>
        <div class="data-row">
          <div class="inline-row">
            <n-switch
              :value="includeSecretsOnExport"
              size="small"
              @update:value="setIncludeSecretsOnExport"
            />
            <span class="field-label tight">导出包含 API Key</span>
          </div>
          <div class="inline-actions">
            <n-button size="small" secondary @click="onExport">导出</n-button>
            <n-button :loading="importing" size="small" type="primary" @click="onImportClick">
              导入
            </n-button>
          </div>
        </div>
        <div class="hint context-extra-hint">
          默认脱敏为 ***。导入时合并提供商与对话偏好；含 Key 时会二次确认。
        </div>
        <input
          ref="fileInputRef"
          accept="application/json,.json"
          class="file-hidden"
          type="file"
          @change="onImportFile"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ChatSettings.scss"></style>
