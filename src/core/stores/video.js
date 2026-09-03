/**
 * 视频会话 Pinia store：任务条目、进度与未完成任务恢复（resumePendingJobs）。
 * 持久化键：video_sessions；写入前做体积守卫，hydrate 时有 jobId 的 loading → pending_resume。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {notifyStorageError, notifyStorageWarning} from '@core/utils/toast'
import {toErrorMessage, waitVideoJob} from '@core/api/client'
import {
  VIDEO_PERSIST_LIMITS,
  VIDEO_PERSIST_RETRY,
  collectDroppedMediaItems,
  prepareMediaPersistPayload,
} from '@core/utils/mediaPersist'

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

function revokeBlobUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
}

function revokeItemVideoUrl(item) {
  revokeBlobUrl(item?.videoUrl)
}

/** 允许持久化小缩略图 dataURL（约 160px JPEG）；超大仍清空防撑爆 localStorage */
const MAX_REF_PREVIEW = 48_000

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return item
  const next = {...item}
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
  // 保留 remoteVideoUrl（https），禁止被清掉；blob 失效后可重新加载
  if (typeof next.remoteVideoUrl === 'string') {
    const remote = next.remoteVideoUrl.trim()
    next.remoteVideoUrl = /^https?:\/\//i.test(remote) ? remote : next.remoteVideoUrl
  }
  return next
}

/** 从 localStorage hydrate：blob: 已失效，有 remote 则改回 https 直接播 */
function hydrateVideoUrls(sessions) {
  return (sessions || []).map((session) => ({
    ...session,
    items: (session.items || []).map((item) => {
      if (!item || typeof item !== 'object') return item
      const url = item.videoUrl
      if (typeof url !== 'string' || !url.startsWith('blob:')) return item
      const remote = item.remoteVideoUrl
      if (typeof remote === 'string' && /^https?:\/\//i.test(remote)) {
        return {
          ...item,
          videoUrl: remote,
          needsMaterialize: false,
        }
      }
      return item
    }),
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

function prepareVideoPayload(raw, limits = VIDEO_PERSIST_LIMITS) {
  return prepareMediaPersistPayload(raw, {
    ...limits,
    sanitizeItem,
  })
}

export const useVideoStore = defineStore('video', {
  state: () => {
    const saved = loadJSON('video_sessions', null)
    if (saved?.sessions?.length) {
      const hydrated = hydrateVideoUrls(
        hydrateLoadingItems(
          (saved.sessions || []).map((session) => ({
            ...session,
            items: (session.items || []).map(sanitizeItem),
          })),
        ),
      )
      const prepared = prepareVideoPayload({
        sessions: hydrated,
        activeId: saved.activeId,
      })
      const {sessions, activeId} = prepared.payload
      const resolvedActive = activeId || sessions[0]?.id
      const changed = (saved.sessions || []).some((s) =>
        (s.items || []).some((i) => i?.status === 'loading'),
      )
      if (prepared.trimmed || changed) {
        saveJSON('video_sessions', {sessions, activeId: resolvedActive})
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
    pendingResumeItems(state) {
      const list = []
      for (const session of state.sessions) {
        for (const item of session.items || []) {
          if (item?.needsResume && item?.jobId) {
            list.push({sessionId: session.id, item})
          }
        }
      }
      return list
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
      const first = prepareVideoPayload({
        sessions: this.sessions,
        activeId: this.activeId,
      })
      let payload = first.payload
      let usedRetry = false
      let ok = saveJSON('video_sessions', payload)

      if (!ok) {
        const retry = prepareVideoPayload(
          {sessions: this.sessions, activeId: this.activeId},
          VIDEO_PERSIST_RETRY,
        )
        payload = retry.payload
        usedRetry = true
        ok = saveJSON('video_sessions', payload)
      }

      if (ok) {
        const didTrim = first.trimmed || usedRetry
        if (didTrim) {
          const dropped = collectDroppedMediaItems(beforeSessions, payload.sessions)
          dropped.forEach(revokeItemVideoUrl)
          this.sessions = payload.sessions
          this.activeId = payload.activeId || payload.sessions[0]?.id || this.activeId
          const parts = []
          if (payload.sessions.length < beforeSessionCount || first.droppedSessions > 0) {
            parts.push('已清理部分旧会话')
          }
          parts.push(
            usedRetry ? '写入失败后已强制精简并重试成功' : '已自动精简过长或过多的旧内容以便保存',
          )
          notifyStorageWarning(`视频记录过多，${parts.join('；')}。建议手动删除不用的会话`)
        }
        return true
      }

      notifyStorageError('视频记录写入本地失败，已尝试裁剪仍无法保存，请删除旧会话后重试')
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
    removeSession(id) {
      const removed = this.sessions.find((s) => s.id === id)
      ;(removed?.items || []).forEach(revokeItemVideoUrl)
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
      const {persist = true} = options
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const target = session.items.find((i) => i.id === itemId)
      if (!target) return
      if (
        patch &&
        Object.prototype.hasOwnProperty.call(patch, 'videoUrl') &&
        patch.videoUrl !== target.videoUrl
      ) {
        revokeItemVideoUrl(target)
      }
      const merged = {...target, ...patch}
      // 禁止用空串清掉已有 https remoteVideoUrl
      const prevRemote = target.remoteVideoUrl
      if (
        typeof prevRemote === 'string' &&
        /^https?:\/\//i.test(prevRemote) &&
        (!merged.remoteVideoUrl || !/^https?:\/\//i.test(String(merged.remoteVideoUrl)))
      ) {
        merged.remoteVideoUrl = prevRemote
      }
      const safe = sanitizeItem(merged)
      Object.assign(target, safe)
      session.updatedAt = Date.now()
      if (persist) this.persist()
    },
    removeItem(sessionId, itemId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      const removed = session.items.find((i) => i.id === itemId)
      revokeItemVideoUrl(removed)
      session.items = session.items.filter((i) => i.id !== itemId)
      session.updatedAt = Date.now()
      this.persist()
    },
    clearItems(sessionId) {
      const session = this.sessions.find((s) => s.id === sessionId)
      if (!session) return
      ;(session.items || []).forEach(revokeItemVideoUrl)
      session.items = []
      session.updatedAt = Date.now()
      this.persist()
    },
    /**
     * 恢复仍有 jobId 的未完成任务（由 UI 在挂载时调用）
     * @param {(id: string) => object|null} getProviderById 按条目 providerId 解析提供商
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @param {(sessionId: string, itemId: string, job: object) => void} [options.onProgress]
     * @param {number} [options.intervalMs]
     * @returns {Promise<Array<{ sessionId: string, itemId: string, job?: object, error?: unknown }>>}
     */
    async resumePendingJobs(getProviderById, options = {}) {
      const {signal, onProgress, intervalMs} = options
      const pending = this.pendingResumeItems
      if (!pending.length) return []

      const results = []
      for (const {sessionId, item} of pending) {
        const provider =
          typeof getProviderById === 'function' ? getProviderById(item.providerId) : null
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
              const patch = {
                status: 'loading',
                progress: j.progress,
                jobId: j.jobId || item.jobId,
              }
              const isContentUrl = (u) =>
                /(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(String(u || ''))
              const earlyPlayable =
                (typeof j?.videoUrl === 'string' && String(j.videoUrl).startsWith('blob:')
                  ? j.videoUrl
                  : '') ||
                (typeof j?.remoteVideoUrl === 'string' &&
                /^https?:\/\//i.test(j.remoteVideoUrl) &&
                !isContentUrl(j.remoteVideoUrl)
                  ? j.remoteVideoUrl
                  : '') ||
                (typeof j?.videoUrl === 'string' &&
                /^https?:\/\//i.test(j.videoUrl) &&
                !isContentUrl(j.videoUrl)
                  ? j.videoUrl
                  : '') ||
                (typeof j?.raw?.video?.url === 'string' &&
                /^https?:\/\//i.test(j.raw.video.url) &&
                !isContentUrl(j.raw.video.url)
                  ? j.raw.video.url
                  : '')
              if (earlyPlayable) {
                patch.videoUrl = earlyPlayable
                if (/^https?:\/\//i.test(earlyPlayable)) patch.remoteVideoUrl = earlyPlayable
                else if (
                  typeof j?.remoteVideoUrl === 'string' &&
                  /^https?:\/\//i.test(j.remoteVideoUrl)
                ) {
                  patch.remoteVideoUrl = j.remoteVideoUrl
                }
              }
              this.updateItem(sessionId, item.id, patch, {persist: false})
              onProgress?.(sessionId, item.id, j)
            },
          })
          if (job.status === 'completed' && job.videoUrl) {
            const isContent = (u) => /(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(String(u || ''))
            const pickDirect = (...cands) => {
              for (const c of cands) {
                const s = String(c || '').trim()
                if (/^https?:\/\//i.test(s) && !isContent(s)) return s
              }
              return ''
            }
            const pickAnyHttps = (...cands) => {
              for (const c of cands) {
                const s = String(c || '').trim()
                if (/^https?:\/\//i.test(s)) return s
              }
              return ''
            }
            const playable =
              (String(job.videoUrl || '').startsWith('blob:') ? job.videoUrl : '') ||
              pickDirect(job.videoUrl, job.remoteVideoUrl, job.raw?.video?.url) ||
              ''
            const remoteVideoUrl =
              pickDirect(job.remoteVideoUrl, job.videoUrl, job.raw?.video?.url) ||
              pickAnyHttps(job.remoteVideoUrl, job.videoUrl, job.raw?.video?.url) ||
              item.remoteVideoUrl ||
              ''
            this.updateItem(sessionId, item.id, {
              status: playable ? 'success' : 'error',
              progress: 100,
              videoUrl: playable || '',
              remoteVideoUrl,
              needsMaterialize: Boolean(job.needsMaterialize) || !playable,
              errorMessage: playable
                ? ''
                : job.errorMessage || '视频已生成但本地加载失败，可尝试重新加载',
              needsResume: false,
            })
          } else {
            this.updateItem(sessionId, item.id, {
              status: 'error',
              errorMessage: job.errorMessage || '视频生成失败',
              needsResume: false,
            })
          }
          results.push({sessionId, itemId: item.id, job})
        } catch (e) {
          if (e?.name === 'AbortError') {
            const live = this.sessions
              .find((s) => s.id === sessionId)
              ?.items?.find((i) => i.id === item.id)
            this.updateItem(sessionId, item.id, {
              status: 'pending_resume',
              needsResume: true,
              errorMessage: live?.errorMessage || item.errorMessage || '已停止轮询，可手动恢复',
            })
            results.push({sessionId, itemId: item.id, error: e})
            // 共享 signal 中止：结束本批，未开始的项仍保持 pending_resume，不整批抛错
            break
          }
          const isTimeout = e?.name === 'TimeoutError' || e?.code === 'VIDEO_JOB_TIMEOUT'
          if (isTimeout) {
            this.updateItem(sessionId, item.id, {
              status: 'pending_resume',
              needsResume: true,
              errorMessage: e?.message || '视频生成超时，可稍后恢复轮询',
            })
          } else {
            this.updateItem(sessionId, item.id, {
              status: 'error',
              needsResume: false,
              errorMessage: toErrorMessage(e, '恢复任务失败'),
            })
          }
          results.push({sessionId, itemId: item.id, error: e})
        }
      }
      return results
    },
  },
})
