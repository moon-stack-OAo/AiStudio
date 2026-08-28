import {onBeforeUnmount, watch} from 'vue'

/** @type {{ show: import('vue').Ref<boolean>, pushed: boolean, fromPop: boolean }[]} */
const layers = []
let listening = false
let suppressCount = 0

function beginSuppress() {
  suppressCount += 1
}

function endSuppress() {
  suppressCount = Math.max(0, suppressCount - 1)
}

function suppressUntilPopstate() {
  beginSuppress()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.removeEventListener('popstate', onPop)
    endSuppress()
  }
  const onPop = () => finish()
  window.addEventListener('popstate', onPop)
  setTimeout(finish, 200)
}

function onPopState() {
  if (suppressCount > 0) return
  for (let i = layers.length - 1; i >= 0; i--) {
    const entry = layers[i]
    if (!entry.pushed || !entry.show.value) continue
    entry.fromPop = true
    entry.pushed = false
    layers.splice(i, 1)
    entry.show.value = false
    return
  }
}

function ensureListening() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', onPopState)
}

/**
 * 层打开时 pushState，物理返回先关闭该层，避免直接退出 Activity。
 * @param {import('vue').Ref<boolean>} show
 */
export function useBackCloseLayer(show) {
  const entry = {show, pushed: false, fromPop: false}

  watch(show, (open) => {
    if (open) {
      if (entry.pushed) return
      ensureListening()
      history.pushState({__androidBackLayer: 1}, '')
      entry.pushed = true
      layers.push(entry)
      return
    }
    const idx = layers.indexOf(entry)
    if (idx >= 0) layers.splice(idx, 1)
    if (!entry.pushed) {
      entry.fromPop = false
      return
    }
    entry.pushed = false
    if (entry.fromPop) {
      entry.fromPop = false
      return
    }
    suppressUntilPopstate()
    history.back()
  })

  onBeforeUnmount(() => {
    const idx = layers.indexOf(entry)
    if (idx >= 0) layers.splice(idx, 1)
    if (!entry.pushed) return
    entry.pushed = false
    if (show.value) {
      entry.fromPop = true
      show.value = false
    }
    suppressUntilPopstate()
    history.back()
  })
}

/**
 * 关闭全部已注册层并回退对应 history（切 Tab 前调用）。
 * @returns {Promise<void>}
 */
export function dismissAllBackLayers() {
  const pending = layers.splice(0, layers.length).filter((e) => e.pushed)
  if (!pending.length) return Promise.resolve()

  for (const entry of pending) {
    entry.pushed = false
    entry.fromPop = true
    entry.show.value = false
  }

  return new Promise((resolve) => {
    beginSuppress()
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.removeEventListener('popstate', onSettle)
      endSuppress()
      resolve()
    }
    const onSettle = () => finish()
    window.addEventListener('popstate', onSettle)
    history.go(-pending.length)
    setTimeout(finish, 200)
  })
}
