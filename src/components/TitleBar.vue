<script setup>
import {onMounted, onUnmounted, ref} from 'vue'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {CloseOutline, CopyOutline, RemoveOutline, SquareOutline,} from '@vicons/ionicons5'

const appWindow = getCurrentWindow()
const maximized = ref(false)
let unlistenResize = null
let overlayTimer = null

function flashResizeOverlay() {
  const root = document.documentElement
  root.classList.add('win-resizing')
  if (overlayTimer) clearTimeout(overlayTimer)
  overlayTimer = setTimeout(() => {
    root.classList.remove('win-resizing')
    overlayTimer = null
  }, 120)
}

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
  // 最大化瞬间 WebView 可能闪白：先压住绘制，再切尺寸
  flashResizeOverlay()
  await appWindow.toggleMaximize()
  await refreshMaximized()
}

async function close() {
  await appWindow.close()
}

onMounted(async () => {
  await refreshMaximized()
  try {
    unlistenResize = await appWindow.onResized(async () => {
      const prev = maximized.value
      await refreshMaximized()
      // 系统快捷键 / 拖到顶边最大化等路径也会闪白
      if (prev !== maximized.value) {
        flashResizeOverlay()
      }
    })
  } catch {
    // ignore
  }
})

onUnmounted(() => {
  if (typeof unlistenResize === 'function') {
    unlistenResize()
  }
  if (overlayTimer) clearTimeout(overlayTimer)
})
</script>

<template>
  <div class="titlebar">
    <div class="drag" data-tauri-drag-region @dblclick="toggleMaximize">
      <div class="brand" data-tauri-drag-region>
        <div class="logo" data-tauri-drag-region>AI</div>
        <span class="title" data-tauri-drag-region>AI Studio</span>
      </div>
    </div>

    <div class="controls">
      <button class="ctrl" title="最小化" type="button" @click="minimize">
        <n-icon :component="RemoveOutline" :size="14" />
      </button>
      <button class="ctrl" title="最大化" type="button" @click="toggleMaximize">
        <n-icon :component="maximized ? CopyOutline : SquareOutline" :size="13" />
      </button>
      <button class="ctrl close" title="关闭" type="button" @click="close">
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
  background: rgba(14, 16, 22, 0.92);
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
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
}

.title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.02em;
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
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: var(--border-muted);
    color: var(--text-1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.12);
  }

  &.close:hover {
    background: #e81123;
    color: #fff;
  }

  &.close:active {
    background: #c50f1f;
  }
}
</style>
