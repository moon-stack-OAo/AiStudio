import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@/utils/storage'
import {createId} from '@/utils/id'

function createSession(title = '新对话') {
  return {
    id: createId('chat'),
    title,
    type: 'chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  }
}

export const useChatStore = defineStore('chat', {
  state: () => {
    const saved = loadJSON('chat_sessions', null)
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
      saveJSON('chat_sessions', {
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
    removeSession(id) {
      this.sessions = this.sessions.filter((s) => s.id !== id)
      if (!this.sessions.length) {
        const session = createSession()
        this.sessions = [session]
        this.activeId = session.id
      } else if (this.activeId === id) {
        this.activeId = this.sessions[0].id
      }
      this.persist()
    },
    clearMessages(id) {
      const session = this.sessions.find((s) => s.id === id)
      if (!session) return
      session.messages = []
      session.updatedAt = Date.now()
      this.persist()
    },
    appendMessage(sessionId, message) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return null
      const item = {
        id: createId('msg'),
        createdAt: Date.now(),
        ...message,
      }
      session.messages.push(item)
      session.updatedAt = Date.now()
      if (
        session.title === '新对话' &&
        message.role === 'user' &&
        typeof message.content === 'string'
      ) {
        session.title = message.content.slice(0, 24) || '新对话'
      }
      this.persist()
      return item
    },
    updateMessage(sessionId, messageId, patch, options = {}) {
      const { persist = true } = options
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const msg = session.messages.find((m) => m.id === messageId)
      if (!msg) return
      Object.assign(msg, patch)
      session.updatedAt = Date.now()
      if (persist) this.persist()
    },
  },
})
