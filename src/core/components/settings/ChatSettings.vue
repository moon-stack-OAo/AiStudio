<script setup>
import {renderSelectLabel} from '@core/utils/selectRender'
import {useChatSettings} from '@core/composables/useChatSettings'

defineProps({
  /** desktop | android：影响控件 size 与备份按钮布局 */
  variant: {
    type: String,
    default: 'desktop',
  },
})

const {
  settings,
  includeSecretsOnExport,
  fileInputRef,
  importing,
  maxTurnsOptions,
  maxTokensOptions,
  apiTimeoutSec,
  onTrimEnabledChange,
  onMaxTurnsUpdate,
  onMaxCharsUpdate,
  onMaxTokensUpdate,
  onTimeoutSecUpdate,
  setIncludeSecretsOnExport,
  onExport,
  onImportClick,
  onImportFile,
} = useChatSettings()
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
              :size="variant === 'desktop' ? 'small' : undefined"
              :value="settings.chatContextTrimEnabled"
              @update:value="onTrimEnabledChange"
            />
            <span class="field-label tight">自动裁剪</span>
          </div>
          <n-select
            :disabled="!settings.chatContextTrimEnabled"
            :filterable="true"
            :options="maxTurnsOptions"
            :render-label="renderSelectLabel"
            :size="variant === 'desktop' ? 'small' : undefined"
            :tag="true"
            :value="settings.chatContextMaxTurns"
            class="select-turns"
            placeholder="保留轮数"
            @update:value="onMaxTurnsUpdate"
          />
        </div>
        <div class="hint context-extra-hint">
          1 轮 = 一次用户提问及其后回复。可输入自定义整数（≥1）。接近上限时对话页会提示。
        </div>

        <div class="data-row chars-row">
          <div class="inline-row">
            <n-switch
              :size="variant === 'desktop' ? 'small' : undefined"
              :value="settings.chatContextMaxCharsEnabled"
              @update:value="(v) => settings.setChatContextMaxCharsEnabled(v)"
            />
            <span class="field-label tight">字符预算</span>
          </div>
          <n-input-number
            :disabled="!settings.chatContextMaxCharsEnabled"
            :min="1"
            :show-button="false"
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="settings.chatContextMaxChars"
            class="input-chars"
            placeholder="字符上限"
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
            :size="variant === 'desktop' ? 'small' : undefined"
            :step="0.1"
            :value="settings.chatTemperature"
            @update:value="(v) => settings.setChatTemperature(v)"
          />
          <div class="hint">默认 0.7；越高越随机，越低越稳定</div>
        </div>
        <div class="param-block">
          <div class="field-label">System Prompt</div>
          <n-input
            :autosize="{minRows: 3, maxRows: 8}"
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="settings.chatSystemPrompt"
            placeholder="可选。非空时作为 system 消息插入请求最前"
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
            :size="variant === 'desktop' ? 'small' : undefined"
            :tag="true"
            :value="settings.chatMaxTokens"
            class="select-turns"
            placeholder="0 = 不限制"
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
            :size="variant === 'desktop' ? 'small' : undefined"
            :step="10"
            :value="apiTimeoutSec"
            class="input-chars"
            @update:value="onTimeoutSecUpdate"
          />
          <div class="hint">
            {{
              variant === 'desktop'
                ? '默认 180 秒；范围 5–600 秒。连接与非流式请求均使用此超时'
                : '默认 180 秒；范围 5–600 秒'
            }}
          </div>
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
              :size="variant === 'desktop' ? 'small' : undefined"
              :value="includeSecretsOnExport"
              @update:value="setIncludeSecretsOnExport"
            />
            <span class="field-label tight">导出包含 API Key</span>
          </div>
          <template v-if="variant === 'desktop'">
            <div class="inline-actions">
              <n-button secondary size="small" @click="onExport">导出</n-button>
              <n-button :loading="importing" size="small" type="primary" @click="onImportClick">
                导入
              </n-button>
            </div>
          </template>
          <template v-else>
            <n-button block secondary @click="onExport">导出</n-button>
            <n-button :loading="importing" block type="primary" @click="onImportClick">
              导入
            </n-button>
          </template>
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
