import {describe, expect, it} from 'vitest'
import {resolveVideoDownloadSrc, resolveVideoFallbackSrc} from '../useMediaDownload'

describe('resolveVideoDownloadSrc', () => {
  it('prefers videoUrl', () => {
    expect(
      resolveVideoDownloadSrc({
        videoUrl: 'blob:http://local/x',
        remoteVideoUrl: 'https://cdn.example.com/a.mp4',
      }),
    ).toBe('blob:http://local/x')
  })

  it('falls back to https remoteVideoUrl', () => {
    expect(
      resolveVideoDownloadSrc({
        videoUrl: '',
        remoteVideoUrl: 'https://cdn.example.com/a.mp4',
      }),
    ).toBe('https://cdn.example.com/a.mp4')
  })

  it('ignores non-http remote', () => {
    expect(resolveVideoDownloadSrc({videoUrl: '', remoteVideoUrl: 'blob:x'})).toBe('')
  })
})

describe('resolveVideoFallbackSrc', () => {
  it('returns remote when different from primary', () => {
    expect(
      resolveVideoFallbackSrc({
        videoUrl: 'blob:http://local/x',
        remoteVideoUrl: 'https://cdn.example.com/a.mp4',
      }),
    ).toBe('https://cdn.example.com/a.mp4')
  })

  it('returns empty when same as primary', () => {
    expect(
      resolveVideoFallbackSrc({
        videoUrl: 'https://cdn.example.com/a.mp4',
        remoteVideoUrl: 'https://cdn.example.com/a.mp4',
      }),
    ).toBe('')
  })
})
