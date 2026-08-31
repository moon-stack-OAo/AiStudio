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
          videoStore.updateItem(
            sessionId,
            item.id,
            {
              status: 'loading',
              progress: j.progress,
              jobId: j.jobId || item.jobId,
            },
            {persist: Boolean(j.jobId)},
          )
          notifyTimeline?.()
        },
      })

      if (job.jobId) {
        videoStore.updateItem(sessionId, item.id, {jobId: job.jobId}, {persist: true})
      }

      if (job.status === 'completed' && job.videoUrl) {
        videoStore.updateItem(sessionId, item.id, {
          status: 'success',
          progress: 100,
          jobId: job.jobId || item.jobId,
          videoUrl: job.videoUrl,
          errorMessage: '',
        })
        notifyTimeline?.()
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
          errorMessage: hasJob ? '' : '已取消',
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
