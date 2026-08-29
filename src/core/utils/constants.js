/** API 请求默认超时（毫秒） */
export const API_TIMEOUT_MS = 180000

/** API 超时允许范围（毫秒） */
export const API_TIMEOUT_MS_MIN = 5000
export const API_TIMEOUT_MS_MAX = 600000

/** 生图超时（毫秒）。Agnes 文档建议 60s–360s */
export const IMAGE_TIMEOUT_MS = 360000

/** Chat Completions 默认温度 */
export const DEFAULT_TEMPERATURE = 0.7

/** 对话 max_tokens：0 表示不限制（请求体不传该字段） */
export const DEFAULT_CHAT_MAX_TOKENS = 0

/** 界面字号档位（相对比例） */
export const UI_FONT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2]

/** 对话上下文：默认保留最近多少轮（1 轮 = 1 次用户提问及其后回复） */
export const DEFAULT_CHAT_CONTEXT_MAX_TURNS = 20

/** 对话上下文：达到该比例时提示用户（相对 maxTurns） */
export const CHAT_CONTEXT_WARN_RATIO = 0.8

/** 对话上下文：可选保留轮数 */
export const CHAT_CONTEXT_MAX_TURNS_OPTIONS = [10, 20, 30, 50, 100]

/** 对话上下文：默认字符预算上限（粗估，非 Token） */
export const DEFAULT_CHAT_CONTEXT_MAX_CHARS = 32000
