export const THEME_OVERRIDES = {
  dark: {
    common: {
      primaryColor: '#7c9cff',
      primaryColorHover: '#9bb2ff',
      primaryColorPressed: '#5f7fe6',
      primaryColorSuppl: '#7c9cff',
      borderRadius: '10px',
      bodyColor: '#0f1115',
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
      bodyColor: '#f4f6fb',
      cardColor: 'rgba(255, 255, 255, 0.86)',
      borderColor: 'rgba(15, 23, 42, 0.1)',
      textColorBase: 'rgba(15, 23, 42, 0.92)',
      textColor1: 'rgba(15, 23, 42, 0.92)',
      textColor2: 'rgba(15, 23, 42, 0.72)',
      textColor3: 'rgba(15, 23, 42, 0.48)',
    },
  },
}

export function applyDocumentTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
}
