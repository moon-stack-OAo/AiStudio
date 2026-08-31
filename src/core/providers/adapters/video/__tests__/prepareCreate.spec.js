import {describe, expect, it, vi} from 'vitest'
import {prepareCreate as prepareOpenAi} from '../openai.js'
import {prepareCreate as prepareXai} from '../xai.js'

const deps = {
  compressImageFile: vi.fn(async (file) => file),
  fileToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}

describe('video prepareCreate', () => {
  it('openai img2video allows empty prompt', async () => {
    const file = new Blob(['x'], {type: 'image/jpeg'})
    const prepared = await prepareOpenAi(
      {videoModel: 'sora-2'},
      {mode: 'img2video', prompt: '', imageFile: file, seconds: 8, size: '1280x720'},
      deps,
    )
    expect(prepared.transport).toBe('multipart')
    expect(prepared.path).toBe('/videos')
    expect(prepared.form).toBeTruthy()
  })

  it('openai txt2video still requires prompt', async () => {
    await expect(
      prepareOpenAi({videoModel: 'sora-2'}, {mode: 'txt2video', prompt: '  '}, deps),
    ).rejects.toThrow(/提示词/)
  })

  it('xai passes resolution into body', async () => {
    const prepared = await prepareXai(
      {videoModel: 'grok-imagine-video'},
      {
        mode: 'txt2video',
        prompt: 'a cat',
        duration: 8,
        aspectRatio: '16:9',
        resolution: '720p',
      },
      deps,
    )
    expect(prepared.body.resolution).toBe('720p')
    expect(prepared.body.aspect_ratio).toBe('16:9')
  })
})
