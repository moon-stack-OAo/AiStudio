const PREFIX = 'ai_studio_'

export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch (e) {
    console.error('localStorage 写入失败', key, e)
    return false
  }
}

export function removeKey(key) {
  localStorage.removeItem(PREFIX + key)
}

/** 清除本应用写入的全部 localStorage（ai_studio_*） */
export function clearAppStorage() {
  if (typeof localStorage === 'undefined') return 0
  const keys = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
  return keys.length
}
