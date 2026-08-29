import {describe, it, expect} from 'vitest'
import {encryptSecret, decryptSecret} from '@core/utils/secret'

describe('encryptSecret / decryptSecret', () => {
  it('往返加密解密', () => {
    const plain = 'sk-test-api-key-中文'
    const enc = encryptSecret(plain)
    expect(enc).toMatch(/^enc:v1:/)
    expect(enc).not.toBe(plain)
    expect(decryptSecret(enc)).toBe(plain)
  })

  it('空值 / null 返回空串', () => {
    expect(encryptSecret('')).toBe('')
    expect(encryptSecret(null)).toBe('')
    expect(encryptSecret(undefined)).toBe('')
    expect(decryptSecret('')).toBe('')
    expect(decryptSecret(null)).toBe('')
    expect(decryptSecret(undefined)).toBe('')
  })

  it('已是 enc:v1: 前缀的密文再 encrypt 原样返回', () => {
    const enc = encryptSecret('hello')
    expect(encryptSecret(enc)).toBe(enc)
  })

  it('历史明文 decrypt 原样返回', () => {
    expect(decryptSecret('plain-api-key')).toBe('plain-api-key')
  })

  it('损坏密文 decrypt 返回空串', () => {
    expect(decryptSecret('enc:v1:!!!not-valid-base64!!!')).toBe('')
  })
})
