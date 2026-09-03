/**
 * 运行日志 Pinia store：环形缓冲由 logger 维护，此处做响应式镜像与 UI 操作。
 * 持久化键：app_logs（ai_studio_app_logs）
 */
import {defineStore} from 'pinia'
import {clearLogs, filterLogs, getLogs, logsToText, subscribeLogs} from '@core/utils/logger'

export const useLogsStore = defineStore('logs', {
  state: () => ({
    entries: getLogs(),
    levelFilter: 'all',
    query: '',
    _unsub: null,
  }),
  getters: {
    filtered(state) {
      return filterLogs(state.entries, {
        level: state.levelFilter,
        query: state.query,
      })
        .slice()
        .reverse()
    },
    count(state) {
      return state.entries.length
    },
    filteredCount() {
      return this.filtered.length
    },
  },
  actions: {
    ensureSubscribed() {
      if (this._unsub) return
      this._unsub = subscribeLogs((list) => {
        this.entries = list
      })
    },
    setLevelFilter(level) {
      this.levelFilter = level || 'all'
    },
    setQuery(query) {
      this.query = String(query || '')
    },
    clear() {
      clearLogs()
      this.entries = []
    },
    exportText() {
      return logsToText(
        filterLogs(this.entries, {
          level: this.levelFilter,
          query: this.query,
        }),
      )
    },
  },
})
