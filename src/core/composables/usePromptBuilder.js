import {computed, reactive, unref} from 'vue'
import {buildPromptFromSelection, getDimensions} from '@core/prompts/buildPrompt'

function createEmptySelection(groups) {
  const sel = {}
  for (const g of groups) {
    sel[g.id] = g.multiple ? [] : null
  }
  return sel
}

/**
 * 结构化提示词拼装状态。
 * @param {'video'|'image'} domain
 * @param {{ mode?: import('vue').Ref<string>|string }} [options]
 */
export function usePromptBuilder(domain, options = {}) {
  const dimensions = computed(() => getDimensions(domain))
  const selection = reactive(createEmptySelection(getDimensions(domain)))

  const preview = computed(() =>
    buildPromptFromSelection(domain, selection, {
      mode: unref(options.mode) || '',
    }),
  )

  function setOption(groupId, optionId) {
    const group = dimensions.value.find((g) => g.id === groupId)
    if (!group) return

    if (group.multiple) {
      const list = Array.isArray(selection[groupId]) ? [...selection[groupId]] : []
      const idx = list.indexOf(optionId)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(optionId)
      selection[groupId] = list
      return
    }

    selection[groupId] = optionId ?? null
  }

  function toggleOption(groupId, optionId) {
    const group = dimensions.value.find((g) => g.id === groupId)
    if (!group) return

    if (group.multiple) {
      setOption(groupId, optionId)
      return
    }

    selection[groupId] = selection[groupId] === optionId ? null : optionId
  }

  function clear() {
    const empty = createEmptySelection(dimensions.value)
    for (const key of Object.keys(selection)) {
      delete selection[key]
    }
    Object.assign(selection, empty)
  }

  function build(extraText) {
    return buildPromptFromSelection(domain, selection, {
      mode: unref(options.mode) || '',
      extraText,
    })
  }

  return {
    dimensions,
    selection,
    preview,
    setOption,
    toggleOption,
    clear,
    build,
  }
}
