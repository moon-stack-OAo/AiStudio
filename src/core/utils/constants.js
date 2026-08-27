/** API 请求默认超时（毫秒） */
export const API_TIMEOUT_MS = 180000

/** Chat Completions 默认温度 */
export const DEFAULT_TEMPERATURE = 0.7

/** 对话上下文：默认保留最近多少轮（1 轮 = 1 次用户提问及其后回复） */
export const DEFAULT_CHAT_CONTEXT_MAX_TURNS = 20

/** 对话上下文：达到该比例时提示用户（相对 maxTurns） */
export const CHAT_CONTEXT_WARN_RATIO = 0.8

/** 对话上下文：可选保留轮数 */
export const CHAT_CONTEXT_MAX_TURNS_OPTIONS = [10, 20, 30, 50, 100]
