import {resolveProfile} from '../../resolveProfile'
import * as agnes from './agnes'
import * as openai from './openai'
import * as xai from './xai'

function getAdapter(provider) {
  const id = resolveProfile(provider)
  if (id === 'agnes') return agnes
  if (id === 'xai') return xai
  return openai
}

export async function prepareGenerateImage(provider, options) {
  return getAdapter(provider).prepareGenerate(provider, options)
}

export async function prepareEditImage(provider, options, deps) {
  return getAdapter(provider).prepareEdit(provider, options, deps)
}
