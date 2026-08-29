import {getCurrentWindow} from '@tauri-apps/api/window'
import {getCurrentWebview} from '@tauri-apps/api/webview'

/**
 * Naive UI 主题实色（不能使用 CSS var）。
 * 须与 src/core/styles/tokens.scss 中对应变量保持一致；改色请两边同步。
 */
const PALETTE = {
  dark: {
    bg: '#0f1115', // --color-bg
    primary: '#7c9cff', // --color-primary
    primaryHover: '#9bb2ff', // --color-primary-hover
    primaryPressed: '#5f7fe6', // --color-primary-pressed
    card: 'rgba(16, 18, 24, 0.72)', // --color-bg-elevated
    border: 'rgba(255, 255, 255, 0.08)', // --border-muted
    text1: 'rgba(255, 255, 255, 0.92)', // --text-1
    text2: 'rgba(255, 255, 255, 0.72)', // --text-2
    text3: 'rgba(255, 255, 255, 0.55)', // --text-3
    radius: '10px', // --radius-md
  },
  light: {
    bg: '#f4f6fb', // --color-bg
    primary: '#5b7cfa', // --color-primary
    primaryHover: '#7c9cff', // --color-primary-hover
    primaryPressed: '#4a68e0', // --color-primary-pressed
    card: 'rgba(255, 255, 255, 0.86)', // --color-bg-elevated
    border: 'rgba(15, 23, 42, 0.1)', // --border-muted
    text1: 'rgba(15, 23, 42, 0.92)', // --text-1
    text2: 'rgba(15, 23, 42, 0.72)', // --text-2
    text3: 'rgba(15, 23, 42, 0.58)', // --text-3
    radius: '10px', // --radius-md
  },
}

export const THEME_BG = {
  dark: PALETTE.dark.bg,
  light: PALETTE.light.bg,
}

function buildOverrides(mode) {
  const t = PALETTE[mode]
  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryPressed,
      primaryColorSuppl: t.primary,
      borderRadius: t.radius,
      bodyColor: t.bg,
      cardColor: t.card,
      borderColor: t.border,
      textColorBase: t.text1,
      textColor1: t.text1,
      textColor2: t.text2,
      textColor3: t.text3,
    },
  }
}

export const THEME_OVERRIDES = {
  dark: buildOverrides('dark'),
  light: buildOverrides('light'),
}

/** 同步 Android 系统栏图标明暗，与 App theme 绑定 */
function syncAndroidSystemBars(theme) {
  try {
    const bridge = typeof window !== 'undefined' ? window.TauriSystemBars : null
    if (bridge && typeof bridge.setTheme === 'function') {
      bridge.setTheme(theme === 'light' ? 'light' : 'dark')
    }
  } catch {
    // 非 Android 或 Bridge 未就绪时忽略
  }
}

export async function syncNativeBackground(theme) {
  const color = theme === 'light' ? THEME_BG.light : THEME_BG.dark
  document.documentElement.style.backgroundColor = color
  if (document.body) document.body.style.backgroundColor = color
  try {
    await getCurrentWindow().setBackgroundColor(color)
  } catch {
    // 非桌面或权限未就绪时忽略
  }
  try {
    await getCurrentWebview().setBackgroundColor(color)
  } catch {
    // 部分平台不支持 webview 背景色
  }
  syncAndroidSystemBars(theme)
}

export function applyDocumentTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  void syncNativeBackground(next)
}
