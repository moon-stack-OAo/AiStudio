import {computed, ref} from 'vue'
import {logWarn} from '@core/utils/logger'

/** 视频 pending_resume 恢复子系统（与 generate 经 gen runtime 互斥） */
export function useVideoResume({videoStore, gen, message, getProviderById, getSessionId}) {
  const resumeAbortRef = ref(null)
  const isResuming = computed(() => Boolean(resumeAbortRef.value))

  function abortResumeOnly() {
    const controller = resumeAbortRef.value
    if (!controller) return
    const sid = gen.sessionId
    resumeAbortRef.value = null
    controller.abort()
    // 同步释放 resume 占用的 busy，并回写 pending，避免 generate 被微任务竞态挡住
    if (sid) {
      for (const s of videoStore.sessions) {
        for (const it of s.items || []) {
          if (it.status === 'loading' && it.jobId) {
            videoStore.updateItem(s.id, it.id, {
              status: 'pending_resume',
              needsResume: true,
              errorMessage: it.errorMessage || '已停止轮询，可手动恢复',
            })
          }
        }
      }
      gen.end(sid, controller)
    }
  }

  function startResumeIfNeeded() {
    if (gen.busy || resumeAbortRef.value) return
    const pending = videoStore.pendingResumeItems
    if (!pending.length) return
    const controller = new AbortController()
    resumeAbortRef.value = controller

    const activeId = videoStore.activeId
    const bindSessionId =
      pending.find((p) => p.sessionId === activeId)?.sessionId || pending[0]?.sessionId
    const bindToGen = Boolean(bindSessionId)
    if (bindToGen) {
      gen.begin(bindSessionId, controller)
    }

    videoStore
      .resumePendingJobs(getProviderById, {signal: controller.signal})
      .catch((e) => {
        if (e?.name === 'AbortError') return
        logWarn(e?.message || '恢复视频任务失败', {source: 'video'})
      })
      .finally(() => {
        if (resumeAbortRef.value === controller) {
          resumeAbortRef.value = null
        }
        if (bindToGen) {
          gen.end(bindSessionId, controller)
        }
      })
  }

  /** 手动恢复单条（或全部 pending）轮询 */
  function resumeItem(item) {
    if (!item?.jobId) {
      message.warning('无法恢复：缺少任务 ID')
      return
    }
    if (gen.busy) {
      message.warning('当前有任务进行中，请稍后再试')
      return
    }
    const sessionId = getSessionId()
    if (!sessionId) return
    videoStore.updateItem(sessionId, item.id, {
      status: 'pending_resume',
      needsResume: true,
      errorMessage: item.errorMessage || '正在恢复轮询…',
    })
    startResumeIfNeeded()
  }

  /** 放弃 pending_resume，解除锁死 */
  function abandonPendingItem(item) {
    if (!item) return
    const sessionId = getSessionId()
    if (!sessionId) return
    videoStore.updateItem(sessionId, item.id, {
      status: 'error',
      needsResume: false,
      errorMessage: item.errorMessage || '已放弃恢复',
    })
  }

  return {
    resumeAbortRef,
    isResuming,
    abortResumeOnly,
    startResumeIfNeeded,
    resumeItem,
    abandonPendingItem,
  }
}
