import {describe, expect, it} from 'vitest'
import {resolveImageAspectRatio, resolveThumbBox, resolveThumbStyle} from '../imageThumb.js'

describe('imageThumb', () => {
  it('parses aspect ratio and WxH size', () => {
    expect(resolveImageAspectRatio('16:9')).toBeCloseTo(16 / 9)
    expect(resolveImageAspectRatio('', '1920x1080')).toBeCloseTo(16 / 9)
    expect(resolveImageAspectRatio('', '1080×1920')).toBeCloseTo(1080 / 1920)
    expect(resolveImageAspectRatio('', '2K')).toBe(1)
  })

  it('caps long edge for landscape and portrait', () => {
    expect(resolveThumbBox(16 / 9, 148)).toEqual({width: 148, height: 83})
    expect(resolveThumbBox(9 / 16, 148)).toEqual({width: 83, height: 148})
    expect(resolveThumbBox(1, 148)).toEqual({width: 148, height: 148})
  })

  it('prefers natural ratio in thumb style', () => {
    const style = resolveThumbStyle({aspectRatio: '1:1', size: '1024x1024'}, 16 / 9, {
      longEdge: 148,
    })
    expect(style.width).toBe('148px')
    expect(style.height).toBe('83px')
  })
})
