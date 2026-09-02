import {ref, watch} from 'vue'

/**
 * 生视频播放：remote https 记忆、播放失败回退、「重新加载」、参考图 lightbox。
 */
export function useVideoPlayback({videoStore, message, getSession}) {
  /** video 元素加载失败的 itemId */
  const videoErrorIds = ref({})
  /** 内存双保险：itemId → 远程 https，防 persist/patch 丢 remoteVideoUrl */
  const remoteVideoByItemId = ref({})
  /** blob 播放失败后已尝试切回 remote 的 itemId */
  const triedRemoteByItemId = ref({})
  /** https 播放失败后已尝试 materialize 为 blob 的 itemId */
  const triedBlobByItemId = ref({})

  const lightboxShow = ref(false)
  const lightboxSrc = ref('')
  const lightboxTitle = ref('')

  function resolveRemoteVideoUrl(item) {
    if (!item) return ''
    const fromItem =
      (typeof item.remoteVideoUrl === 'string' && /^https?:\/\//i.test(item.remoteVideoUrl)
        ? item.remoteVideoUrl
        : '') ||
      (typeof item.videoUrl === 'string' && /^https?:\/\//i.test(item.videoUrl)
        ? item.videoUrl
        : '') ||
      ''
    const fromMap = item.id ? remoteVideoByItemId.value[item.id] : ''
    const remote = fromItem || fromMap || ''
    return /^https?:\/\//i.test(remote) ? remote : ''
  }

  function rememberRemoteVideoUrl(itemId, remote) {
    if (!itemId || !remote || !/^https?:\/\//i.test(remote)) return
    remoteVideoByItemId.value = {...remoteVideoByItemId.value, [itemId]: remote}
  }

  watch(
    () => getSession()?.id,
    () => {
      videoErrorIds.value = {}
      triedRemoteByItemId.value = {}
      triedBlobByItemId.value = {}
    },
  )

  // 同步 remote https 到内存 Map，防止 store patch 丢字段后无法重新加载
  watch(
    () => getSession()?.items,
    (items) => {
      const next = {...remoteVideoByItemId.value}
      for (const it of items || []) {
        if (!it?.id) continue
        const remote =
          (typeof it.remoteVideoUrl === 'string' && /^https?:\/\//i.test(it.remoteVideoUrl)
            ? it.remoteVideoUrl
            : '') ||
          (typeof it.videoUrl === 'string' && /^https?:\/\//i.test(it.videoUrl)
            ? it.videoUrl
            : '') ||
          next[it.id] ||
          ''
        if (remote) next[it.id] = remote
      }
      remoteVideoByItemId.value = next
    },
    {deep: true, immediate: true},
  )

  function videoPlaybackErrorText(item) {
    if (item?.errorMessage) return String(item.errorMessage)
    if (resolveRemoteVideoUrl(item)) {
      return '视频无法播放，可尝试重新加载'
    }
    if (item?.videoUrl) return '视频无法播放，请重新生成'
    return '暂无视频'
  }

  function clearVideoError(itemId) {
    if (!itemId || !videoErrorIds.value[itemId]) return
    const next = {...videoErrorIds.value}
    delete next[itemId]
    videoErrorIds.value = next
  }

  /**
   * 播放失败：保留/恢复 https，不自动转 blob（WebView2 上 blob 反而不稳）。
   * 有 remote 时标 needsMaterialize，露出「重新加载」。
   */
  function onVideoError(itemId) {
    const session = getSession()
    if (!itemId || !session) {
      videoErrorIds.value = {...videoErrorIds.value, [itemId]: true}
      return
    }
    const sessionId = session.id
    const item = session.items?.find((i) => i.id === itemId)
    const remote = resolveRemoteVideoUrl(item)
    if (remote) rememberRemoteVideoUrl(itemId, remote)

    const currentSrc = String(item?.videoUrl || '')
    // blob 失败：切回 https 再给一次机会
    if (currentSrc.startsWith('blob:') && remote && !triedRemoteByItemId.value[itemId]) {
      triedRemoteByItemId.value = {...triedRemoteByItemId.value, [itemId]: true}
      videoStore.updateItem(sessionId, itemId, {
        videoUrl: remote,
        remoteVideoUrl: remote,
        needsMaterialize: false,
        errorMessage: '',
      })
      clearVideoError(itemId)
      return
    }

    if (remote) {
      videoStore.updateItem(sessionId, itemId, {
        videoUrl: remote,
        remoteVideoUrl: remote,
        needsMaterialize: true,
        errorMessage: '',
      })
    }
    videoErrorIds.value = {...videoErrorIds.value, [itemId]: true}
  }

  function isVideoBroken(item) {
    // needsMaterialize 只影响「重新加载」按钮，不直接藏播放器（避免误伤可播的 https）
    return Boolean(videoErrorIds.value[item?.id]) || !item?.videoUrl
  }

  function canReloadVideo(item) {
    return Boolean(resolveRemoteVideoUrl(item))
  }

  /**
   * 用 appFetch 重新拉取远程视频为强制 mp4 的 blob（Tauri WebView 直连失败时的补救）
   * @param {object} item
   */
  async function reloadVideo(item) {
    const session = getSession()
    if (!item?.id || !session) return
    const sessionId = session.id
    const remote = resolveRemoteVideoUrl(item)
    if (!remote) {
      message.warning('无法重新加载，请重新生成')
      return
    }
    rememberRemoteVideoUrl(item.id, remote)
    // 重新加载优先切回远程 https；若再失败由 onVideoError materialize 回退
    const triedRemote = {...triedRemoteByItemId.value}
    const triedBlob = {...triedBlobByItemId.value}
    delete triedRemote[item.id]
    delete triedBlob[item.id]
    triedRemoteByItemId.value = triedRemote
    triedBlobByItemId.value = triedBlob
    videoStore.updateItem(sessionId, item.id, {
      videoUrl: remote,
      remoteVideoUrl: remote,
      needsMaterialize: false,
      errorMessage: '',
      status: item.status === 'error' ? 'success' : item.status,
    })
    clearVideoError(item.id)
    message.success('视频已重新加载')
  }

  function openRefLightbox(src) {
    if (!src) {
      message.warning('图片不可用')
      return
    }
    lightboxSrc.value = src
    lightboxTitle.value = '参考图'
    lightboxShow.value = true
  }

  function closeLightbox() {
    lightboxShow.value = false
    lightboxSrc.value = ''
    lightboxTitle.value = ''
  }

  return {
    videoErrorIds,
    remoteVideoByItemId,
    triedRemoteByItemId,
    triedBlobByItemId,
    lightboxShow,
    lightboxSrc,
    lightboxTitle,
    resolveRemoteVideoUrl,
    rememberRemoteVideoUrl,
    videoPlaybackErrorText,
    onVideoError,
    clearVideoError,
    isVideoBroken,
    canReloadVideo,
    reloadVideo,
    openRefLightbox,
    closeLightbox,
  }
}
