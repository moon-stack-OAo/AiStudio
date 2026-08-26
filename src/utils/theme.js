import {getCurrentWindow} from '@tauri-apps/api/window'
import {getCurrentWebview} from '@tauri-apps/api/webview'

export const THEME_BG = {
  dark: '#0f1115',
  light: '#f4f6fb',
}

export const THEME_OVERRIDES = {
  dark: {
    common: {
      primaryColor: '#7c9cff',
      primaryColorHover: '#9bb2ff',
      primaryColorPressed: '#5f7fe6',
      primaryColorSuppl: '#7c9cff',
      borderRadius: '10px',
      bodyColor: THEME_BG.dark,
      cardColor: 'rgba(16, 18, 24, 0.72)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textColorBase: 'rgba(255, 255, 255, 0.92)',
      textColor1: 'rgba(255, 255, 255, 0.92)',
      textColor2: 'rgba(255, 255, 255, 0.72)',
      textColor3: 'rgba(255, 255, 255, 0.45)',
    },
  },
  light: {
    common: {
      primaryColor: '#5b7cfa',
      primaryColorHover: '#7c9cff',
      primaryColorPressed: '#4a68e0',
      primaryColorSuppl: '#5b7cfa',
      borderRadius: '10px',
      bodyColor: THEME_BG.light,
      cardColor: 'rgba(255, 255, 255, 0.86)',
      borderColor: 'rgba(15, 23, 42, 0.1)',
      textColorBase: 'rgba(15, 23, 42, 0.92)',
      textColor1: 'rgba(15, 23, 42, 0.92)',
      textColor2: 'rgba(15, 23, 42, 0.72)',
      textColor3: 'rgba(15, 23, 42, 0.56)',
    },
  },
}

export async function syncNativeBackground(theme) {
  const color = theme === 'light' ? THEME_BG.light : THEME_BG.dark
  document.documentElement.style.backgroundColor = color
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
}

export function applyDocumentTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  void syncNativeBackground(next)
}
