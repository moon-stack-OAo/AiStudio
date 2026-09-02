/**
 * 生图会话 Pinia store：会话与生成条目 CRUD，联动 IndexedDB 图片缓存清理。
 * 持久化键：image_sessions；写入前做体积守卫，hydrate 时将残留 loading 标为 error。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {collectCacheIds, deleteImages} from '@core/utils/imageCache'
import {notifyStorageError, notifyStorageWarning} from '@core/utils/toast'
import {
  IMAGE_PERSIST_LIMITS,
  IMAGE_PERSIST_RETRY,
  collectDroppedMediaItems,
  prepareMediaPersistPayload,
} from '@core/utils/mediaPersist'

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

function collectItemsCacheIds(items) {
  return (items || []).flatMap((item) => collectCacheIds(item.images || []))
}

/** 裁剪超长 refPreview（多为 dataURL），避免撑爆 localStorage */
const MAX_REF_PREVIEW = 256

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return item
  const ref = item.refPreview
  if (typeof ref === 'string' && ref.length > MAX_REF_PREVIEW) {
    return {...item, refPreview: ''}
  }
  return item
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

function prepareImagePayload(raw, limits = IMAGE_PERSIST_LIMITS) {
  return prepareMediaPersistPayload(raw, {
    ...limits,
    sanitizeItem,
  })
}

export const useImageStore = defineStore('image', {
  state: () => {
    const saved = loadJSON('image_sessions', null)
    if (saved?.sessions?.length) {
      const hydrated = clearStaleLoading(saved.sessions.map((s) => ({
        ...s,
        items: (s.items || []).map(sanitizeItem),
      })))
      const prepared = prepareImagePayload({
        sessions: hydrated,
        activeId: saved.activeId,
      })
      const {sessions, activeId} = prepared.payload
      const resolvedActive = activeId || sessions[0]?.id
      const hadStaleLoading = (saved.sessions || []).some((s) =>
        (s.items || []).some((i) => i?.status === 'loading'),
      )
      if (prepared.trimmed || hadStaleLoading) {
        saveJSON('image_sessions', {sessions, activeId: resolvedActive})
      }
      return {sessions, activeId: resolvedActive}
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
    /**
     * 写入 localStorage：先标准裁剪；失败则更激进裁剪后重试一次，并同步内存态。
     * @returns {boolean}
     */
    persist() {
      const beforeSessions = this.sessions
      const beforeSessionCount = beforeSessions.length
      const first = prepareImagePayload({
        sessions: this.sessions,
        activeId: this.activeId,
      })
      let payload = first.payload
      let usedRetry = false
      let ok = saveJSON('image_sessions', payload)

      if (!ok) {
        const retry = prepareImagePayload(
          {sessions: this.sessions, activeId: this.activeId},
          IMAGE_PERSIST_RETRY,
        )
        payload = retry.payload
        usedRetry = true
        ok = saveJSON('image_sessions', payload)
      }

      if (ok) {
        const didTrim = first.trimmed || usedRetry
        if (didTrim) {
          const dropped = collectDroppedMediaItems(beforeSessions, payload.sessions)
          this.sessions = payload.sessions
          this.activeId = payload.activeId || payload.sessions[0]?.id || this.activeId
          const parts = []
          if (payload.sessions.length < beforeSessionCount || first.droppedSessions > 0) {
            parts.push('已清理部分旧会话')
          }
          parts.push(
            usedRetry ? '写入失败后已强制精简并重试成功' : '已自动精简过长或过多的旧内容以便保存',
          )
          notifyStorageWarning(`生图记录过多，${parts.join('；')}。建议手动删除不用的会话`)
          const cacheIds = collectItemsCacheIds(dropped)
          if (cacheIds.length) {
            deleteImages(cacheIds).catch(() => {})
          }
        }
        return true
      }

      notifyStorageError('生图记录写入本地失败，已尝试裁剪仍无法保存，请删除旧会话后重试')
      return false
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
