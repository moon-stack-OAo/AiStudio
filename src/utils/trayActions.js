/** 托盘动作桥：统一由 TrayActionListener 接收，再转发到业务组件 */

const CHECK_UPDATE = 'ai-studio:check-update'

export function requestCheckUpdate() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHECK_UPDATE))
}

export function onCheckUpdateRequest(handler) {
  if (typeof window === 'undefined') return () => {}
  const listener = () => handler?.()
  window.addEventListener(CHECK_UPDATE, listener)
  return () => window.removeEventListener(CHECK_UPDATE, listener)
}
