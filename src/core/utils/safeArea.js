/**
 * Android WebView 在 edge-to-edge 下 env(safe-area-inset-*) 常为 0。
 * MainActivity 通过 WindowInsets + JS Bridge 提供真实 insets，这里写入 CSS 变量。
 */
export function applyAndroidSafeAreaInsets() {
  const bridge = typeof window !== 'undefined' ? window.TauriSafeAreaInsets : null
  if (!bridge || typeof bridge.top !== 'function') return

  const root = document.documentElement

  const apply = () => {
    try {
      const top = Number(bridge.top()) || 0
      const right = Number(bridge.right()) || 0
      const bottom = Number(bridge.bottom()) || 0
      const left = Number(bridge.left()) || 0
      root.style.setProperty('--safe-area-inset-top', `${top}px`)
      root.style.setProperty('--safe-area-inset-right', `${right}px`)
      root.style.setProperty('--safe-area-inset-bottom', `${bottom}px`)
      root.style.setProperty('--safe-area-inset-left', `${left}px`)
    } catch {
      // Bridge 不可用时忽略（桌面 / 浏览器）
    }
  }

  apply()
  // insets 可能在首帧之后才到达
  requestAnimationFrame(apply)
  setTimeout(apply, 50)
  setTimeout(apply, 300)
  setTimeout(apply, 1000)
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
}
