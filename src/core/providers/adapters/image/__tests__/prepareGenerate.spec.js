import {describe, expect, it, vi} from 'vitest'
import {prepareEdit as prepareOpenAiEdit, prepareGenerate as prepareOpenAi} from '../openai.js'
import {prepareEdit as prepareXaiEdit, prepareGenerate as prepareXai} from '../xai.js'

const deps = {
  compressImageFile: vi.fn(async (file) => file),
  fileToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}

describe('image prepareGenerate / prepareEdit path+body snapshot', () => {
  it('openai generations: path + body fields', async () => {
    const prepared = await prepareOpenAi(
      {imageModel: 'gpt-image-1'},
      {prompt: 'a cat', n: 2, size: '1024x1024', quality: 'high'},
    )
    expect(prepared.transport).toBe('json')
    expect(prepared.path).toBe('/images/generations')
    expect(prepared.body).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'a cat',
      n: 2,
      size: '1024x1024',
      response_format: 'b64_json',
    })
  })

  it('xai generations: aspect_ratio, no size', async () => {
    const prepared = await prepareXai(
      {imageModel: 'grok-imagine-image', provider: 'xai', baseUrl: 'https://api.x.ai/v1'},
      {prompt: 'a dog', n: 1, aspectRatio: '16:9'},
    )
    expect(prepared.path).toBe('/images/generations')
    expect(prepared.body.aspect_ratio).toBe('16:9')
    expect(prepared.body.size).toBeUndefined()
  })

  it('openai edits: multipart /images/edits', async () => {
    const file = new Blob(['x'], {type: 'image/png'})
    const prepared = await prepareOpenAiEdit(
      {imageModel: 'gpt-image-1'},
      {prompt: 'edit', imageFile: file, n: 1, size: '1024x1024'},
      deps,
    )
    expect(prepared.transport).toBe('multipart')
    expect(prepared.path).toBe('/images/edits')
    expect(prepared.form).toBeTruthy()
  })

  it('xai edits: json /images/edits with image.url', async () => {
    const file = new Blob(['x'], {type: 'image/jpeg'})
    const prepared = await prepareXaiEdit(
      {imageModel: 'grok-imagine-image', provider: 'xai', baseUrl: 'https://api.x.ai/v1'},
      {prompt: 'edit', imageFile: file, n: 1, aspectRatio: '1:1'},
      deps,
    )
    expect(prepared.transport).toBe('json')
    expect(prepared.path).toBe('/images/edits')
    expect(prepared.body.image).toEqual({
      url: 'data:image/jpeg;base64,abc',
      type: 'image_url',
    })
    expect(prepared.body.aspect_ratio).toBe('1:1')
  })
})
