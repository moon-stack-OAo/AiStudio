import {nextTick} from 'vue'
import {fileToPreview, toErrorMessage} from '@core/api/client'

/** 视频 generate / retry / stop 共用生命周期 */
export function useVideoJobRunner(deps) {
  const {
    videoStore,
    gen,
    message,
    runGenerate,
    getSession,
    getProvider,
    mounted,
    mode,
    prompt,
    seconds,
    size,
    aspectRatio,
    resolution,
    imageFile,
    previewUrl,
    showSize,
    showAspectRatio,
    showResolution,
    scheduleScrollToBottom,
    abortResumeOnly,
    ensureProvider,
    applyItemParams,
    setRefThumb,
    rememberRefFile,
    refFileBySession,
    refThumbMap,
    resolveRemoteVideoUrl,
    rememberRemoteVideoUrl,
  } = deps

  /** 真正进行中的任务（不含仅等待用户恢复的 pending_resume） */
  function sessionHasInFlightJob(sessionId = getSession()?.id) {
    if (!sessionId) return false
    const s = videoStore.sessions.find((x) => x.id === sessionId)
    return (s?.items || []).some((i) => i.status === 'loading')
  }

  function makeFollowTimeline(sessionId) {
    let forceScrollPending = true
    return () => {
      if (videoStore.activeId !== sessionId) return
      if (forceScrollPending) {
        forceScrollPending = false
        scheduleScrollToBottom({force: true})
        return
      }
      scheduleScrollToBottom()
    }
  }

  function pickNewItemId(sessionId, itemsBefore, resultItemId) {
    const session = videoStore.sessions.find((x) => x.id === sessionId) || getSession()
    return resultItemId || (session?.items || []).find((i) => !itemsBefore.has(i.id))?.id
  }

  function rememberRemoteFromResult(sessionId, newItemId, result) {
    if (!newItemId) return
    const session = videoStore.sessions.find((x) => x.id === sessionId) || getSession()
    const created = (session?.items || []).find((i) => i.id === newItemId)
    const remote =
      resolveRemoteVideoUrl(created) ||
      (typeof result?.job?.remoteVideoUrl === 'string' ? result.job.remoteVideoUrl : '') ||
      (typeof result?.job?.videoUrl === 'string' && /^https?:\/\//i.test(result.job.videoUrl)
        ? result.job.videoUrl
        : '')
    if (remote) rememberRemoteVideoUrl(newItemId, remote)
  }

  /**
   * generate / retry 共用：begin → runGenerate → 记 remote/ref → toast → end
   */
  async function executeJob({
    sessionId,
    runOptions,
    afterItem,
    errorFallback = '生成失败',
  }) {
    gen.abort()
    const controller = new AbortController()
    gen.begin(sessionId, controller)

    const followTimeline = makeFollowTimeline(sessionId)
    const itemsBefore = new Set((getSession()?.items || []).map((i) => i.id))

    try {
      const result = await runGenerate(getProvider(), sessionId, {
        ...runOptions,
        signal: controller.signal,
        onTimelineUpdate: followTimeline,
      })

      const newItemId = pickNewItemId(sessionId, itemsBefore, result?.itemId)
      rememberRemoteFromResult(sessionId, newItemId, result)
      afterItem?.(newItemId, result)

      if (controller.signal.aborted) return
      if (mounted.value && videoStore.activeId === sessionId) {
        message.success('视频生成成功')
      }
    } catch (err) {
      const newItemId = pickNewItemId(sessionId, itemsBefore)
      afterItem?.(newItemId, null)
      if (err?.name === 'AbortError' || err?.message === 'canceled' || controller.signal.aborted) {
        return
      }
      if (mounted.value && videoStore.activeId === sessionId) {
        message.error(toErrorMessage(err, errorFallback))
      }
    } finally {
      gen.end(sessionId, controller)
    }
  }

  async function generate() {
    const text = prompt.value.trim()
    const session = getSession()
    if (!session) return
    // 先杀 resume 腾 busy；再与 canGenerate 对齐拦截叠任务
    abortResumeOnly()
    if (gen.busy || sessionHasInFlightJob()) return
    if (!ensureProvider()) return
    if (mode.value === 'img2video' && !imageFile.value) {
      message.warning('图生视频请先上传参考图')
      return
    }
    if (mode.value !== 'img2video' && !text) {
      message.warning('请输入提示词')
      return
    }

    const sessionId = session.id
    const savedPrompt = text
    const savedMode = mode.value
    const savedFile = imageFile.value
    const savedPreview = previewUrl.value

    prompt.value = ''

    await nextTick()

    await executeJob({
      sessionId,
      runOptions: {
        prompt: savedPrompt,
        mode: savedMode,
        imageFile: savedMode === 'img2video' ? savedFile : undefined,
        seconds: seconds.value,
        duration: seconds.value,
        size: showSize.value ? size.value : undefined,
        aspectRatio: showAspectRatio.value ? aspectRatio.value : undefined,
        resolution: showResolution.value ? resolution.value : undefined,
      },
      afterItem: (newItemId) => {
        if (savedMode === 'img2video' && newItemId) {
          if (savedPreview) setRefThumb(sessionId, newItemId, savedPreview)
          if (savedFile) rememberRefFile(sessionId, newItemId, savedFile)
        }
      },
      errorFallback: '生成失败',
    })
  }

  function stopGenerate() {
    const sessionId = getSession()?.id
    if (!sessionId) return
    const hasLocalJob = sessionHasInFlightJob(sessionId)
    if (!gen.isCurrent(sessionId) && !hasLocalJob) return

    // 仅处理真正进行中的 loading；pending_resume 由「恢复 / 放弃」按钮处理
    const loadingItem = getSession()?.items?.find((i) => i.status === 'loading')
    if (loadingItem) {
      const hasJob = Boolean(loadingItem.jobId)
      videoStore.updateItem(sessionId, loadingItem.id, {
        status: hasJob ? 'pending_resume' : 'error',
        needsResume: hasJob,
        errorMessage: hasJob ? '已停止轮询，可手动恢复' : '已取消',
      })
    }
    abortResumeOnly()
    if (gen.isCurrent(sessionId)) {
      gen.abort()
      gen.end(sessionId)
    }
    // 不自动静默重踢 resume；保持手动 resumeItem 或回页 mount/activated
  }

  async function retryItem(item) {
    const session = getSession()
    if (!item || !session) return
    abortResumeOnly()
    if (gen.busy || sessionHasInFlightJob()) return
    if (!ensureProvider()) return

    const sessionId = session.id
    const text = String(item.prompt || '').trim()
    const itemMode = item.mode || 'txt2video'
    const p = item.params || {}

    applyItemParams(item)
    mode.value = itemMode
    prompt.value = text

    if (itemMode === 'img2video') {
      const cachedFile = refFileBySession.value[sessionId]?.[item.id]
      if (cachedFile) {
        imageFile.value = cachedFile
        try {
          previewUrl.value = await fileToPreview(cachedFile)
        } catch {
          previewUrl.value = refThumbMap.value[item.id] || item.refPreview || ''
        }
      } else {
        message.warning('图生视频需重新上传参考图后再生成')
        return
      }
    }

    if (itemMode === 'txt2video' && !text) {
      message.warning('缺少提示词，无法重试')
      return
    }

    await executeJob({
      sessionId,
      runOptions: {
        prompt: text,
        mode: itemMode,
        imageFile: itemMode === 'img2video' ? imageFile.value : undefined,
        seconds: p.seconds ?? p.duration ?? seconds.value,
        duration: p.seconds ?? p.duration ?? seconds.value,
        size: p.size || size.value,
        aspectRatio: p.aspectRatio || aspectRatio.value,
        resolution: p.resolution || (showResolution.value ? resolution.value : undefined),
      },
      afterItem: (newItemId) => {
        if (itemMode === 'img2video' && newItemId && imageFile.value) {
          rememberRefFile(sessionId, newItemId, imageFile.value)
          if (previewUrl.value) setRefThumb(sessionId, newItemId, previewUrl.value)
        }
      },
      errorFallback: '重试失败',
    })
  }

  return {
    sessionHasInFlightJob,
    generate,
    stopGenerate,
    retryItem,
  }
}
