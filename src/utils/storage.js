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
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function removeKey(key) {
  localStorage.removeItem(PREFIX + key)
}
