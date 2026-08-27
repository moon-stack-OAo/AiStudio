import {onBeforeUnmount, onMounted} from 'vue'

/**
 * 将 visualViewport 可视高度写入 --app-height，缓解 Android 软键盘顶起布局问题。
 * 不再写入未消费的 --vv-offset-top，避免误导。
 */
export function useVisualViewport() {
  function apply() {
    const vv = window.visualViewport
    const height = vv?.height ?? window.innerHeight
    const root = document.documentElement
    root.style.setProperty('--app-height', `${Math.round(height)}px`)
  }

  onMounted(() => {
    apply()
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', apply)
      vv.addEventListener('scroll', apply)
    }
    window.addEventListener('resize', apply)
  })

  onBeforeUnmount(() => {
    const vv = window.visualViewport
    if (vv) {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
    window.removeEventListener('resize', apply)
  })
}
