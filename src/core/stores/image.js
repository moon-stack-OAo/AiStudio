/**
 * 生图会话 Pinia store：会话与生成条目 CRUD，联动 IndexedDB 图片缓存清理。
 * 持久化键：image_sessions；hydrate 时将残留 loading 标为 error。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {collectCacheIds, deleteImages} from '@core/utils/imageCache'
import {notifyStorageError} from '@core/utils/toast'

function createSession(title = '新生图') {
  return {
    id: createId('img'),
    title,
    type: 'image',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
  }
}

function collectSessionCacheIds(session) {
  if (!session?.items?.length) return []
  return session.items.flatMap((item) => collectCacheIds(item.images || []))
}

/** 裁剪超长 refPreview（多为 dataURL），避免撑爆 localStorage */
const MAX_REF_PREVIEW = 256

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return item
  const ref = item.refPreview
  if (typeof ref === 'string' && ref.length > MAX_REF_PREVIEW) {
    return { ...item, refPreview: '' }
  }
  return item
}

function sanitizeSessions(sessions) {
  return (sessions || []).map((session) => ({
    ...session,
    items: (session.items || []).map(sanitizeItem),
  }))
}

/** 启动 hydrate：残留 loading 标为 error，避免幽灵转圈 */
function clearStaleLoading(sessions) {
  return (sessions || []).map((session) => ({
    ...session,
    items: (session.items || []).map((item) => {
      if (item?.status !== 'loading') return item
      return {
        ...item,
        status: 'error',
        errorMessage: item.errorMessage || '上次异常中断',
      }
    }),
  }))
}

export const useImageStore = defineStore('image', {
  state: () => {
    const saved = loadJSON('image_sessions', null)
    if (saved?.sessions?.length) {
      const sessions = clearStaleLoading(sanitizeSessions(saved.sessions))
      const activeId = saved.activeId || saved.sessions[0].id
      const hadStaleLoading = (saved.sessions || []).some((s) =>
        (s.items || []).some((i) => i?.status === 'loading'),
      )
      // 清理结果立即落盘，避免仅内存修复、下次启动再读到幽灵 loading
      if (hadStaleLoading) {
        saveJSON('image_sessions', {sessions, activeId})
      }
      return {sessions, activeId}
    }
    const session = createSession()
    return {
      sessions: [session],
      activeId: session.id,
    }
  },
  getters: {
    activeSession(state) {
      return state.sessions.find((s) => s.id === state.activeId) || null
    },
    sortedSessions(state) {
      return [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    },
  },
  actions: {
    persist() {
      const ok = saveJSON('image_sessions', {
        sessions: this.sessions,
        activeId: this.activeId,
      })
      if (!ok) notifyStorageError('生图记录写入本地失败，刷新后可能丢失')
      return ok
    },
    createSession(title) {
      const session = createSession(title)
      this.sessions.unshift(session)
      this.activeId = session.id
      this.persist()
      return session
    },
    setActive(id) {
      this.activeId = id
      this.persist()
    },
    renameSession(id, title) {
      const session = this.sessions.find((s) => s.id === id)
      if (!session) return
      session.title = title
      session.updatedAt = Date.now()
      this.persist()
    },
    async removeSession(id) {
      const session = this.sessions.find((s) => s.id === id)
      const cacheIds = collectSessionCacheIds(session)

      this.sessions = this.sessions.filter((s) => s.id !== id)
      if (!this.sessions.length) {
        const next = createSession()
        this.sessions = [next]
        this.activeId = next.id
      } else if (this.activeId === id) {
        this.activeId = this.sessions[0].id
      }
      this.persist()

      // 同步清理 IndexedDB 缓存，失败不影响会话删除
      try {
        await deleteImages(cacheIds)
      } catch {
        // ignore
      }
    },
    addItem(sessionId, item) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return null
      const safe = sanitizeItem(item)
      const record = {
        id: createId('gen'),
        createdAt: Date.now(),
        status: 'done',
        ...safe,
      }
      session.items.push(record)
      session.updatedAt = Date.now()
      if (session.title === '新生图' && item.prompt) {
        session.title = String(item.prompt).slice(0, 24) || '新生图'
      }
      this.persist()
      return record
    },
    updateItem(sessionId, itemId, patch, options = {}) {
      const {persist = true} = options
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const target = session.items.find((i) => i.id === itemId)
      if (!target) return
      const safe = sanitizeItem({...target, ...patch})
      Object.assign(target, safe)
      session.updatedAt = Date.now()
      if (persist) this.persist()
    },
    async removeItem(sessionId, itemId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const target = session.items.find((i) => i.id === itemId)
      const cacheIds = collectCacheIds(target?.images || [])

      session.items = session.items.filter((i) => i.id !== itemId)
      session.updatedAt = Date.now()
      this.persist()

      try {
        await deleteImages(cacheIds)
      } catch {
        // ignore
      }
    },
    async clearItems(sessionId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const cacheIds = collectSessionCacheIds(session)
      session.items = []
      session.updatedAt = Date.now()
      this.persist()
      try {
        await deleteImages(cacheIds)
      } catch {
        // ignore
      }
    },
  },
})
