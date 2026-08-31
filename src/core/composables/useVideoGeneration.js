import {ref} from 'vue'
import {createVideoJob, generateVideo, getVideoJob, toErrorMessage, waitVideoJob,} from '@core/api/client'
import {compressImageFile} from '@core/utils/imageCompress'
import {useVideoStore} from '@core/stores/video'

async function buildRefThumbDataUrl(file) {
  if (!file) return ''
  try {
    const thumb = await compressImageFile(file, {
      maxEdge: 160,
      quality: 0.7,
      skipBelowBytes: 0,
      mimeType: 'image/jpeg',
    })
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('预览失败'))
      reader.readAsDataURL(thumb)
    })
  } catch {
    return ''
  }
}

/**
 * 视频生成流程辅助（busy 状态由 View 侧 videoGeneration runtime 管理）
 */
export function useVideoGeneration() {
  const videoStore = useVideoStore()
  const lastError = ref('')

  async function runGenerate(provider, sessionId, options = {}) {
    const {
      prompt,
      mode = 'txt2video',
      imageFile,
      seconds,
      duration,
      size,
      aspectRatio,
      resolution,
      signal,
      params,
      onTimelineUpdate,
    } = options

    lastError.value = ''
    const notifyTimeline = typeof onTimelineUpdate === 'function' ? onTimelineUpdate : null

    const refPreview = imageFile ? await buildRefThumbDataUrl(imageFile) : ''

    const item = videoStore.addItem(sessionId, {
      prompt: prompt || '',
      mode,
      status: 'loading',
      progress: 0,
      jobId: '',
      videoUrl: '',
      providerId: provider?.id || '',
      model: provider?.videoModel || '',
      params: params || {
        seconds: seconds ?? duration,
        size,
        aspectRatio,
        resolution,
      },
      refPreview,
      errorMessage: '',
    })

    if (!item) {
      throw new Error('会话不存在')
    }
    notifyTimeline?.()

    try {
      const job = await generateVideo(provider, {
        prompt,
        mode,
        imageFile,
        seconds,
        duration,
        size,
        aspectRatio,
        resolution,
        signal,
        onProgress: (j) => {
          const patch = {
            status: 'loading',
            progress: j.progress,
            jobId: j.jobId || item.jobId,
          }
          // 完成瞬间尽早锁住可播放地址（直链 https 或已 materialize 的 blob）
          const earlyPlayable =
            (typeof j?.videoUrl === 'string' && String(j.videoUrl).startsWith('blob:')
              ? j.videoUrl
              : '') ||
            (typeof j?.videoUrl === 'string' &&
            /^https?:\/\//i.test(j.videoUrl) &&
            !/(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(j.videoUrl)
              ? j.videoUrl
              : '') ||
            (typeof j?.remoteVideoUrl === 'string' &&
            /^https?:\/\//i.test(j.remoteVideoUrl) &&
            !/(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(j.remoteVideoUrl)
              ? j.remoteVideoUrl
              : '')
          if (earlyPlayable) {
            patch.videoUrl = earlyPlayable
            if (/^https?:\/\//i.test(earlyPlayable)) patch.remoteVideoUrl = earlyPlayable
            else if (typeof j?.remoteVideoUrl === 'string' && /^https?:\/\//i.test(j.remoteVideoUrl)) {
              patch.remoteVideoUrl = j.remoteVideoUrl
            }
          }
          videoStore.updateItem(sessionId, item.id, patch, {
            persist: Boolean(j.jobId || earlyPlayable),
          })
          notifyTimeline?.()
        },
      })

      if (job.jobId) {
        videoStore.updateItem(sessionId, item.id, {jobId: job.jobId}, {persist: true})
      }

      if (job.status === 'completed' && job.videoUrl) {
        const pickDirectHttps = (...cands) => {
          for (const c of cands) {
            const s = String(c || '').trim()
            if (!/^https?:\/\//i.test(s)) continue
            // 跳过需鉴权的 /content，不能直接给 <video>
            if (/(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(s)) continue
            return s
          }
          return ''
        }
        const playable =
          (String(job.videoUrl || '').startsWith('blob:') ? job.videoUrl : '') ||
          pickDirectHttps(job.videoUrl, job.remoteVideoUrl, job.raw?.video?.url) ||
          job.videoUrl
        const remoteVideoUrl =
          pickDirectHttps(job.remoteVideoUrl, job.videoUrl, job.raw?.video?.url) ||
          item.remoteVideoUrl ||
          ''
        if (!/^https?:\/\//i.test(String(playable)) && !String(playable).startsWith('blob:')) {
          console.warn('[video] completed without playable url', {
            jobId: job.jobId,
            videoUrl: job.videoUrl,
            rawKeys: job.raw && typeof job.raw === 'object' ? Object.keys(job.raw) : [],
            rawVideo: job.raw?.video,
          })
        }
        videoStore.updateItem(sessionId, item.id, {
          status: 'success',
          progress: 100,
          jobId: job.jobId || item.jobId,
          videoUrl: playable,
          remoteVideoUrl,
          needsMaterialize: false,
          errorMessage: '',
        })
        notifyTimeline?.()
      } else if (job.status === 'completed' && !job.videoUrl) {
        const msg = '视频已完成但未返回播放地址'
        console.warn('[video] completed without videoUrl', job.raw)
        videoStore.updateItem(sessionId, item.id, {
          status: 'error',
          jobId: job.jobId || item.jobId,
          errorMessage: msg,
        })
        notifyTimeline?.()
        lastError.value = msg
        throw new Error(msg)
      } else {
        const msg = job.errorMessage || '视频生成失败'
        videoStore.updateItem(sessionId, item.id, {
          status: 'error',
          jobId: job.jobId || item.jobId,
          errorMessage: msg,
        })
        notifyTimeline?.()
        lastError.value = msg
        throw new Error(msg)
      }
      return {itemId: item.id, job}
    } catch (e) {
      const current = videoStore.sessions
        .find((s) => s.id === sessionId)
        ?.items?.find((i) => i.id === item.id)
      if (
        e?.name === 'AbortError' ||
        e?.message === 'canceled' ||
        /cancel+ed|已取消/i.test(String(e?.message || ''))
      ) {
        const hasJob = Boolean(current?.jobId)
        videoStore.updateItem(sessionId, item.id, {
          status: hasJob ? 'pending_resume' : 'error',
          needsResume: hasJob,
          // 保留 stopGenerate 等已写入的说明，避免覆盖成空串
          errorMessage: hasJob
            ? current?.errorMessage || '已停止轮询，可手动恢复'
            : '已取消',
        })
        notifyTimeline?.()
        const abortErr = new Error('已取消')
        abortErr.name = 'AbortError'
        throw abortErr
      }
      const isTimeout = e?.name === 'TimeoutError' || e?.code === 'VIDEO_JOB_TIMEOUT'
      const msg = isTimeout
        ? e?.message || '视频生成超时，可稍后恢复轮询'
        : toErrorMessage(e, '视频生成失败')
      lastError.value = msg
      if (current?.status === 'loading' || current?.status === 'pending_resume') {
        const hasJob = Boolean(current?.jobId)
        if (isTimeout && hasJob) {
          videoStore.updateItem(sessionId, item.id, {
            status: 'pending_resume',
            needsResume: true,
            errorMessage: msg,
          })
        } else {
          videoStore.updateItem(sessionId, item.id, {
            status: 'error',
            errorMessage: msg,
            needsResume: false,
          })
        }
        notifyTimeline?.()
      }
      throw e
    }
  }

  return {
    lastError,
    runGenerate,
    createVideoJob,
    getVideoJob,
    waitVideoJob,
    generateVideo,
  }
}
