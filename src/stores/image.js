import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@/utils/storage'
import {createId} from '@/utils/id'
import {collectCacheIds, deleteImages} from '@/utils/imageCache'
import {isApplyingRemote, pushStorePatch} from '@/utils/syncClient'

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

export const useImageStore = defineStore('image', {
  state: () => {
    const saved = loadJSON('image_sessions', null)
    if (saved?.sessions?.length) {
      return {
        sessions: saved.sessions,
        activeId: saved.activeId || saved.sessions[0].id,
      }
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
      saveJSON('image_sessions', {
        sessions: this.sessions,
        activeId: this.activeId,
      })
      if (!isApplyingRemote()) {
        pushStorePatch('image')
      }
    },
    /** 应用远端完整 image 元数据（IndexedDB Blob 不同步） */
    applyRemoteState(data) {
      if (!data || typeof data !== 'object') return
      if (Array.isArray(data.sessions)) {
        this.sessions = data.sessions
      }
      if (data.activeId) {
        this.activeId = data.activeId
      } else if (this.sessions.length) {
        this.activeId = this.sessions[0].id
      }
      saveJSON('image_sessions', {
        sessions: this.sessions,
        activeId: this.activeId,
      })
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
      const record = {
        id: createId('gen'),
        createdAt: Date.now(),
        ...item,
      }
      session.items.unshift(record)
      session.updatedAt = Date.now()
      if (session.title === '新生图' && item.prompt) {
        session.title = String(item.prompt).slice(0, 24) || '新生图'
      }
      this.persist()
      return record
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
  },
})
