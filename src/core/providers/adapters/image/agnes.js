import {IMAGE_TIMEOUT_MS} from '@core/utils/constants'
import {
  buildAgnesImageSizeFields,
  getAgnesCapabilities,
} from '../../profiles/agnes'

/** Agnes 文生图：/images/generations；禁顶层 n/response_format */
export async function prepareGenerate(provider, options) {
  const {
    prompt,
    size = '1024x1024',
    aspectRatio,
    responseFormat,
  } = options

  const caps = getAgnesCapabilities(provider).image
  const format = responseFormat || caps.preferResponseFormat || 'url'
  const body = {
    model: provider.imageModel,
    prompt,
    ...buildAgnesImageSizeFields(provider, size, aspectRatio),
  }
  if (format === 'b64_json') body.return_base64 = true
  else body.extra_body = {response_format: 'url'}

  return {
    transport: 'json',
    path: '/images/generations',
    body,
    timeout: caps.timeoutMs || IMAGE_TIMEOUT_MS,
  }
}

/** Agnes 图生图：仍走 /images/generations + extra_body.image */
export async function prepareEdit(provider, options, deps) {
  const {
    prompt,
    imageFile,
    size = '1024x1024',
    aspectRatio,
    responseFormat,
  } = options
  const {compressImageFile, fileToDataUrl} = deps

  const format = responseFormat || 'url'
  const compressed = await compressImageFile(imageFile)
  const dataUrl = await fileToDataUrl(compressed)

  const body = {
    model: provider.imageModel,
    prompt,
    ...buildAgnesImageSizeFields(provider, size, aspectRatio),
    extra_body: {
      image: [dataUrl],
      response_format: format === 'b64_json' ? 'b64_json' : 'url',
    },
  }

  return {
    transport: 'json',
    path: '/images/generations',
    body,
    timeout: IMAGE_TIMEOUT_MS,
  }
}
