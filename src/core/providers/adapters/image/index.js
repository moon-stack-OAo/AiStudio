import {resolveProfile} from '../../resolveProfile'
import * as agnes from './agnes'
import * as openai from './openai'
import * as xai from './xai'

/**
 * @typedef {object} ImagePrepareResult
 * @property {'json'|'multipart'} transport
 * @property {string} path 相对 Base URL 的路径
 * @property {object} [body] transport=json 时的请求体
 * @property {FormData} [form] transport=multipart 时的表单
 * @property {number} [timeout] 建议超时（ms）
 */

function getAdapter(provider) {
  const id = resolveProfile(provider)
  if (id === 'agnes') return agnes
  if (id === 'xai') return xai
  return openai
}

/**
 * 按 profile 组装文生图请求（不发起网络）。
 * @param {object} provider
 * @param {object} options 含 prompt、n、size、quality、aspectRatio、responseFormat 等
 * @returns {Promise<ImagePrepareResult>}
 */
export async function prepareGenerateImage(provider, options) {
  return getAdapter(provider).prepareGenerate(provider, options)
}

/**
 * 按 profile 组装图生图 / 编辑请求（不发起网络）。
 * @param {object} provider
 * @param {object} options 含 prompt、imageFile、n、size、aspectRatio、responseFormat 等
 * @param {{ compressImageFile: Function, fileToDataUrl?: Function }} deps
 * @returns {Promise<ImagePrepareResult>}
 */
export async function prepareEditImage(provider, options, deps) {
  return getAdapter(provider).prepareEdit(provider, options, deps)
}
