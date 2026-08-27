import {getCurrentWindow} from '@tauri-apps/api/window'
import {getCurrentWebview} from '@tauri-apps/api/webview'

/** 与 main.scss --color-bg 保持一致（Naive 需可解析的实色，不能用 var()） */
export const THEME_BG = {
  dark: '#0f1115',
  light: '#f4f6fb',
}

/** 与 main.scss 主色 / 文本 token 对齐的实色表 */
const THEME_TOKENS = {
  dark: {
    primary: '#7c9cff',
    primaryHover: '#9bb2ff',
    primaryPressed: '#5f7fe6',
    card: 'rgba(16, 18, 24, 0.72)',
    border: 'rgba(255, 255, 255, 0.08)',
    text1: 'rgba(255, 255, 255, 0.92)',
    text2: 'rgba(255, 255, 255, 0.72)',
    text3: 'rgba(255, 255, 255, 0.55)',
    radius: '10px', // --radius-md
  },
  light: {
    primary: '#5b7cfa',
    primaryHover: '#7c9cff',
    primaryPressed: '#4a68e0',
    card: 'rgba(255, 255, 255, 0.86)',
    border: 'rgba(15, 23, 42, 0.1)',
    text1: 'rgba(15, 23, 42, 0.92)',
    text2: 'rgba(15, 23, 42, 0.72)',
    text3: 'rgba(15, 23, 42, 0.58)',
    radius: '10px',
  },
}

function buildOverrides(mode) {
  const t = THEME_TOKENS[mode]
  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryPressed,
      primaryColorSuppl: t.primary,
      borderRadius: t.radius,
      bodyColor: THEME_BG[mode],
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
