import {createDiscreteApi} from 'naive-ui'

let messageApi = null
let lastStorageErrorAt = 0
let lastStorageWarnAt = 0

function getMessage() {
  if (!messageApi) {
    const api = createDiscreteApi(['message'])
    messageApi = api.message
  }
  return messageApi
}

/** 本地存储失败提示（节流，避免连续 persist 刷屏） */
export function notifyStorageError(detail) {
  const now = Date.now()
  if (now - lastStorageErrorAt < 4000) return
  lastStorageErrorAt = now
  const text = detail || '本地存储写入失败，当前修改可能无法持久保存'
  try {
    getMessage().error(text, {duration: 5000})
  } catch {
    console.error(text)
  }
}

/** 本地存储已自动精简等 warning（与 error 分节流） */
export function notifyStorageWarning(detail) {
  const now = Date.now()
  if (now - lastStorageWarnAt < 4000) return
  lastStorageWarnAt = now
  const text = detail || '本地存储空间紧张，已自动精简部分数据'
  try {
    getMessage().warning(text, {duration: 5000})
  } catch {
    console.warn(text)
  }
}
