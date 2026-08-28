import {nextTick, ref} from 'vue'

/** 桌面端 manual 定位下拉（右键菜单等） */
export function useManualDropdown() {
  const show = ref(false)
  const x = ref(0)
  const y = ref(0)
  const options = ref([])
  let selectHandler = null

  function open(e, menuOptions, onSelect) {
    if (!menuOptions?.length) return false
    e.preventDefault()
    e.stopPropagation()
    show.value = false
    nextTick(() => {
      options.value = menuOptions
      selectHandler = onSelect
      x.value = e.clientX
      y.value = e.clientY
      show.value = true
    })
    return true
  }

  function handleSelect(key) {
    const fn = selectHandler
    selectHandler = null
    show.value = false
    fn?.(key)
  }

  function handleUpdateShow(v) {
    show.value = v
    if (!v) selectHandler = null
  }

  function handleClickOutside() {
    show.value = false
    selectHandler = null
  }

  return {
    show,
    x,
    y,
    options,
    open,
    handleSelect,
    handleUpdateShow,
    handleClickOutside,
  }
}
