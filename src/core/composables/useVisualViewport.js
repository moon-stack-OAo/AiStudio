import {onBeforeUnmount, onMounted} from 'vue'

/** 可视高度相对基线缩小超过该值（px）视为软键盘弹起；与安卓 App.vue keyboardOpen 共用 */
export const KEYBOARD_OPEN_DELTA_PX = 120

/**
 * 将 visualViewport 可视高度写入 --app-height，缓解 Android 软键盘顶起布局问题。
 * 不再写入未消费的 --vv-offset-top，避免误导。
 * keyboardOpen 仍由安卓 App 单独维护（需驱动底栏显隐），仅共享阈值常量。
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
