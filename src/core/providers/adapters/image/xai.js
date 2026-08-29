import {API_TIMEOUT_MS} from '@core/utils/constants'
import {getXaiCapabilities} from '../../profiles/xai'
import {supportsImageQuality} from '../../capabilities'

/** xAI 文生图：aspect_ratio，不传 size */
export async function prepareGenerate(provider, options) {
  const {prompt, n = 1, aspectRatio, quality, responseFormat} = options

  const caps = getXaiCapabilities(provider).image
  const format = responseFormat || caps.preferResponseFormat || 'b64_json'
  const body = {
    model: provider.imageModel,
    prompt,
    n,
    response_format: format,
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (quality && supportsImageQuality(provider)) body.quality = quality

  return {
    transport: 'json',
    path: '/images/generations',
    body,
    timeout: caps.timeoutMs || API_TIMEOUT_MS,
  }
}

/** xAI 图生图：JSON /images/edits */
export async function prepareEdit(provider, options, deps) {
  const {prompt, imageFile, n = 1, aspectRatio, quality, responseFormat} = options
  const {compressImageFile, fileToDataUrl} = deps

  const format = responseFormat || 'b64_json'
  const compressed = await compressImageFile(imageFile)
  const dataUrl = await fileToDataUrl(compressed)

  const body = {
    model: provider.imageModel,
    prompt,
    n,
    response_format: format,
    image: {
      url: dataUrl,
      type: 'image_url',
    },
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (quality && supportsImageQuality(provider)) body.quality = quality

  return {
    transport: 'json',
    path: '/images/edits',
    body,
    timeout: API_TIMEOUT_MS,
  }
}
