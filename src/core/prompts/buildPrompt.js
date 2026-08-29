import {VIDEO_DIMENSIONS} from './videoDimensions'
import {IMAGE_DIMENSIONS} from './imageDimensions'

const JOINER = '，'

function resolveDimensions(domain) {
  if (domain === 'video') return VIDEO_DIMENSIONS
  if (domain === 'image') return IMAGE_DIMENSIONS
  return []
}

/**
 * @param {'video'|'image'} domain
 * @returns {typeof VIDEO_DIMENSIONS}
 */
export function getDimensions(domain) {
  return resolveDimensions(domain)
}

function findOption(group, optionId) {
  if (!group || optionId == null || optionId === '') return null
  return group.options.find((o) => o.id === optionId) || null
}

function collectTexts(groups, selection) {
  const texts = []
  for (const group of groups) {
    const raw = selection?.[group.id]
    if (raw == null || raw === '') continue

    if (group.multiple && Array.isArray(raw)) {
      for (const id of raw) {
        const opt = findOption(group, id)
        if (opt?.text) texts.push(opt.text)
      }
      continue
    }

    const id = Array.isArray(raw) ? raw[0] : raw
    const opt = findOption(group, id)
    if (opt?.text) texts.push(opt.text)
  }
  return texts
}

/**
 * 按维度选中项拼装提示词。
 * @param {'video'|'image'} domain
 * @param {Record<string, string|string[]|null|undefined>} selection
 * @param {{ mode?: string, extraText?: string }} [options]
 * @returns {string}
 */
export function buildPromptFromSelection(domain, selection, options = {}) {
  const {extraText} = options
  const groups = resolveDimensions(domain)
  const parts = collectTexts(groups, selection || {})

  const extra = String(extraText || '').trim()
  if (extra) parts.push(extra)

  if (!parts.length) return ''
  return parts.join(JOINER)
}
