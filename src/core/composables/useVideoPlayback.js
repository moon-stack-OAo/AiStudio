import {ref, watch} from 'vue'
import {ensureJobVideoMaterialized, isVideoContentPath, toErrorMessage} from '@core/api/client'

/**
 * 生视频播放：remote https 记忆、播放失败回退、「重新加载」、参考图 lightbox。
 */
export function useVideoPlayback({videoStore, message, getSession, getProviderById}) {
  /** video 元素加载失败的 itemId */
  const videoErrorIds = ref({})
  /** 内存双保险：itemId → 远程 https，防 persist/patch 丢 remoteVideoUrl */
  const remoteVideoByItemId = ref({})
  /** blob 播放失败后已尝试切回 remote 的 itemId */
  const triedRemoteByItemId = ref({})
  /** https 播放失败后已尝试 materialize 为 blob 的 itemId */
  const triedBlobByItemId = ref({})
  /** 正在重新加载的 itemId，避免重复点击 */
  const reloadingIds = ref({})

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

  function clearItemPlaybackCache(itemId) {
    if (!itemId) return
    clearVideoError(itemId)
    if (remoteVideoByItemId.value[itemId]) {
      const next = {...remoteVideoByItemId.value}
      delete next[itemId]
      remoteVideoByItemId.value = next
    }
    if (triedRemoteByItemId.value[itemId]) {
      const next = {...triedRemoteByItemId.value}
      delete next[itemId]
      triedRemoteByItemId.value = next
    }
    if (triedBlobByItemId.value[itemId]) {
      const next = {...triedBlobByItemId.value}
      delete next[itemId]
      triedBlobByItemId.value = next
    }
    if (reloadingIds.value[itemId]) {
      const next = {...reloadingIds.value}
      delete next[itemId]
      reloadingIds.value = next
    }
  }

  /**
   * 播放失败：可直链 https 再试一次；/content 需鉴权，勿塞给 <video>。
   * 有 remote / jobId 时标 needsMaterialize，露出「重新加载」。
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
    const remoteDirect = remote && !isVideoContentPath(remote) ? remote : ''
    // blob 失败：仅当 remote 可直链时再切回 https
    if (currentSrc.startsWith('blob:') && remoteDirect && !triedRemoteByItemId.value[itemId]) {
      triedRemoteByItemId.value = {...triedRemoteByItemId.value, [itemId]: true}
      videoStore.updateItem(sessionId, itemId, {
        videoUrl: remoteDirect,
        remoteVideoUrl: remoteDirect,
        needsMaterialize: false,
        errorMessage: '',
      })
      clearVideoError(itemId)
      return
    }

    if (remote || item?.jobId) {
      const patch = {
        remoteVideoUrl: remote || item?.remoteVideoUrl || '',
        needsMaterialize: true,
        errorMessage: '',
      }
      // /content 不能直接给 <video>，保留当前 src 并标错，等用户重新加载鉴权拉流
      if (remoteDirect) patch.videoUrl = remoteDirect
      videoStore.updateItem(sessionId, itemId, patch)
    }
    videoErrorIds.value = {...videoErrorIds.value, [itemId]: true}
  }

  function isVideoBroken(item) {
    // needsMaterialize 只影响「重新加载」按钮，不直接藏播放器（避免误伤可播的 https）
    return Boolean(videoErrorIds.value[item?.id]) || !item?.videoUrl
  }

  function canReloadVideo(item) {
    if (reloadingIds.value[item?.id]) return false
    return Boolean(resolveRemoteVideoUrl(item) || item?.jobId)
  }

  /**
   * 重新鉴权拉取 / materialize 为强制 mp4 的 blob；直链失败时也会重拉。
   * @param {object} item
   */
  async function reloadVideo(item) {
    const session = getSession()
    if (!item?.id || !session) return
    const sessionId = session.id
    if (reloadingIds.value[item.id]) return

    const remote = resolveRemoteVideoUrl(item)
    const provider = typeof getProviderById === 'function' ? getProviderById(item.providerId) : null
    const canAuthFetch = Boolean(provider?.baseUrl && (item.jobId || isVideoContentPath(remote)))

    const triedRemote = {...triedRemoteByItemId.value}
    const triedBlob = {...triedBlobByItemId.value}
    delete triedRemote[item.id]
    delete triedBlob[item.id]
    triedRemoteByItemId.value = triedRemote
    triedBlobByItemId.value = triedBlob

    if (canAuthFetch) {
      reloadingIds.value = {...reloadingIds.value, [item.id]: true}
      try {
        const src =
          remote || (item.jobId ? `/videos/${encodeURIComponent(item.jobId)}/content` : '')
        if (!src) {
          message.warning('无法重新加载，请重新生成')
          return
        }
        if (remote) rememberRemoteVideoUrl(item.id, remote)
        const out = await ensureJobVideoMaterialized(
          {
            status: 'completed',
            jobId: item.jobId || '',
            videoUrl: src,
            remoteVideoUrl: remote || '',
          },
          undefined,
          provider,
        )
        const playable = String(out.videoUrl || '')
        if (playable.startsWith('blob:') || (playable && !isVideoContentPath(playable))) {
          videoStore.updateItem(sessionId, item.id, {
            videoUrl: playable,
            remoteVideoUrl: out.remoteVideoUrl || remote || item.remoteVideoUrl || '',
            needsMaterialize: false,
            errorMessage: '',
            status: item.status === 'error' ? 'success' : item.status,
          })
          clearVideoError(item.id)
          message.success('视频已重新加载')
          return
        }
        const errText = out.errorMessage || '重新加载失败，请重新生成'
        videoStore.updateItem(sessionId, item.id, {
          needsMaterialize: true,
          errorMessage: errText,
        })
        message.error(errText)
      } catch (e) {
        if (e?.name === 'AbortError') return
        const errText = toErrorMessage(e, '重新加载失败')
        videoStore.updateItem(sessionId, item.id, {
          needsMaterialize: true,
          errorMessage: errText,
        })
        message.error(errText)
      } finally {
        const next = {...reloadingIds.value}
        delete next[item.id]
        reloadingIds.value = next
      }
      return
    }

    if (!remote || isVideoContentPath(remote)) {
      message.warning('无法重新加载，请重新生成')
      return
    }
    rememberRemoteVideoUrl(item.id, remote)
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
    clearItemPlaybackCache,
    isVideoBroken,
    canReloadVideo,
    reloadVideo,
    openRefLightbox,
    closeLightbox,
  }
}
