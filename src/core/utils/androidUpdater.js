import {Channel, invoke} from '@tauri-apps/api/core'
import {isAndroidTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'
import {normalizeVersion} from '@core/utils/updater'
import {appFetch} from '@core/utils/http'

/** 官方 Android 更新清单（固定 endpoint，不可由用户改写） */
export const ANDROID_LATEST_JSON_URL =
  'https://github.com/moon-stack-OAo/AI_Studio/releases/latest/download/android-latest.json'

function compareSemver(a, b) {
  const pa = String(a || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

function pickAndroidPlatform(manifest) {
  const platforms = manifest?.platforms || {}
  return (
    platforms['aarch64-linux-android'] ||
    platforms['arm64-v8a'] ||
    Object.values(platforms)[0] ||
    null
  )
}

function normalizeSha256(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isValidSha256(value) {
  const hex = normalizeSha256(value)
  return hex.length === 64 && /^[0-9a-f]+$/.test(hex)
}

function requireValidSha256(value) {
  const hex = normalizeSha256(value)
  if (!isValidSha256(hex)) {
    throw new Error('更新清单缺少完整性校验信息')
  }
  return hex
}

/**
 * 检查 Android 是否有新版本
 * @returns {Promise<{
 *   currentVersion: string,
 *   hasUpdate: boolean,
 *   latest: null | {
 *     version: string,
 *     date?: string,
 *     body?: string,
 *     url: string,
 *     sha256: string,
 *     size?: number
 *   }
 * }>}
 */
export async function checkAndroidUpdate() {
  if (!isAndroidTauri()) {
    throw new Error('应用内更新仅支持 Android 客户端')
  }

  const currentVersion = normalizeVersion(await getAppVersion())
  const res = await appFetch(ANDROID_LATEST_JSON_URL, {
    method: 'GET',
    headers: {Accept: 'application/json'},
  })
  if (!res.ok) {
    throw new Error(`获取更新信息失败（HTTP ${res.status}）`)
  }
  const manifest = await res.json()
  const latestVersion = normalizeVersion(manifest?.version)
  if (!latestVersion) {
    throw new Error('更新清单缺少 version')
  }

  const platform = pickAndroidPlatform(manifest)
  if (!platform?.url) {
    throw new Error('更新清单缺少 APK 下载地址')
  }

  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0
  if (!hasUpdate) {
    return {
      currentVersion,
      hasUpdate: false,
      latest: null,
    }
  }

  const sha256 = requireValidSha256(platform.sha256)

  return {
    currentVersion,
    hasUpdate: true,
    latest: {
      version: latestVersion,
      date: manifest?.pub_date || '',
      body: manifest?.notes || '',
      url: String(platform.url),
      sha256,
      size: typeof platform.size === 'number' ? platform.size : undefined,
    },
  }
}

/**
 * 下载 APK 并调起系统安装器
 * @param {{ version: string, url: string, sha256: string, size?: number }} latest
 * @param {(info: { downloaded: number, total?: number, phase: string }) => void} [onProgress]
 */
export async function downloadAndInstallAndroidUpdate(latest, onProgress) {
  if (!isAndroidTauri()) {
    throw new Error('应用内更新仅支持 Android 客户端')
  }
  if (!latest?.url) throw new Error('没有可安装的更新')
  const sha256 = requireValidSha256(latest.sha256)

  const report = (phase, downloaded = 0, total) => {
    if (typeof onProgress === 'function') {
      onProgress({downloaded, total, phase})
    }
  }

  report('permission')
  let canInstall = false
  try {
    canInstall = await invoke('android_can_install_packages')
  } catch {
    canInstall = false
  }
  if (!canInstall) {
    try {
      await invoke('android_request_install_permission')
      canInstall = await invoke('android_can_install_packages')
    } catch (e) {
      throw new Error(
        e?.message || '需要开启「允许安装未知应用」。请在系统设置中为本应用开启后重试。',
      )
    }
    if (!canInstall) {
      throw new Error('未开启「允许安装未知应用」。请在系统设置中为本应用开启后重试。')
    }
  }

  report('download', 0, latest.size)
  const channel = new Channel()
  channel.onmessage = (event) => {
    report('download', event?.downloaded || 0, event?.total ?? latest.size)
  }

  const path = await invoke('android_download_apk', {
    url: latest.url,
    sha256,
    onProgress: channel,
  })

  report('install', latest.size || 0, latest.size)
  await invoke('android_install_apk', {path})
}

/** 浏览器打开 APK 链接（兜底） */
export async function openAndroidApkInBrowser(url) {
  if (!url) throw new Error('缺少下载地址')
  window.open(url, '_blank', 'noopener,noreferrer')
}
