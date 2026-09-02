/**
 * 对话会话 Pinia store：多会话 CRUD、消息追加/更新、用户消息撤回。
 * 持久化键：chat_sessions；写入前做体积守卫，失败时降级裁剪后重试。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {notifyStorageError, notifyStorageWarning} from '@core/utils/toast'
import {CHAT_PAYLOAD_RETRY_CHARS, prepareChatPersistPayload, sanitizeChatSession} from '@core/utils/chatPersist'

function normalizeOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next = {}
  if (Object.prototype.hasOwnProperty.call(raw, 'systemPrompt')) {
    next.systemPrompt = raw.systemPrompt == null ? null : String(raw.systemPrompt)
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'temperature')) {
    if (raw.temperature == null) {
      next.temperature = null
    } else {
      const n = Number(raw.temperature)
      if (Number.isFinite(n)) next.temperature = Math.min(2, Math.max(0, Math.round(n * 10) / 10))
    }
  }
  return next
}

function createSession(title = '新对话') {
  return {
    id: createId('chat'),
    title,
    type: 'chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    overrides: {},
  }
}

function hydrateSession(s) {
  return sanitizeChatSession({
    ...s,
    overrides: normalizeOverrides(s?.overrides),
  })
}

export const useChatStore = defineStore('chat', {
  state: () => {
    const saved = loadJSON('chat_sessions', null)
    if (saved?.sessions?.length) {
      const prepared = prepareChatPersistPayload({
        sessions: saved.sessions.map(hydrateSession),
        activeId: saved.activeId,
      })
      const {sessions, activeId} = prepared.payload
      const resolvedActive = activeId || sessions[0]?.id
      if (prepared.trimmed) {
        saveJSON('chat_sessions', {sessions, activeId: resolvedActive})
      }
      return {
        sessions,
        activeId: resolvedActive,
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
    /**
     * 写入 localStorage：先标准裁剪；失败则更激进裁剪后重试一次，并同步内存态。
     * @returns {boolean}
     */
    persist() {
      const beforeSessionCount = this.sessions.length
      const first = prepareChatPersistPayload({
        sessions: this.sessions,
        activeId: this.activeId,
      })
      let payload = first.payload
      let usedRetry = false
      let ok = saveJSON('chat_sessions', payload)

      if (!ok) {
        const retry = prepareChatPersistPayload(
          {sessions: this.sessions, activeId: this.activeId},
          {maxPayloadChars: CHAT_PAYLOAD_RETRY_CHARS, maxMessagesPerSession: 80, maxSessions: 20},
        )
        payload = retry.payload
        usedRetry = true
        ok = saveJSON('chat_sessions', payload)
      }

      if (ok) {
        const didTrim = first.trimmed || usedRetry
        // 仅在实际裁剪时回写内存，避免无谓替换消息对象引用打断流式更新
        if (didTrim) {
          this.sessions = payload.sessions
          this.activeId = payload.activeId || payload.sessions[0]?.id || this.activeId
          const parts = []
          if (payload.sessions.length < beforeSessionCount || first.droppedSessions > 0) {
            parts.push('已清理部分旧会话')
          }
          parts.push(
            usedRetry ? '写入失败后已强制精简并重试成功' : '已自动精简过长或过多的旧内容以便保存',
          )
          notifyStorageWarning(`会话过多或过长，${parts.join('；')}。建议手动删除不用的会话`)
        }
        return true
      }

      notifyStorageError('对话记录写入本地失败，已尝试裁剪仍无法保存，请删除旧会话后重试')
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
    /**
     * 合并更新会话字段（如 overrides）
     * @param {string} id
     * @param {object} patch
     */
    updateSession(id, patch) {
      const session = this.sessions.find((s) => s.id === id)
      if (!session || !patch || typeof patch !== 'object') return
      if (Object.prototype.hasOwnProperty.call(patch, 'overrides')) {
        session.overrides = normalizeOverrides(patch.overrides)
        const rest = {...patch}
        delete rest.overrides
        Object.assign(session, rest)
      } else {
        Object.assign(session, patch)
      }
      session.updatedAt = Date.now()
      this.persist()
    },
    /**
     * 设置会话级覆盖（null 表示清除该键、跟随全局）
     * @param {string} id
     * @param {{ systemPrompt?: string|null, temperature?: number|null }} patch
     */
    setSessionOverrides(id, patch = {}) {
      const session = this.sessions.find((s) => s.id === id)
      if (!session) return
      const current = normalizeOverrides(session.overrides)
      const next = {...current}
      if (Object.prototype.hasOwnProperty.call(patch, 'systemPrompt')) {
        if (patch.systemPrompt == null) delete next.systemPrompt
        else next.systemPrompt = String(patch.systemPrompt)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'temperature')) {
        if (patch.temperature == null) delete next.temperature
        else {
          const n = Number(patch.temperature)
          if (Number.isFinite(n)) {
            next.temperature = Math.min(2, Math.max(0, Math.round(n * 10) / 10))
          }
        }
      }
      session.overrides = next
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
      const {persist = true} = options
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const msg = session.messages.find((m) => m.id === messageId)
      if (!msg) return
      Object.assign(msg, patch)
      session.updatedAt = Date.now()
      if (persist) this.persist()
    },
    /**
     * 撤回用户消息；若紧随其后是 assistant 回复，一并删除。
     * @param {string} sessionId
     * @param {string} messageId 用户消息 ID
     * @returns {{ removedIds: string[], abortedStreaming: boolean } | null}
     */
    recallUserMessage(sessionId, messageId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return null
      const idx = session.messages.findIndex((m) => m.id === messageId)
      if (idx < 0) return null
      const msg = session.messages[idx]
      if (msg.role !== 'user') return null

      const removedIds = [msg.id]
      let abortedStreaming = Boolean(msg.streaming)
      let deleteCount = 1
      const next = session.messages[idx + 1]
      if (next?.role === 'assistant') {
        removedIds.push(next.id)
        abortedStreaming = abortedStreaming || Boolean(next.streaming)
        deleteCount = 2
      }
      session.messages.splice(idx, deleteCount)
      session.updatedAt = Date.now()
      this.persist()
      return {removedIds, abortedStreaming}
    },
  },
})
