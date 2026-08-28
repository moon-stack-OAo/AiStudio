<script setup>
import {computed} from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'

// 按需注册常用语言，避免引入完整 highlight.js
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)

const props = defineProps({
  content: { type: String, default: '' },
  /** 流式输出时的占位文案 */
  placeholder: { type: String, default: '思考中…' },
})

const md = new MarkdownIt({
  html: false, // 禁用原始 HTML，默认转义，防 XSS
  linkify: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // 高亮失败时回退到转义纯文本
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

// 仅允许安全协议，拦截 javascript: / data: / vbscript: 等
md.validateLink = (url) => {
  const u = String(url || '').trim().toLowerCase()
  if (u.startsWith('javascript:') || u.startsWith('data:') || u.startsWith('vbscript:')) return false
  return /^(https?:|mailto:|#)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)
}

// 外链在新标签打开，并加 rel 防钓鱼
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const targetIdx = token.attrIndex('target')
  if (targetIdx < 0) {
    token.attrPush(['target', '_blank'])
  } else {
    token.attrs[targetIdx][1] = '_blank'
  }
  const relIdx = token.attrIndex('rel')
  if (relIdx < 0) {
    token.attrPush(['rel', 'noopener noreferrer'])
  } else {
    token.attrs[relIdx][1] = 'noopener noreferrer'
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const html = computed(() => {
  const text = props.content
  if (!text) return ''
  return md.render(text)
})
</script>

<template>
  <div v-if="!content" class="md-placeholder">{{ placeholder }}</div>
  <div v-else class="markdown-body" v-html="html" />
</template>

<style lang="scss" scoped>
.md-placeholder {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-3);
}

.markdown-body {
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: var(--text-1);

  :deep(p) {
    margin: 0 0 0.75em;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 1em 0 0.5em;
    font-weight: 650;
    line-height: 1.35;
    color: var(--text-1);

    &:first-child {
      margin-top: 0;
    }
  }

  :deep(h1) {
    font-size: 1.35em;
  }

  :deep(h2) {
    font-size: 1.2em;
  }

  :deep(h3) {
    font-size: 1.1em;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.5em 0 0.75em;
    padding-left: 1.4em;
  }

  :deep(li) {
    margin: 0.25em 0;

    > p {
      margin: 0.25em 0;
    }
  }

  :deep(blockquote) {
    margin: 0.75em 0;
    padding: 0.4em 0.9em;
    border-left: 3px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
    background: var(--primary-soft);
    color: var(--text-2);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;

    p {
      margin: 0.35em 0;
    }
  }

  :deep(a) {
    color: var(--color-primary-hover);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
      color: var(--color-primary);
    }
  }

  :deep(hr) {
    margin: 1em 0;
    border: none;
    border-top: 1px solid var(--border-muted);
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75em 0;
    font-size: 13px;
    overflow-x: auto;
    display: block;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid var(--border-muted);
    padding: 6px 10px;
    text-align: left;
  }

  :deep(th) {
    background: var(--surface-3);
    font-weight: 600;
  }

  :deep(img) {
    max-width: 100%;
    border-radius: var(--radius-sm);
  }

  /* 行内代码 */
  :deep(code) {
    font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Consolas, monospace;
    font-size: 0.9em;
    padding: 0.15em 0.4em;
    border-radius: var(--radius-xs);
    background: var(--code-inline-bg);
    color: var(--code-inline-fg);
  }

  /* 代码块（highlight 输出）：横向滚动限制在代码块内，避免撑出页面底栏滚动条 */
  :deep(pre.hljs),
  :deep(pre) {
    margin: 0.75em 0;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    max-width: 100%;
    overflow-x: auto;
    background: var(--code-bg) !important;
    border: 1px solid var(--border-muted);
    line-height: 1.55;

    code {
      padding: 0;
      background: transparent;
      color: var(--code-fg);
      font-size: 12.5px;
    }
  }

  :deep(.hljs-comment),
  :deep(.hljs-quote) {
    color: var(--hljs-comment);
    font-style: italic;
  }

  :deep(.hljs-keyword),
  :deep(.hljs-selector-tag),
  :deep(.hljs-addition) {
    color: var(--hljs-keyword);
  }

  :deep(.hljs-number),
  :deep(.hljs-string),
  :deep(.hljs-meta .hljs-meta-string),
  :deep(.hljs-literal),
  :deep(.hljs-doctag),
  :deep(.hljs-regexp) {
    color: var(--hljs-string);
  }

  :deep(.hljs-title),
  :deep(.hljs-section),
  :deep(.hljs-name),
  :deep(.hljs-selector-id),
  :deep(.hljs-selector-class) {
    color: var(--hljs-title);
  }

  :deep(.hljs-attribute),
  :deep(.hljs-attr),
  :deep(.hljs-variable),
  :deep(.hljs-template-variable),
  :deep(.hljs-class .hljs-title),
  :deep(.hljs-type) {
    color: var(--hljs-attr);
  }

  :deep(.hljs-symbol),
  :deep(.hljs-bullet),
  :deep(.hljs-link),
  :deep(.hljs-meta),
  :deep(.hljs-selector-attr),
  :deep(.hljs-selector-pseudo),
  :deep(.hljs-built_in),
  :deep(.hljs-builtin-name) {
    color: var(--hljs-built-in);
  }

  :deep(.hljs-deletion) {
    color: var(--hljs-deletion);
  }

  :deep(.hljs-emphasis) {
    font-style: italic;
  }

  :deep(.hljs-strong) {
    font-weight: 700;
  }
}
</style>
