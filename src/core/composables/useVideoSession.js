import {computed, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useVideoStore} from '@core/stores/video'
import {useSettingsStore} from '@core/stores/settings'
import {useVideoGeneration} from '@core/composables/useVideoGeneration'
import {useVideoResume} from '@core/composables/useVideoResume'
import {useVideoJobRunner} from '@core/composables/useVideoJobRunner'
import {useVideoComposerParams} from '@core/composables/useVideoComposerParams'
import {useVideoPlayback} from '@core/composables/useVideoPlayback'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {videoGeneration} from '@core/runtime/generationRuntime'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'

/**
 * 生视频会话门面（与窗体无关）：组装 resume / job runner / composer / playback。
 * 对外 API 形状保持稳定，供两端 VideoView 解构。
 *
 * @param {{
 *   notifyCreateSession?: boolean,
 * }} [options]
 */
export function useVideoSession(options = {}) {
  const {notifyCreateSession = false} = options

  const videoStore = useVideoStore()
  const settings = useSettingsStore()
  const message = useMessage()
  const dialog = useDialog()
  const {copiedId, copyText} = useCopyFeedback()
  const {runGenerate} = useVideoGeneration()
  const gen = useGenerationRuntime(videoGeneration)

  const listRef = ref(null)
  const bottomRef = ref(null)
  const {scheduleScrollToBottom} = useScrollToBottom(listRef, {bottomRef})
  const mounted = ref(true)

  const session = computed(() => videoStore.activeSession)

  function getProviderById(id) {
    if (!id) return null
    return settings.providers.find((p) => p.id === id) || null
  }

  const {
    mode,
    prompt,
    seconds,
    size,
    aspectRatio,
    resolution,
    imageFile,
    previewUrl,
    refFileBySession,
    refThumbMap,
    provider,
    caps,
    videoCaps,
    useAspectOnly,
    useSizeTier,
    showSize,
    showAspectRatio,
    showResolution,
    sizeOptions,
    aspectOptions,
    durationOptions,
    resolutionOptions,
    modeLabel,
    sizeLabel,
    durationLabel,
    paramsSummary,
    drawerHeight,
    sendTooltip,
    emptyDesc,
    paramSummary,
    ensureProvider,
    rememberRefFile,
    setRefThumb,
    clearSessionRefCache,
    clearItemRefCache,
    applyItemParams,
    setReferenceFromFile,
    onUpload,
    clearUpload,
    onPaste,
  } = useVideoComposerParams({
    settings,
    message,
    getSessionId: () => session.value?.id,
  })

  const {
    videoErrorIds,
    remoteVideoByItemId,
    lightboxShow,
    lightboxSrc,
    lightboxTitle,
    resolveRemoteVideoUrl,
    rememberRemoteVideoUrl,
    videoPlaybackErrorText,
    onVideoError,
    isVideoBroken,
    canReloadVideo,
    reloadVideo,
    clearItemPlaybackCache,
    openRefLightbox,
    closeLightbox,
  } = useVideoPlayback({
    videoStore,
    message,
    getSession: () => session.value,
    getProviderById,
  })

  const {isResuming, abortResumeOnly, startResumeIfNeeded, resumeItem, abandonPendingItem} =
    useVideoResume({
      videoStore,
      gen,
      message,
      getProviderById,
      getSessionId: () => session.value?.id,
    })

  const timelineItems = computed(() => {
    const items = session.value?.items || []
    return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  })

  const sessionTitle = computed(() => session.value?.title || '生视频')

  function itemStatus(item) {
    return item?.status || 'success'
  }

  watch(
    () => session.value?.id,
    () => {
      scheduleScrollToBottom({force: true})
    },
  )

  const {sessionHasInFlightJob, generate, stopGenerate, retryItem} = useVideoJobRunner({
    videoStore,
    gen,
    message,
    runGenerate,
    getSession: () => session.value,
    getProvider: () => provider.value,
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
  })

  const isGeneratingCurrent = computed(() => {
    const sid = session.value?.id
    // pending_resume 仅等待用户操作，不锁死发送区；真正 resume 时 gen.begin / loading 会占 busy
    return gen.isCurrent(sid) || sessionHasInFlightJob(sid)
  })

  const canGenerate = computed(() => {
    if (isGeneratingCurrent.value || gen.busy) return false
    if (mode.value === 'img2video') return Boolean(imageFile.value)
    return Boolean(prompt.value.trim())
  })

  onMounted(() => {
    window.addEventListener('paste', onPaste)
    scheduleScrollToBottom({force: true})
    startResumeIfNeeded()
  })

  onActivated(() => {
    scheduleScrollToBottom({force: true})
    startResumeIfNeeded()
  })

  onBeforeUnmount(() => {
    mounted.value = false
    window.removeEventListener('paste', onPaste)
    abortResumeOnly()
  })

  function onComposerFocus() {
    // 视频页不因输入框聚焦自动滚底，避免播放时误跳
  }

  function selectSession(id) {
    videoStore.setActive(id)
  }

  function createSession() {
    videoStore.createSession()
    if (notifyCreateSession) message.success('已新建会话')
  }

  function removeSession(id) {
    gen.abortIfSession(id)
    clearSessionRefCache(id)
    videoStore.removeSession(id)
  }

  async function copyPrompt(item) {
    const ok = await copyText(item?.id, item?.prompt)
    if (!ok) message.error('复制失败')
  }

  async function copyErrorText(item) {
    const text = videoPlaybackErrorText(item).trim()
    const ok = await copyText(`${item?.id || 'err'}-error`, text)
    if (!ok) message.error('复制失败')
  }

  function clearItems() {
    if (!session.value?.items?.length) return
    dialog.warning({
      title: '清空时间线',
      content: '确定清空当前会话的全部生成记录？',
      positiveText: '清空',
      negativeText: '取消',
      onPositiveClick: () => {
        const sid = session.value?.id
        if (!sid) return
        abortResumeOnly()
        if (gen.isCurrent(sid)) {
          gen.abort()
          gen.end(sid)
        }
        clearSessionRefCache(sid)
        videoStore.clearItems(sid)
      },
    })
  }

  function removeQueueItem(item) {
    if (!item?.id) return
    const sid = session.value?.id
    if (!sid) return
    const status = itemStatus(item)
    const isActiveJob = status === 'loading'
    dialog.warning({
      title: '删除任务',
      content: isActiveJob
        ? '该任务正在生成，删除将中止当前轮询。确定删除？'
        : '确定删除这条视频任务？删除后不可恢复。',
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: () => {
        if (isActiveJob) {
          abortResumeOnly()
          if (gen.isCurrent(sid)) {
            gen.abort()
            gen.end(sid)
          }
        } else if (status === 'pending_resume') {
          abortResumeOnly()
        }
        clearItemRefCache(sid, item.id)
        clearItemPlaybackCache(item.id)
        videoStore.removeItem(sid, item.id)
      },
    })
  }

  return {
    videoStore,
    settings,
    message,
    dialog,
    gen,
    copiedId,
    copyText,
    runGenerate,
    mode,
    prompt,
    seconds,
    size,
    aspectRatio,
    resolution,
    imageFile,
    previewUrl,
    listRef,
    bottomRef,
    mounted,
    refThumbMap,
    videoErrorIds,
    remoteVideoByItemId,
    lightboxShow,
    lightboxSrc,
    lightboxTitle,
    session,
    provider,
    caps,
    videoCaps,
    useAspectOnly,
    useSizeTier,
    showSize,
    showAspectRatio,
    showResolution,
    isGeneratingCurrent,
    isResuming,
    canGenerate,
    timelineItems,
    sizeOptions,
    aspectOptions,
    durationOptions,
    resolutionOptions,
    modeLabel,
    sizeLabel,
    durationLabel,
    paramsSummary,
    drawerHeight,
    sessionTitle,
    sendTooltip,
    emptyDesc,
    itemStatus,
    paramSummary,
    ensureProvider,
    setReferenceFromFile,
    onUpload,
    openRefLightbox,
    closeLightbox,
    clearUpload,
    generate,
    stopGenerate,
    startResumeIfNeeded,
    resumeItem,
    abandonPendingItem,
    selectSession,
    createSession,
    removeSession,
    copyPrompt,
    copyErrorText,
    videoPlaybackErrorText,
    clearItems,
    removeQueueItem,
    onVideoError,
    isVideoBroken,
    canReloadVideo,
    reloadVideo,
    retryItem,
    onComposerFocus,
    scheduleScrollToBottom,
  }
}
