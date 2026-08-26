/** 本地 HTTP 服务相关工具（Tauri 桌面端 / 浏览器经本地端口访问） */

import { isTauri, isLocalServerPage, setCachedProxyEnabled } from '@/utils/request'

/**
 * 从当前 URL 的 query 或 document.cookie 读取访问 token
 * @returns {string}
 */
export function readAccessTokenFromPage() {
  if (typeof window === 'undefined') return ''
  try {
    const q = new URLSearchParams(window.location.search)
    const fromQuery = q.get('t') || q.get('token')
    if (fromQuery) return fromQuery
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)ai_studio_token=([^;]*)/)
    if (match?.[1]) return decodeURIComponent(match[1])
  } catch {
    /* ignore */
  }
  return ''
}

function applyInfoCache(info) {
  if (info && typeof info.proxyEnabled === 'boolean') {
    setCachedProxyEnabled(info.proxyEnabled)
  }
  return info
}

/**
 * 获取本地服务信息。
 * - Tauri：invoke get_local_server_info
 * - 浏览器同源（经本地服务打开）：请求 /api/local/info
 * @returns {Promise<object>}
 */
export async function fetchLocalServerInfo() {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke('get_local_server_info')
    return applyInfoCache(info)
  }

  const token = readAccessTokenFromPage()
  const headers = {}
  if (token) {
    headers['X-Access-Token'] = token
  }
  const res = await fetch('/api/local/info', { headers })
  if (!res.ok) {
    throw new Error(`获取本地服务信息失败: HTTP ${res.status}`)
  }
  const info = await res.json()
  return applyInfoCache(info)
}

/** 重新生成 token（仅 Tauri） */
export async function regenerateLocalToken() {
  if (!isTauri()) {
    throw new Error('仅桌面端可重新生成 token')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const info = await invoke('regenerate_local_token')
  return applyInfoCache(info)
}

/**
 * 更新本地服务配置（仅 Tauri）
 * @param {{ port?: number, lanEnabled?: boolean, proxyEnabled?: boolean }} patch
 * @returns {Promise<object & { needRestart?: boolean }>}
 */
export async function setLocalServerConfig(patch = {}) {
  if (!isTauri()) {
    throw new Error('仅桌面端可修改本地服务配置')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke('set_local_server_config', {
    port: patch.port,
    lanEnabled: patch.lanEnabled,
    proxyEnabled: patch.proxyEnabled,
  })
  return applyInfoCache(result)
}

/** 是否经本地服务打开的浏览器页（再导出，便于设置页使用） */
export { isLocalServerPage }
