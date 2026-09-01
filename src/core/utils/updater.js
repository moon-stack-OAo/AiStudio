import {isDesktopTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'

/** 下载安装瞬时失败时的最大尝试次数（含首次） */
const INSTALL_MAX_ATTEMPTS = 3

export function normalizeVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+\-]/)[0]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorText(err) {
  return String(err?.message || err || '')
}

/** 将 updater / 网络原始错误转成可读中文 */
export function friendlyUpdateInstallError(err) {
  const msg = errorText(err)
  const lower = msg.toLowerCase()

  if (
    /api\.github\.com\/.*\/releases\/assets\//i.test(msg) ||
    /\b403\b/.test(msg) ||
    /forbidden/i.test(lower)
  ) {
    return '下载更新失败：安装包地址可能需要鉴权。请稍后重试，或到 GitHub Releases 手动下载安装。'
  }
  if (
    /err_connection_closed|connection reset|connection closed|connection refused|timed?\s*out|timeout|network|dns|failed to fetch|error sending request/i.test(
      lower,
    )
  ) {
    return '下载更新失败：网络不稳定或无法访问 GitHub。请检查网络后重试。'
  }
  if (/signature|minisign|verify/i.test(lower)) {
    return '更新包签名校验失败，请稍后重试或手动下载安装。'
  }
  if (/invalid updater|binary not found|extract/i.test(lower)) {
    return '更新包格式无效，请稍后重试或手动下载安装。'
  }
  return msg || '安装更新失败'
}

function isRetryableInstallError(err) {
  const msg = errorText(err).toLowerCase()
  if (!msg) return true
  if (/signature|minisign|verify|invalid updater|binary not found|unsupported/i.test(msg)) {
    return false
  }
  return (
    /err_connection_closed|connection reset|connection closed|connection refused|timed?\s*out|timeout|network|dns|failed to fetch|error sending request|download request failed|status:\s*5\d\d|\b502\b|\b503\b|\b504\b|\b429\b/i.test(
      msg,
    ) || /下载|网络|连接/.test(errorText(err))
  )
}

export async function closeUpdate(update) {
  if (!update || typeof update.close !== 'function') return
  try {
    await update.close()
  } catch {
    // ignore
  }
}

/**
 * 使用 Tauri Updater 检查更新（仅桌面端；Android 请用 androidUpdater.js）
 * @returns {Promise<{
 *   currentVersion: string,
 *   hasUpdate: boolean,
 *   latest: null | { version: string, date?: string, body?: string },
 *   update: import('@tauri-apps/plugin-updater').Update | null
 * }>}
 */
export async function checkForUpdate() {
  if (!isDesktopTauri()) {
    throw new Error('桌面应用内更新仅支持桌面客户端')
  }

  const currentVersion = await getAppVersion()
  const {check} = await import('@tauri-apps/plugin-updater')
  const update = await check()

  if (!update) {
    return {
      currentVersion,
      hasUpdate: false,
      latest: null,
      update: null,
    }
  }

  return {
    currentVersion,
    hasUpdate: true,
    latest: {
      version: normalizeVersion(update.version) || update.version,
      date: update.date || '',
      body: update.body || '',
    },
    update,
  }
}

/**
 * 下载并安装更新，然后重启。
 * 对瞬时网络失败自动重试，并在重试前重新 check 以拿到新的 Update 资源。
 * @param {import('@tauri-apps/plugin-updater').Update} update
 * @param {(event: any) => void} [onEvent]
 */
export async function installUpdateAndRelaunch(update, onEvent) {
  if (!update) throw new Error('没有可安装的更新')

  let current = update
  let lastError = null

  for (let attempt = 1; attempt <= INSTALL_MAX_ATTEMPTS; attempt++) {
    try {
      await current.downloadAndInstall(onEvent)
      // Windows 上安装器拉起后进程会 exit；其它平台需 relaunch
      const {relaunch} = await import('@tauri-apps/plugin-process')
      await relaunch()
      return
    } catch (e) {
      lastError = e
      await closeUpdate(current)
      current = null

      const canRetry = attempt < INSTALL_MAX_ATTEMPTS && isRetryableInstallError(e)
      if (!canRetry) break

      onEvent?.({event: 'Retry', data: {attempt, maxAttempts: INSTALL_MAX_ATTEMPTS}})
      await sleep(600 * attempt)

      try {
        const {check} = await import('@tauri-apps/plugin-updater')
        current = await check()
        if (!current) break
      } catch (checkErr) {
        lastError = checkErr
        break
      }
    }
  }

  throw new Error(friendlyUpdateInstallError(lastError))
}
