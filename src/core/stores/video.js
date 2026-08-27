import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {notifyStorageError} from '@core/utils/toast'
import {toErrorMessage, waitVideoJob} from '@core/api/client'

function createSession(title = '新视频') {
  return {
    id: createId('vid'),
    title,
    type: 'video',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
  }
}

const MAX_REF_PREVIEW = 256

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return item
  const next = { ...item }
  const ref = next.refPreview
  if (typeof ref === 'string' && ref.length > MAX_REF_PREVIEW) {
    next.refPreview = ''
  }
  // 禁止把巨大 dataURL / blob 以外的二进制塞进 localStorage；blob: 刷新后失效，仍可暂存便于当前会话
  if (typeof next.videoUrl === 'string' && next.videoUrl.startsWith('data:')) {
    if (next.videoUrl.length > 2048) {
      next.videoUrl = ''
      if (next.status === 'success') {
        next.errorMessage = next.errorMessage || '视频过大未缓存，请重新生成'
      }
    }
  }
  return next
}

function sanitizeSessions(sessions) {
  return (sessions || []).map((session) => ({
    ...session,
    items: (session.items || []).map(sanitizeItem),
  }))
}

/** hydrate：有 jobId 的 loading 标为 pending_resume；无 jobId 标 error */
function hydrateLoadingItems(sessions) {
  return (sessions || []).map((session) => ({
    ...session,
    items: (session.items || []).map((item) => {
      if (item?.status !== 'loading') return item
      if (item.jobId) {
        return {
          ...item,
          status: 'pending_resume',
          needsResume: true,
        }
      }
      return {
        ...item,
        status: 'error',
        errorMessage: item.errorMessage || '上次异常中断',
        needsResume: false,
      }
    }),
  }))
}

export const useVideoStore = defineStore('video', {
  state: () => {
    const saved = loadJSON('video_sessions', null)
    if (saved?.sessions?.length) {
      const sessions = hydrateLoadingItems(sanitizeSessions(saved.sessions))
      const activeId = saved.activeId || saved.sessions[0].id
      const changed = (saved.sessions || []).some((s) =>
        (s.items || []).some((i) => i?.status === 'loading'),
      )
      if (changed) {
        saveJSON('video_sessions', { sessions, activeId })
      }
      return { sessions, activeId }
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
    pendingResumeItems(state) {
      const list = []
      for (const session of state.sessions) {
        for (const item of session.items || []) {
          if (item?.needsResume && item?.jobId) {
            list.push({ sessionId: session.id, item })
          }
        }
      }
      return list
    },
  },
  actions: {
    persist() {
      const ok = saveJSON('video_sessions', {
        sessions: this.sessions,
        activeId: this.activeId,
      })
      if (!ok) notifyStorageError('视频记录写入本地失败，刷新后可能丢失')
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
    removeSession(id) {
      this.sessions = this.sessions.filter((s) => s.id !== id)
      if (!this.sessions.length) {
        const next = createSession()
        this.sessions = [next]
        this.activeId = next.id
      } else if (this.activeId === id) {
        this.activeId = this.sessions[0].id
      }
      this.persist()
    },
    addItem(sessionId, item) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return null
      const safe = sanitizeItem(item)
      const record = {
        id: createId('vgen'),
        createdAt: Date.now(),
        status: 'loading',
        progress: 0,
        ...safe,
      }
      session.items.push(record)
      session.updatedAt = Date.now()
      if (session.title === '新视频' && item.prompt) {
        session.title = String(item.prompt).slice(0, 24) || '新视频'
      }
      this.persist()
      return record
    },
    updateItem(sessionId, itemId, patch, options = {}) {
      const { persist = true } = options
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const target = session.items.find((i) => i.id === itemId)
      if (!target) return
      const safe = sanitizeItem({ ...target, ...patch })
      Object.assign(target, safe)
      session.updatedAt = Date.now()
      if (persist) this.persist()
    },
    removeItem(sessionId, itemId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      session.items = session.items.filter((i) => i.id !== itemId)
      session.updatedAt = Date.now()
      this.persist()
    },
    clearItems(sessionId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      session.items = []
      session.updatedAt = Date.now()
      this.persist()
    },
    /**
     * 恢复仍有 jobId 的未完成任务（由 UI 在挂载时调用）
     * @param {(id: string) => object|null} getProviderById
     */
    async resumePendingJobs(getProviderById, options = {}) {
      const { signal, onProgress, intervalMs } = options
      const pending = this.pendingResumeItems
      if (!pending.length) return []

      const results = []
      for (const { sessionId, item } of pending) {
        const provider =
          typeof getProviderById === 'function'
            ? getProviderById(item.providerId)
            : null
        if (!provider?.baseUrl || !item.jobId) {
          this.updateItem(sessionId, item.id, {
            status: 'error',
            needsResume: false,
            errorMessage: '无法恢复：缺少提供商或任务 ID',
          })
          continue
        }
        this.updateItem(sessionId, item.id, {
          status: 'loading',
          needsResume: false,
        })
        try {
          const job = await waitVideoJob(provider, item.jobId, {
            signal,
            intervalMs,
            onProgress: (j) => {
              this.updateItem(
                sessionId,
                item.id,
                {
                  status: 'loading',
                  progress: j.progress,
                  jobId: j.jobId || item.jobId,
                },
                { persist: false },
              )
              onProgress?.(sessionId, item.id, j)
            },
          })
          if (job.status === 'completed' && job.videoUrl) {
            this.updateItem(sessionId, item.id, {
              status: 'success',
              progress: 100,
              videoUrl: job.videoUrl,
              errorMessage: '',
              needsResume: false,
            })
          } else {
            this.updateItem(sessionId, item.id, {
              status: 'error',
              errorMessage: job.errorMessage || '视频生成失败',
              needsResume: false,
            })
          }
          results.push({ sessionId, itemId: item.id, job })
        } catch (e) {
          if (e?.name === 'AbortError') {
            this.updateItem(sessionId, item.id, {
              status: 'pending_resume',
              needsResume: true,
              errorMessage: '',
            })
            throw e
          }
          this.updateItem(sessionId, item.id, {
            status: 'error',
            needsResume: false,
            errorMessage: toErrorMessage(e, '恢复任务失败'),
          })
          results.push({ sessionId, itemId: item.id, error: e })
        }
      }
      return results
    },
  },
})
