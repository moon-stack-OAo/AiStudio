import {describe, expect, it} from 'vitest'
import {buildGenerateUserContent, stripEnhancedPrompt} from '@core/prompts/enhancePrompt'

describe('buildGenerateUserContent', () => {
  it('includes label, tags, mode and reference', () => {
    const text = buildGenerateUserContent({
      label: '人像写真',
      tags: ['人像', '写实'],
      mode: 'txt2img',
      prompt: '示例提示词',
    })
    expect(text).toContain('主题：人像写真')
    expect(text).toContain('标签：人像、写实')
    expect(text).toContain('模式：txt2img')
    expect(text).toContain('风格参考')
    expect(text).toContain('示例提示词')
    expect(text).toContain('请创作一条新的提示词')
  })

  it('works with label only', () => {
    const text = buildGenerateUserContent({label: '航拍风景'})
    expect(text).toContain('主题：航拍风景')
    expect(text).not.toContain('标签：')
    expect(text).not.toContain('风格参考')
  })
})

describe('stripEnhancedPrompt', () => {
  it('strips markdown fence and quotes', () => {
    expect(stripEnhancedPrompt('```\nhello\n```')).toBe('hello')
    expect(stripEnhancedPrompt('"world"')).toBe('world')
  })
})
