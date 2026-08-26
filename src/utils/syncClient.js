/**
 * 二期：WebSocket 状态同步客户端
 * 桌面 WebView 与经本地服务打开的浏览器共享 settings / chat / image
 */

import {ref} from 'vue'
import {isTauri} from '@/utils/request'
import {createId} from '@/utils/id'
import {
  fetchLocalServerInfo,
  readAccessTokenFromPage,
} from '@/utils/localServer'

/** 连接状态：disconnected | connecting | connected */
export const syncStatus = ref('disconnected')
/** 最近一次错误（可读） */
export const syncError = ref('')
/** 服务端 rev */
export const syncRev = ref(0)

const CLIENT_ID = createId('sync')
const ROLE = isTauri() ? 'desktop' : 'browser'

const STREAM_THROTTLE_MS = 400
const RECONNECT_BASE_MS = 800
const RECONNECT_MAX_MS = 15000
const PING_INTERVAL_MS = 25000

let ws = null
let started = false
let shouldRun = false
let reconnectAttempt = 0
let reconnectTimer = null
let pingTimer = null
/** 防止远端写入再回推 */
let applyingRemote = false
/** welcome 后是否已推过本地 full_state（服务端无快照时） */
let pushedBootstrap = false

const throttleTimers = {
  settings: null,
  chat: null,
  image: null,
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function clearPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function clearThrottleTimers() {
  for (const key of Object.keys(throttleTimers)) {
    if (throttleTimers[key]) {
      clearTimeout(throttleTimers[key])
      throttleTimers[key] = null
    }
  }
}

/** 懒加载 store，避免与 stores 循环依赖 */
async function getStores() {
  const [{useSettingsStore}, {useChatStore}, {useImageStore}] = await Promise.all([
    import('@/stores/settings'),
    import('@/stores/chat'),
    import('@/stores/image'),
  ])
  return {
    settings: useSettingsStore(),
    chat: useChatStore(),
    image: useImageStore(),
  }
}

/**
 * 是否应启用同步：
 * - Tauri 桌面
 * - 或当前页经本地服务打开（有 token / 端口启发式）
 */
export function shouldEnableSync() {
  if (typeof window === 'undefined') return false
  if (isTauri()) return true
  if (readAccessTokenFromPage()) return true
  const port = Number(window.location.port)
  // 与默认区间及自定义偏好端口启发式对齐
  if (port >= 17890 && port <= 17999) return true
  return false
}

/**
 * 解析 WS URL
 * - 浏览器同源：相对 ws(s)://host/ws
 * - 桌面：用 get_local_server_info 的 host+port+token
 */
async function resolveWsUrl() {
  if (!isTauri() && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = readAccessTokenFromPage()
    const q = token ? `?t=${encodeURIComponent(token)}` : ''
    return `${proto}//${window.location.host}/ws${q}`
  }

  const info = await fetchLocalServerInfo()
  const host = info.bind === '0.0.0.0' ? '127.0.0.1' : info.bind || '127.0.0.1'
  const port = info.port
  const token = info.token || ''
  const path = info.wsPath || '/ws'
  return `ws://${host}:${port}${path}?t=${encodeURIComponent(token)}`
}

function getPersistable(storeName, stores) {
  if (storeName === 'settings') {
    const s = stores.settings
    return {
      providers: s.providers,
      activeProviderId: s.activeProviderId,
      theme: s.theme,
    }
  }
  if (storeName === 'chat') {
    const s = stores.chat
    return {sessions: s.sessions, activeId: s.activeId}
  }
  if (storeName === 'image') {
    const s = stores.image
    return {sessions: s.sessions, activeId: s.activeId}
  }
  return null
}

function collectFullState(stores) {
  return {
    settings: getPersistable('settings', stores),
    chat: getPersistable('chat', stores),
    image: getPersistable('image', stores),
  }
}

function sendRaw(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  try {
    ws.send(JSON.stringify(obj))
    return true
  } catch (e) {
    console.warn('[sync] 发送失败', e)
    return false
  }
}

function sendHello() {
  sendRaw({
    type: 'hello',
    clientId: CLIENT_ID,
    role: ROLE,
  })
}

async function sendFullState() {
  if (applyingRemote) return
  const stores = await getStores()
  sendRaw({
    type: 'full_state',
    clientId: CLIENT_ID,
    rev: syncRev.value,
    state: collectFullState(stores),
  })
}

/**
 * 推送单个 store 的完整可持久化对象
 * @param {'settings'|'chat'|'image'} storeName
 * @param {{ throttle?: boolean, immediate?: boolean }} [opts]
 */
export function pushStorePatch(storeName, opts = {}) {
  if (!shouldRun || applyingRemote) return
  if (!ws || ws.readyState !== WebSocket.OPEN) return

  const {throttle = false, immediate = false} = opts

  const doSend = () => {
    throttleTimers[storeName] = null
    if (applyingRemote) return
    getStores()
      .then((stores) => {
        if (applyingRemote) return
        const data = getPersistable(storeName, stores)
        if (!data) return
        sendRaw({
          type: 'patch',
          clientId: CLIENT_ID,
          rev: syncRev.value,
          store: storeName,
          data,
        })
      })
      .catch((e) => console.warn('[sync] patch 失败', e))
  }

  if (immediate) {
    if (throttleTimers[storeName]) {
      clearTimeout(throttleTimers[storeName])
      throttleTimers[storeName] = null
    }
    doSend()
    return
  }

  if (throttle) {
    if (throttleTimers[storeName]) return
    throttleTimers[storeName] = setTimeout(doSend, STREAM_THROTTLE_MS)
    return
  }

  doSend()
}

function applyFullState(state, stores) {
  if (!state || typeof state !== 'object') return
  if (state.settings) stores.settings.applyRemoteState(state.settings)
  if (state.chat) stores.chat.applyRemoteState(state.chat)
  if (state.image) stores.image.applyRemoteState(state.image)
}

function withApplyingRemote(fn) {
  applyingRemote = true
  try {
    fn()
  } finally {
    Promise.resolve().then(() => {
      applyingRemote = false
    })
  }
}

function onServerMessage(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  const type = msg?.type
  if (!type) return

  switch (type) {
    case 'welcome': {
      if (typeof msg.rev === 'number') syncRev.value = msg.rev
      if (msg.state) {
        getStores()
          .then((stores) => {
            withApplyingRemote(() => applyFullState(msg.state, stores))
            pushedBootstrap = true
          })
          .catch((e) => console.warn('[sync] welcome 应用失败', e))
      } else if (!pushedBootstrap) {
        pushedBootstrap = true
        sendFullState().catch((e) => console.warn('[sync] bootstrap 失败', e))
      }
      break
    }
    case 'full_state': {
      if (msg.from === CLIENT_ID) break
      if (typeof msg.rev === 'number') syncRev.value = msg.rev
      getStores()
        .then((stores) => {
          withApplyingRemote(() => applyFullState(msg.state, stores))
        })
        .catch((e) => console.warn('[sync] full_state 应用失败', e))
      break
    }
    case 'patch': {
      if (msg.from === CLIENT_ID) break
      if (typeof msg.rev === 'number') syncRev.value = msg.rev
      getStores()
        .then((stores) => {
          withApplyingRemote(() => {
            if (msg.store === 'settings') stores.settings.applyRemoteState(msg.data)
            else if (msg.store === 'chat') stores.chat.applyRemoteState(msg.data)
            else if (msg.store === 'image') stores.image.applyRemoteState(msg.data)
          })
        })
        .catch((e) => console.warn('[sync] patch 应用失败', e))
      break
    }
    case 'pong':
      break
    case 'error':
      syncError.value = msg.message || '同步错误'
      console.warn('[sync] server error:', msg.message)
      break
    default:
      break
  }
}

function scheduleReconnect() {
  clearReconnectTimer()
  if (!shouldRun) return
  const delay = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
  )
  reconnectAttempt += 1
  syncStatus.value = 'disconnected'
  reconnectTimer = setTimeout(() => {
    connect().catch((e) => {
      console.warn('[sync] 重连失败', e)
      scheduleReconnect()
    })
  }, delay)
}

async function connect() {
  if (!shouldRun) return
  clearReconnectTimer()
  clearPingTimer()

  if (ws) {
    try {
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }

  syncStatus.value = 'connecting'
  syncError.value = ''

  let url
  try {
    url = await resolveWsUrl()
  } catch (e) {
    syncError.value = e?.message || '无法解析 WS 地址'
    scheduleReconnect()
    return
  }

  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    try {
      ws = new WebSocket(url)
    } catch (e) {
      syncError.value = e?.message || 'WebSocket 创建失败'
      scheduleReconnect()
      finish()
      return
    }

    ws.onopen = () => {
      reconnectAttempt = 0
      syncStatus.value = 'connected'
      syncError.value = ''
      pushedBootstrap = false
      sendHello()
      clearPingTimer()
      pingTimer = setInterval(() => {
        sendRaw({type: 'ping'})
      }, PING_INTERVAL_MS)
      finish()
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') onServerMessage(ev.data)
    }

    ws.onerror = () => {
      syncError.value = 'WebSocket 错误'
    }

    ws.onclose = () => {
      clearPingTimer()
      ws = null
      if (shouldRun) {
        syncStatus.value = 'disconnected'
        scheduleReconnect()
      }
      finish()
    }
  })
}

/** 启动同步（幂等）。在 Pinia 就绪后调用。 */
export async function startSyncClient() {
  if (started) return
  if (!shouldEnableSync()) {
    syncStatus.value = 'disconnected'
    return
  }
  started = true
  shouldRun = true
  await connect()
}

/** 停止同步并关闭连接 */
export function stopSyncClient() {
  shouldRun = false
  started = false
  clearReconnectTimer()
  clearPingTimer()
  clearThrottleTimers()
  if (ws) {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
  syncStatus.value = 'disconnected'
}

/** 当前是否正在应用远端状态（供 store 判断） */
export function isApplyingRemote() {
  return applyingRemote
}
