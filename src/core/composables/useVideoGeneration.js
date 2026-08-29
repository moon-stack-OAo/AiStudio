import {ref} from 'vue'
import {
  createVideoJob,
  fileToPreview,
  generateVideo,
  getVideoJob,
  toErrorMessage,
  waitVideoJob,
} from '@core/api/client'
import {useVideoStore} from '@core/stores/video'

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
    } = options

    lastError.value = ''

    let refPreview = ''
    if (imageFile) {
      try {
        refPreview = await fileToPreview(imageFile)
      } catch {
        refPreview = ''
      }
    }

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
      } else {
        const msg = job.errorMessage || '视频生成失败'
        videoStore.updateItem(sessionId, item.id, {
          status: 'error',
          jobId: job.jobId || item.jobId,
          errorMessage: msg,
        })
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
        const abortErr = new Error('已取消')
        abortErr.name = 'AbortError'
        throw abortErr
      }
      const msg = toErrorMessage(e, '视频生成失败')
      lastError.value = msg
      if (current?.status === 'loading' || current?.status === 'pending_resume') {
        videoStore.updateItem(sessionId, item.id, {
          status: 'error',
          errorMessage: msg,
          needsResume: false,
        })
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
