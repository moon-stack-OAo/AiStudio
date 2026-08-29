import {computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useVideoStore} from '@core/stores/video'
import {useSettingsStore} from '@core/stores/settings'
import {fileToPreview, getCapabilities} from '@core/api/client'
import {useVideoGeneration} from '@core/composables/useVideoGeneration'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {useClipboardImage} from '@core/composables/useClipboardImage'
import {videoGeneration} from '@core/runtime/generationRuntime'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'

const SIZE_OPTIONS = [
  {label: '1280×720', value: '1280x720'},
  {label: '720×1280', value: '720x1280'},
  {label: '1792×1024', value: '1792x1024'},
  {label: '1024×1792', value: '1024x1792'},
]

/**
 * 生视频会话状态机（与窗体无关）：参数默认值、能力派生选项、生成 / 停止 / 恢复、
 * 时间线写入、重试、generation runtime。内部复用 `useVideoGeneration.runGenerate`。
 * 下载（端侧相册）、右键菜单、Android sheet / 返回键分层、桌面 generate 子组件等留在各端 View。
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

  const mode = ref('txt2video')
  const prompt = ref('')
  const seconds = ref(8)
  const size = ref('1280x720')
  const aspectRatio = ref('16:9')
  const imageFile = ref(null)
  const previewUrl = ref('')

  const listRef = ref(null)
  const {scheduleScrollToBottom} = useScrollToBottom(listRef)
  const mounted = ref(true)
  const resumeAbortRef = ref(null)

  /** 当前会话内图生视频参考缩略图（不持久化大图） */
  const refThumbMap = ref({})
  /** video 元素加载失败的 itemId */
  const videoErrorIds = ref({})

  const session = computed(() => videoStore.activeSession)
  const provider = computed(() => settings.activeProvider)
  const caps = computed(() => getCapabilities(provider.value))
  const videoCaps = computed(() => caps.value?.video || {})
  /** aspectOnly 仅选比例；其余（含 Agnes tier）UI 仍选 WxH */
  const useAspectOnly = computed(() => videoCaps.value.sizeMode === 'aspectOnly')
  const isGeneratingCurrent = computed(() => gen.isCurrent(session.value?.id))

  const canGenerate = computed(() => {
    if (!prompt.value.trim() || isGeneratingCurrent.value) return false
    if (mode.value === 'img2video' && !imageFile.value) return false
    return true
  })

  const timelineItems = computed(() => {
    const items = session.value?.items || []
    return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  })

  const sizeOptions = SIZE_OPTIONS

  const aspectOptions = computed(() => {
    const list = videoCaps.value.ratios
    if (Array.isArray(list) && list.length) {
      return list.map((v) => ({label: v, value: v}))
    }
    return [
      {label: '16:9', value: '16:9'},
      {label: '9:16', value: '9:16'},
      {label: '1:1', value: '1:1'},
      {label: '4:3', value: '4:3'},
      {label: '3:4', value: '3:4'},
    ]
  })

  const durationOptions = computed(() => {
    const v = videoCaps.value
    if (Array.isArray(v.durationOptions) && v.durationOptions.length) {
      return v.durationOptions.map((sec) => ({label: `${sec} 秒`, value: sec}))
    }
    const min = Number(v.durationMin) || 1
    const max = Number(v.durationMax) || 15
    return Array.from({length: max - min + 1}, (_, i) => {
      const sec = min + i
      return {label: `${sec} 秒`, value: sec}
    })
  })

  const modeLabel = computed(() => (mode.value === 'img2video' ? '图生视频' : '文生视频'))

  const sizeLabel = computed(() => {
    if (useAspectOnly.value) {
      return (
        aspectOptions.value.find((o) => o.value === aspectRatio.value)?.label || aspectRatio.value
      )
    }
    return sizeOptions.find((o) => o.value === size.value)?.label || size.value
  })

  const durationLabel = computed(() => `${seconds.value} 秒`)

  const paramsSummary = computed(() => {
    const parts = [modeLabel.value, durationLabel.value, sizeLabel.value]
    if (mode.value === 'img2video') {
      parts.push(previewUrl.value ? '已选参考图' : '未选参考图')
    }
    return parts.join(' · ')
  })

  const drawerHeight = computed(() => (mode.value === 'img2video' ? '78%' : '62%'))

  const sessionTitle = computed(() => session.value?.title || '生视频')

  const sendTooltip = computed(() =>
    mode.value === 'img2video' && !imageFile.value ? '请先上传参考图' : '生成',
  )

  const emptyDesc = computed(() => {
    if (!provider.value?.videoModel) {
      return '请先在设置中配置视频模型（videoModel），再输入提示词生成'
    }
    return '在下方输入提示词，生成结果将以时间线展示'
  })

  function itemStatus(item) {
    return item?.status || 'success'
  }

  function paramSummary(item) {
    const parts = []
    const p = item?.params || {}
    const sec = p.seconds ?? p.duration
    if (sec != null && sec !== '') parts.push(`${sec} 秒`)
    if (p.size) parts.push(String(p.size).replace('x', '×'))
    if (p.aspectRatio) parts.push(p.aspectRatio)
    return parts.join(' · ')
  }

  function ensureProvider() {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
      message.warning('请先在设置中填写 Base URL 和 API Key')
      return false
    }
    if (!provider.value?.videoModel) {
      message.warning('请先设置视频模型（videoModel）')
      return false
    }
    return true
  }

  async function setReferenceFromFile(file, {notify = true} = {}) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      if (notify) message.warning('请提供图片文件')
      return false
    }
    imageFile.value = file
    previewUrl.value = await fileToPreview(file)
    mode.value = 'img2video'
    if (notify) message.success('已设为参考图，可继续图生视频')
    return true
  }

  async function onUpload({file}) {
    await setReferenceFromFile(file.file, {notify: false})
    return false
  }

  function clearUpload() {
    imageFile.value = null
    previewUrl.value = ''
  }

  const {onPaste} = useClipboardImage((file) => setReferenceFromFile(file), {
    onError: () => message.error('粘贴参考图失败'),
  })

  watch(
    () => session.value?.id,
    () => {
      refThumbMap.value = {}
      videoErrorIds.value = {}
      // 切会话时滚到底；停留在当前页播放时不自动拽底
      scheduleScrollToBottom({force: true})
    },
  )

  watch(
    durationOptions,
    (opts) => {
      if (!opts.some((o) => o.value === seconds.value)) {
        const def = videoCaps.value.durationDefault
        seconds.value = opts.some((o) => o.value === def) ? def : (opts[0]?.value ?? 8)
      }
    },
    {immediate: true},
  )

  watch(
    aspectOptions,
    (opts) => {
      if (!opts.some((o) => o.value === aspectRatio.value)) {
        aspectRatio.value = opts[0]?.value || '16:9'
      }
    },
    {immediate: true},
  )

  function getProviderById(id) {
    if (!id) return null
    return settings.providers.find((p) => p.id === id) || null
  }

  let resumeInFlight = false

  function startResumeIfNeeded() {
    if (resumeInFlight) return
    resumeInFlight = true
    const controller = new AbortController()
    resumeAbortRef.value = controller
    videoStore
      .resumePendingJobs(getProviderById, {signal: controller.signal})
      .catch((e) => {
        if (e?.name === 'AbortError') return
        console.warn('[video] resumePendingJobs', e)
      })
      .finally(() => {
        if (resumeAbortRef.value === controller) {
          resumeInFlight = false
        }
      })
  }

  onMounted(() => {
    window.addEventListener('paste', onPaste)
    scheduleScrollToBottom({force: true})
    startResumeIfNeeded()
  })

  onActivated(() => {
    // 仅切回本页时滚到底
    scheduleScrollToBottom({force: true})
    startResumeIfNeeded()
  })

  onBeforeUnmount(() => {
    mounted.value = false
    window.removeEventListener('paste', onPaste)
  })

  function onComposerFocus() {
    // 视频页不因输入框聚焦自动滚底，避免播放时误跳
  }

  async function generate() {
    const text = prompt.value.trim()
    if (!text) {
      message.warning('请输入提示词')
      return
    }
    if (!session.value || gen.busy) return
    if (!ensureProvider()) return
    if (mode.value === 'img2video' && !imageFile.value) {
      message.warning('图生视频请先上传参考图')
      return
    }

    const sessionId = session.value.id
    gen.abort()
    const controller = new AbortController()
    gen.begin(sessionId, controller)

    const savedPrompt = text
    const savedMode = mode.value
    const savedFile = imageFile.value
    const savedPreview = previewUrl.value

    prompt.value = ''

    const itemsBefore = new Set((session.value?.items || []).map((i) => i.id))

    await nextTick()

    try {
      const result = await runGenerate(provider.value, sessionId, {
        prompt: savedPrompt,
        mode: savedMode,
        imageFile: savedMode === 'img2video' ? savedFile : undefined,
        seconds: seconds.value,
        duration: seconds.value,
        size: useAspectOnly.value ? undefined : size.value,
        aspectRatio: useAspectOnly.value ? aspectRatio.value : undefined,
        signal: controller.signal,
      })

      const newItemId =
        result?.itemId || (session.value?.items || []).find((i) => !itemsBefore.has(i.id))?.id
      if (savedMode === 'img2video' && savedPreview && newItemId) {
        refThumbMap.value = {...refThumbMap.value, [newItemId]: savedPreview}
      }

      if (controller.signal.aborted) return
      if (mounted.value && videoStore.activeId === sessionId) {
        message.success('视频生成成功')
      }
    } catch (err) {
      const newItemId = (session.value?.items || []).find((i) => !itemsBefore.has(i.id))?.id
      if (savedMode === 'img2video' && savedPreview && newItemId) {
        refThumbMap.value = {...refThumbMap.value, [newItemId]: savedPreview}
      }
      if (err?.name === 'AbortError' || err?.message === 'canceled' || controller.signal.aborted) {
        return
      }
      if (mounted.value && videoStore.activeId === sessionId) {
        message.error(err?.message || '生成失败')
      }
    } finally {
      gen.end(sessionId, controller)
    }
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
    videoStore.removeSession(id)
  }

  function stopGenerate() {
    const sessionId = session.value?.id
    if (!sessionId || !gen.isCurrent(sessionId)) return
    const loadingItem = session.value?.items?.find(
      (i) => i.status === 'loading' || i.status === 'pending_resume',
    )
    if (loadingItem) {
      const hasJob = Boolean(loadingItem.jobId)
      videoStore.updateItem(sessionId, loadingItem.id, {
        status: hasJob ? 'pending_resume' : 'error',
        needsResume: hasJob,
        errorMessage: hasJob ? '' : '已取消',
      })
    }
    gen.abort()
    gen.end(sessionId)
  }

  async function copyPrompt(item) {
    const ok = await copyText(item?.id, item?.prompt)
    if (!ok) message.error('复制失败')
  }

  async function copyErrorText(item) {
    const text = String(
      item?.errorMessage || (item?.videoUrl ? '视频链接已失效，请重新生成' : '暂无视频'),
    ).trim()
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
      onPositiveClick: () => videoStore.clearItems(session.value.id),
    })
  }

  function onVideoError(itemId) {
    videoErrorIds.value = {...videoErrorIds.value, [itemId]: true}
  }

  function isVideoBroken(item) {
    return Boolean(videoErrorIds.value[item?.id]) || !item?.videoUrl
  }

  async function retryItem(item) {
    if (!item || gen.busy) return
    if (!ensureProvider()) return
    if (!session.value) return

    const sessionId = session.value.id
    const text = String(item.prompt || '').trim()
    if (!text) {
      message.warning('缺少提示词，无法重试')
      return
    }

    const itemMode = item.mode || 'txt2video'
    if (itemMode === 'img2video') {
      message.warning('图生视频需重新上传参考图后再生成')
      mode.value = 'img2video'
      prompt.value = text
      return
    }

    gen.abort()
    const controller = new AbortController()
    gen.begin(sessionId, controller)

    const p = item.params || {}
    try {
      await runGenerate(provider.value, sessionId, {
        prompt: text,
        mode: 'txt2video',
        seconds: p.seconds ?? p.duration ?? seconds.value,
        duration: p.seconds ?? p.duration ?? seconds.value,
        size: p.size || size.value,
        aspectRatio: p.aspectRatio || aspectRatio.value,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (mounted.value && videoStore.activeId === sessionId) {
        message.success('视频生成成功')
      }
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return
      if (mounted.value && videoStore.activeId === sessionId) {
        message.error(err?.message || '重试失败')
      }
    } finally {
      gen.end(sessionId, controller)
    }
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
    imageFile,
    previewUrl,
    listRef,
    mounted,
    refThumbMap,
    videoErrorIds,
    session,
    provider,
    caps,
    videoCaps,
    useAspectOnly,
    isGeneratingCurrent,
    canGenerate,
    timelineItems,
    sizeOptions,
    aspectOptions,
    durationOptions,
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
    clearUpload,
    generate,
    stopGenerate,
    selectSession,
    createSession,
    removeSession,
    copyPrompt,
    copyErrorText,
    clearItems,
    onVideoError,
    isVideoBroken,
    retryItem,
    onComposerFocus,
    scheduleScrollToBottom,
  }
}
