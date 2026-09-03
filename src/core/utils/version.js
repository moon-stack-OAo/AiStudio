import {isTauri} from '@core/utils/request'

/** 与 src-tauri/tauri.conf.json 的 version 保持一致（Web / 回退） */
export const APP_VERSION = '1.0.6'

export async function getAppVersion() {
  if (isTauri()) {
    try {
      const {getVersion} = await import('@tauri-apps/api/app')
      return await getVersion()
    } catch {
      // fall through
    }
  }
  return APP_VERSION
}
