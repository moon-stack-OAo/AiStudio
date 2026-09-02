<script setup>
import {computed} from 'vue'
import {useSettingsStore} from '@core/stores/settings'
import {UI_FONT_SCALE_OPTIONS} from '@core/utils/constants'
import {renderSelectLabel} from '@core/utils/selectRender'

defineProps({
  /** desktop | android */
  variant: {
    type: String,
    default: 'desktop',
  },
})

const settings = useSettingsStore()

const themeOptions = [
  {label: '浅色', value: 'light'},
  {label: '深色', value: 'dark'},
  {label: '跟随系统', value: 'system'},
]

const fontScaleOptions = computed(() =>
  UI_FONT_SCALE_OPTIONS.map((n) => ({
    label: `${Math.round(n * 100)}%`,
    value: n,
  })),
)

const densityOptions = [
  {label: '舒适', value: 'comfortable'},
  {label: '紧凑', value: 'compact'},
]

const accentMeta = computed(() =>
  settings.resolvedTheme === 'light'
    ? {hex: '#c45c26', label: '暖橙 #c45c26（浅色 Style B）'}
    : {hex: '#60a5fa', label: '冷蓝 #60a5fa（深色 Style A）'},
)
</script>

<template>
  <div class="tab-pane appearance-pane">
    <div class="appearance-wrap">
      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">主题</div>
            <div class="section-desc">跟随系统时，会随操作系统浅色/深色自动切换</div>
          </div>
        </div>
        <n-radio-group
          :size="variant === 'desktop' ? 'small' : undefined"
          :value="settings.theme"
          name="theme"
          @update:value="(v) => settings.setTheme(v)"
        >
          <n-space :vertical="variant === 'android'">
            <n-radio v-for="opt in themeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </n-radio>
          </n-space>
        </n-radio-group>
        <div v-if="settings.theme === 'system'" class="hint context-extra-hint">
          当前解析为：{{ settings.resolvedTheme === 'light' ? '浅色' : '深色' }}
        </div>
        <div class="settings-row accent-row">
          <span class="accent-swatch" :title="accentMeta.hex" aria-hidden="true" />
          <div class="grow">
            <strong>强调色</strong>
            <span class="row-meta">{{ accentMeta.label }}</span>
          </div>
          <span class="settings-status-pill">当前</span>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">字号与密度</div>
            <div class="section-desc">调整界面文字比例与间距疏密</div>
          </div>
        </div>
        <div class="data-row">
          <span class="field-label tight">界面字号</span>
          <n-select
            :options="fontScaleOptions"
            :render-label="renderSelectLabel"
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="settings.uiFontScale"
            class="select-pref"
            @update:value="(v) => settings.setUiFontScale(v)"
          />
        </div>
        <div class="data-row density-row">
          <span class="field-label tight">界面密度</span>
          <n-radio-group
            :size="variant === 'desktop' ? 'small' : undefined"
            :value="settings.uiDensity"
            name="density"
            @update:value="(v) => settings.setUiDensity(v)"
          >
            <n-space>
              <n-radio v-for="opt in densityOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </n-radio>
            </n-space>
          </n-radio-group>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">快捷键</div>
            <div class="section-desc">当前为固定行为，暂不支持自定义绑定</div>
          </div>
        </div>
        <ul class="shortcut-list">
          <template v-if="variant === 'desktop'">
            <li><span class="kbd">Enter</span> 发送消息</li>
            <li><span class="kbd">Shift</span> + <span class="kbd">Enter</span> 换行</li>
          </template>
          <template v-else>
            <li>点击发送按钮发送消息</li>
            <li>输入框内换行由系统键盘处理</li>
          </template>
        </ul>
      </div>
    </div>
  </div>
</template>
