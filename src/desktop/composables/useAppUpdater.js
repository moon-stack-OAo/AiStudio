import {ref} from 'vue'
import {useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {isDesktopTauri} from '@core/utils/request'
import {
  checkForUpdate,
  friendlyUpdateInstallError,
  installUpdateAndRelaunch,
} from '@core/utils/updater'

/** 模块级共享，避免 UpdateChecker 与关于页各持一份状态 */
const checking = ref(false)
const installing = ref(false)
const updateProgress = ref('')
const updateResult = ref(null)
const pendingUpdate = ref(null)

function formatProgressEvent(event) {
  if (!event?.event) return ''
  if (event.event === 'Started') {
    const total = event.data?.contentLength
    return total ? `开始下载（${Math.round(total / 1024 / 1024)} MB）…` : '开始下载…'
  }
  if (event.event === 'Progress') return '正在下载更新…'
  if (event.event === 'Finished') return '下载完成，准备重启…'
  if (event.event === 'Retry') {
    const attempt = event.data?.attempt
    const max = event.data?.maxAttempts
    return attempt && max ? `下载失败，正在重试（${attempt}/${max}）…` : '下载失败，正在重试…'
  }
  return ''
}

/**
 * 桌面端应用更新：检查 / 下载安装 / 进度 / 静默与 settings 同步。
 * 非 Tauri 环境安全 no-op（可提示）。
 */
export function useAppUpdater() {
  const settings = useSettingsStore()
  const message = useMessage()
  const supported = isDesktopTauri()

  /**
   * @param {{ silent?: boolean }} [opts]
   * @returns {Promise<null | {
   *   currentVersion: string,
   *   hasUpdate: boolean,
   *   latest: null | { version: string, date?: string, body?: string },
   *   update: import('@tauri-apps/plugin-updater').Update | null
   * }>}
   */
  async function checkUpdate({silent = false} = {}) {
    if (!supported) {
      if (!silent) message.info('应用内更新仅支持桌面客户端')
      return null
    }
    if (checking.value || installing.value) return null

    checking.value = true
    // 仅手动检查时刷新关于页展示状态，避免启动静默检查改写 UI
    if (!silent) {
      updateResult.value = null
      pendingUpdate.value = null
      updateProgress.value = ''
    }

    try {
      const result = await checkForUpdate()
      if (!silent) {
        updateResult.value = result
        pendingUpdate.value = result.update || null
      }

      if (!result.hasUpdate || !result.update) {
        settings.clearAvailableUpdate()
        if (!silent) message.info('当前已是最新版本')
        return result
      }

      // 静默检查：已跳过该版本则不提示、不写入角标状态
      if (
        silent &&
        settings.skippedUpdateVersion &&
        settings.skippedUpdateVersion === result.latest.version
      ) {
        return result
      }

      if (!silent) settings.clearSkippedUpdateVersion()
      settings.setAvailableUpdate(result.latest.version)
      return result
    } catch (e) {
      if (!silent) message.error(e?.message || '检查更新失败')
      return null
    } finally {
      checking.value = false
    }
  }

  /**
   * @param {import('@tauri-apps/plugin-updater').Update} [update]
   * @param {(event: any) => void} [onEvent]
   */
  async function installUpdate(update, onEvent) {
    if (installing.value) return
    if (!supported) {
      message.info('应用内更新仅支持桌面客户端')
      return
    }

    installing.value = true
    updateProgress.value = '准备下载…'
    try {
      // 静默弹窗可能长时间持有旧 Update；安装前重新 check，避免首次失败后对象失效
      const fresh = await checkForUpdate()
      const target = fresh.update || update || pendingUpdate.value
      if (!target) {
        throw new Error(fresh.hasUpdate ? '获取更新信息失败，请重试' : '没有可安装的更新')
      }
      pendingUpdate.value = target
      if (updateResult.value) updateResult.value = fresh

      await installUpdateAndRelaunch(target, (event) => {
        const text = formatProgressEvent(event)
        if (text) updateProgress.value = text
        onEvent?.(event)
      })
    } catch (e) {
      installing.value = false
      updateProgress.value = ''
      pendingUpdate.value = null
      if (updateResult.value?.hasUpdate) {
        updateResult.value = {
          ...updateResult.value,
          update: null,
        }
      }
      message.error(friendlyUpdateInstallError(e))
    }
  }

  /** 跳过指定版本（hasAvailableUpdate 因与 skipped 匹配变为 false） */
  function skipVersion(version) {
    const v = String(version || '')
    if (!v) return
    settings.skipUpdateVersion(v)
    message.info(`已跳过 v${v}`)
  }

  return {
    supported,
    checking,
    installing,
    updateProgress,
    updateResult,
    pendingUpdate,
    checkUpdate,
    installUpdate,
    skipVersion,
  }
}
