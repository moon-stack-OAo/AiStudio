<script setup>
import {onMounted, onUnmounted, ref} from 'vue'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {CloseOutline, CopyOutline, RemoveOutline, SquareOutline} from '@vicons/ionicons5'
import ThemeToggleButton from '@/components/ThemeToggleButton.vue'
import {getAppVersion} from '@core/utils/version'

const appWindow = getCurrentWindow()
const maximized = ref(false)
const appVersion = ref('')
let unlistenResize = null

async function refreshMaximized() {
  try {
    maximized.value = await appWindow.isMaximized()
  } catch {
    maximized.value = false
  }
}

async function minimize() {
  await appWindow.minimize()
}

async function toggleMaximize() {
  await appWindow.toggleMaximize()
  await refreshMaximized()
}

async function close() {
  await appWindow.close()
}

onMounted(async () => {
  appVersion.value = await getAppVersion()
  await refreshMaximized()
  try {
    unlistenResize = await appWindow.onResized(() => {
      void refreshMaximized()
    })
  } catch {
    // ignore
  }
})

onUnmounted(() => {
  if (typeof unlistenResize === 'function') {
    unlistenResize()
  }
})
</script>

<template>
  <div class="titlebar">
    <div class="drag" data-tauri-drag-region @dblclick="toggleMaximize">
      <div class="brand" data-tauri-drag-region>
        <div class="logo" data-tauri-drag-region>AI</div>
        <span class="title" data-tauri-drag-region>
          AI Studio<span v-if="appVersion" class="version"> v{{ appVersion }}</span>
        </span>
      </div>
    </div>

    <div class="controls">
      <ThemeToggleButton variant="titlebar" />
      <button aria-label="最小化" class="ctrl" type="button" @click="minimize">
        <n-icon :component="RemoveOutline" :size="14" />
      </button>
      <button
        :aria-label="maximized ? '还原' : '最大化'"
        class="ctrl"
        type="button"
        @click="toggleMaximize"
      >
        <n-icon :component="maximized ? CopyOutline : SquareOutline" :size="13" />
      </button>
      <button aria-label="关闭" class="ctrl close" type="button" @click="close">
        <n-icon :component="CloseOutline" :size="14" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.titlebar {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  user-select: none;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-titlebar);
}

.drag {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding-left: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.logo {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
}

.title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.02em;
}

.version {
  font-weight: 500;
  color: var(--text-3);
}

.controls {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}

.ctrl {
  width: 46px;
  border: none;
  background: transparent;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: var(--border-muted);
    color: var(--text-1);
  }

  &:active {
    background: var(--surface-pressed);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  &.close:hover {
    background: var(--color-danger);
    color: var(--on-primary);
  }

  &.close:active {
    background: var(--titlebar-close-pressed);
    background: color-mix(in srgb, var(--color-danger) 85%, #000);
  }

  &.close:focus-visible {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-danger) 28%, transparent);
  }
}
</style>
