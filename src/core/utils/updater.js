import {isDesktopTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'

export function normalizeVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+\-]/)[0]
}

/**
 * 使用 Tauri Updater 检查更新（仅桌面端）
 * @returns {Promise<{
 *   currentVersion: string,
 *   hasUpdate: boolean,
 *   latest: null | { version: string, date?: string, body?: string },
 *   update: import('@tauri-apps/plugin-updater').Update | null
 * }>}
 */
export async function checkForUpdate() {
  if (!isDesktopTauri()) {
    throw new Error('应用内更新仅支持桌面客户端')
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
 * 下载并安装更新，然后重启
 * @param {import('@tauri-apps/plugin-updater').Update} update
 * @param {(event: any) => void} [onEvent]
 */
export async function installUpdateAndRelaunch(update, onEvent) {
  if (!update) throw new Error('没有可安装的更新')
  await update.downloadAndInstall(onEvent)
  const {relaunch} = await import('@tauri-apps/plugin-process')
  await relaunch()
}
