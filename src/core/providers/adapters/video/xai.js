/** xAI：POST /videos/generations + duration；完成后勿拉 /content */
export async function prepareCreate(provider, options, deps) {
  const {
    prompt,
    mode = 'txt2video',
    imageFile,
    seconds,
    duration,
    aspectRatio,
    resolution,
  } = options
  const {compressImageFile, fileToDataUrl} = deps

  const model = String(provider.videoModel || '').trim() || 'grok-imagine-video'
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const body = {
    model,
    prompt: prompt || '',
  }
  const dur = duration ?? seconds
  if (dur != null && dur !== '') body.duration = Number(dur) || dur
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (resolution) body.resolution = resolution

  if (mode === 'img2video' && imageFile) {
    const compressed = await compressImageFile(imageFile)
    const dataUrl = await fileToDataUrl(compressed)
    body.image = {
      url: dataUrl,
      type: 'image_url',
    }
  }

  return {
    transport: 'json',
    path: '/videos/generations',
    body,
    requireJobId: true,
    missingJobIdMessage: '未返回 request_id',
    defaultQueuedIfEmpty: true,
  }
}

export function preparePoll(provider, jobId) {
  const id = String(jobId || '').trim()
  return {
    style: 'status',
    path: `/videos/${encodeURIComponent(id)}`,
    fetchContent: false,
  }
}
