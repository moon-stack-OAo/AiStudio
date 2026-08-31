import {clampAgnesVideoSeconds, normalizeAgnesVideoSize} from '../../profiles/agnes'

/** Agnes 查询接口在网关根路径 /agnesapi，不在 /v1 下 */
export function resolveAgnesApiHubRoot(resolvedBaseUrl) {
  return String(resolvedBaseUrl || '')
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
}

/** Agnes：POST /videos；Flash 强制 720P；秒数 4–12 */
export async function prepareCreate(provider, options, deps) {
  const {prompt, mode = 'txt2video', imageFile, seconds, duration, size, aspectRatio} = options
  const {compressImageFile, fileToDataUrl} = deps

  const model = String(provider.videoModel || '').trim()
  if (!model) throw new Error('请先设置视频模型')
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const body = {
    model,
    prompt: prompt || '',
    seconds: clampAgnesVideoSeconds(seconds, duration),
    size: normalizeAgnesVideoSize(size, provider),
    n: 1,
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio

  if (mode === 'img2video' && imageFile) {
    const compressOpts = options._aggressiveCompress
      ? {maxEdge: 768, quality: 0.65, skipBelowBytes: 0}
      : {maxEdge: 1024, quality: 0.75, skipBelowBytes: 0}
    const compressed = await compressImageFile(imageFile, compressOpts)
    const dataUrl = await fileToDataUrl(compressed)
    body.mode = 'keyframe'
    body.first_frame = dataUrl
  } else {
    body.mode = 'text'
  }

  return {
    transport: 'json',
    path: '/videos',
    body,
    requireJobId: true,
    missingJobIdMessage: '未返回 video_id',
  }
}

/** 轮询：{root去/v1}/agnesapi?video_id=&model_name= */
export function preparePoll(provider, jobId, deps) {
  const id = String(jobId || '').trim()
  const {resolveBaseUrl} = deps
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const root = resolveAgnesApiHubRoot(resolveBaseUrl(provider.baseUrl, useCorsProxy))
  const model = String(provider.videoModel || '').trim()
  const qs = new URLSearchParams({video_id: id})
  if (model) qs.set('model_name', model)

  return {
    style: 'agnesapi',
    url: `${root}/agnesapi?${qs.toString()}`,
    fetchContent: false,
  }
}
