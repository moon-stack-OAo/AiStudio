/**
 * OpenAI / 兼容：POST /videos；完成无 URL 时拉 /videos/{id}/content
 */

/**
 * @param {object} provider
 * @param {object} options
 * @param {string} [options.prompt]
 * @param {'txt2video'|'img2video'|string} [options.mode='txt2video']
 * @param {File|Blob} [options.imageFile]
 * @param {number|string} [options.seconds]
 * @param {number|string} [options.duration]
 * @param {string} [options.size]
 * @param {{ compressImageFile: (file: File|Blob) => Promise<File|Blob> }} deps
 * @returns {Promise<{ transport: 'json'|'multipart', path: string, body?: object, form?: FormData }>}
 */
export async function prepareCreate(provider, options, deps) {
  const {
    prompt,
    mode = 'txt2video',
    imageFile,
    seconds,
    duration,
    size,
  } = options
  const {compressImageFile} = deps

  const model = String(provider.videoModel || '').trim()
  if (!model) throw new Error('请先设置视频模型')
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const sec = seconds ?? duration

  if (mode === 'img2video' && imageFile) {
    const compressed = await compressImageFile(imageFile)
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt || '')
    if (sec != null && sec !== '') form.append('seconds', String(sec))
    if (size) form.append('size', size)
    form.append('input_reference', compressed)

    return {
      transport: 'multipart',
      path: '/videos',
      form,
    }
  }

  const body = {
    model,
    prompt: prompt || '',
  }
  if (sec != null && sec !== '') body.seconds = String(sec)
  if (size) body.size = size

  return {
    transport: 'json',
    path: '/videos',
    body,
  }
}

/**
 * @param {object} provider
 * @param {string} jobId
 * @returns {{ style: 'status', path: string, fetchContent: true, contentPath: string }}
 */
export function preparePoll(provider, jobId) {
  const id = String(jobId || '').trim()
  return {
    style: 'status',
    path: `/videos/${encodeURIComponent(id)}`,
    fetchContent: true,
    contentPath: `/videos/${encodeURIComponent(id)}/content`,
  }
}
