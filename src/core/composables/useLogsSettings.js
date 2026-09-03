import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useLogsStore} from '@core/stores/logs'
import {formatClockTime, formatDayLabel} from '@core/utils/datetime'
import {LOG_LEVELS} from '@core/utils/logger'

const LEVEL_LABEL = {
  all: '全部',
  debug: 'Debug',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
}

/**
 * 日志设置页共享逻辑（桌面 / Android 模板密度差异由端侧处理）。
 */
export function useLogsSettings() {
  const logs = useLogsStore()
  const message = useMessage()
  const dialog = useDialog()
  const copying = ref(false)
  const listRef = ref(null)
  /** 最新在顶部：仅贴顶时跟随新日志 */
  let stickToTop = true
  let listening = false
  const TOP_THRESHOLD = 48

  function isNearTop(el) {
    return el.scrollTop <= TOP_THRESHOLD
  }

  function onScroll() {
    const el = listRef.value
    if (!el) return
    stickToTop = isNearTop(el)
  }

  function bindScroll() {
    const el = listRef.value
    if (!el || listening) return
    el.addEventListener('scroll', onScroll, {passive: true})
    listening = true
    stickToTop = isNearTop(el)
  }

  function unbindScroll() {
    const el = listRef.value
    if (el && listening) el.removeEventListener('scroll', onScroll)
    listening = false
  }

  function scrollToLatest(force = false) {
    const el = listRef.value
    if (!el) return
    if (!force && !stickToTop) return
    el.scrollTop = 0
    stickToTop = true
  }

  onMounted(() => {
    logs.ensureSubscribed()
    nextTick(() => {
      bindScroll()
      scrollToLatest(true)
    })
  })

  onBeforeUnmount(() => {
    unbindScroll()
  })

  watch(listRef, (el, prev) => {
    if (prev && listening) {
      prev.removeEventListener('scroll', onScroll)
      listening = false
    }
    if (el) {
      bindScroll()
      scrollToLatest(true)
    }
  })

  watch(
    () => logs.filtered.length,
    () => {
      nextTick(() => scrollToLatest(false))
    },
  )

  const levelOptions = [
    {label: LEVEL_LABEL.all, value: 'all'},
    ...LOG_LEVELS.map((level) => ({label: LEVEL_LABEL[level], value: level})),
  ]

  const summaryText = computed(() => {
    const total = logs.count
    const shown = logs.filteredCount
    if (logs.levelFilter === 'all' && !String(logs.query || '').trim()) {
      return `共 ${total} 条`
    }
    return `显示 ${shown} / ${total} 条`
  })

  function formatEntryTime(ts) {
    const day = formatDayLabel(ts)
    const clock = formatClockTime(ts)
    if (!day || !clock) return ''
    return day === '今天' ? clock : `${day} ${clock}`
  }

  function levelTagType(level) {
    if (level === 'error') return 'error'
    if (level === 'warn') return 'warning'
    if (level === 'info') return 'info'
    return 'default'
  }

  async function copyText(text) {
    const value = String(text || '')
    if (!value) {
      message.warning('暂无日志可复制')
      return false
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const ta = document.createElement('textarea')
        ta.value = value
        ta.setAttribute('readonly', 'true')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      return true
    } catch {
      message.error('复制失败')
      return false
    }
  }

  async function onCopyAll() {
    if (copying.value) return
    copying.value = true
    try {
      const ok = await copyText(logs.exportText())
      if (ok) message.success('已复制日志')
    } finally {
      copying.value = false
    }
  }

  async function onCopyEntry(entry) {
    const detail = entry?.detail ? `\n${entry.detail}` : ''
    const ok = await copyText(
      `[${new Date(entry.ts).toISOString()}] [${String(entry.level).toUpperCase()}] [${entry.source}] ${entry.message}${detail}`,
    )
    if (ok) message.success('已复制')
  }

  function onClear() {
    if (!logs.count) {
      message.info('当前没有日志')
      return
    }
    dialog.warning({
      title: '清空运行日志？',
      content: '将删除本机已保存的全部运行日志，此操作不可撤销。',
      positiveText: '确认清空',
      negativeText: '取消',
      onPositiveClick: () => {
        logs.clear()
        message.success('日志已清空')
      },
    })
  }

  return {
    logs,
    listRef,
    copying,
    levelOptions,
    summaryText,
    formatEntryTime,
    levelTagType,
    onCopyAll,
    onCopyEntry,
    onClear,
    scrollToLatest,
  }
}
