import {API_TIMEOUT_MS} from '@core/utils/constants'
import {getCapabilities, supportsImageQuality} from '../../capabilities'

/**
 * OpenAI / 兼容：文生图 JSON POST /images/generations
 * @param {object} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {number} [options.n=1]
 * @param {string} [options.size='1024x1024']
 * @param {string} [options.quality]
 * @param {string} [options.responseFormat]
 * @returns {Promise<{ transport: 'json', path: string, body: object, timeout: number }>}
 */
export async function prepareGenerate(provider, options) {
  const {
    prompt,
    n = 1,
    size = '1024x1024',
    quality,
    responseFormat,
  } = options

  const caps = getCapabilities(provider).image
  const format = responseFormat || caps.preferResponseFormat || 'b64_json'
  const body = {
    model: provider.imageModel,
    prompt,
    n,
    response_format: format,
  }
  if (size) body.size = size
  if (quality && supportsImageQuality(provider)) body.quality = quality

  return {
    transport: 'json',
    path: '/images/generations',
    body,
    timeout: caps.timeoutMs || API_TIMEOUT_MS,
  }
}

/**
 * OpenAI / 兼容：图生图 multipart POST /images/edits
 * @param {object} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {File|Blob} options.imageFile
 * @param {number} [options.n=1]
 * @param {string} [options.size='1024x1024']
 * @param {string} [options.responseFormat]
 * @param {{ compressImageFile: (file: File|Blob) => Promise<File|Blob> }} deps
 * @returns {Promise<{ transport: 'multipart', path: string, form: FormData, timeout: number }>}
 */
export async function prepareEdit(provider, options, deps) {
  const {
    prompt,
    imageFile,
    n = 1,
    size = '1024x1024',
    responseFormat,
  } = options
  const {compressImageFile} = deps

  const format = responseFormat || 'b64_json'
  const compressed = await compressImageFile(imageFile)

  const form = new FormData()
  form.append('model', provider.imageModel)
  form.append('prompt', prompt)
  form.append('n', String(n))
  form.append('size', size)
  form.append('response_format', format)
  form.append('image', compressed)

  return {
    transport: 'multipart',
    path: '/images/edits',
    form,
    timeout: API_TIMEOUT_MS,
  }
}
