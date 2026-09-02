import {describe, expect, it} from 'vitest'
import {toErrorMessage} from '../errors.js'

describe('toErrorMessage', () => {
  it('含 Bearer sk- 的文案整段回退，不泄露密钥', () => {
    const msg = toErrorMessage('Unauthorized Bearer sk-abc123XYZ_secret')
    expect(msg).not.toMatch(/sk-abc123|XYZ_secret/)
    expect(msg).toBe('未知错误')
  })

  it('脱敏 api_key 字段', () => {
    const msg = toErrorMessage('invalid api_key=sk-live-secret-value')
    expect(msg).toMatch(/api_key["']?\s*[:=]\s*\*\*\*/i)
    expect(msg).not.toContain('sk-live-secret-value')
  })

  it('整包含 headers/config 时不泄露', () => {
    const msg = toErrorMessage(
      JSON.stringify({
        config: {headers: {Authorization: 'Bearer sk-secret'}},
        headers: {Authorization: 'Bearer sk-secret'},
      }),
    )
    expect(msg).not.toContain('sk-secret')
    expect(msg).not.toContain('Bearer sk-')
  })

  it('HTTP 401 映射为鉴权失败', () => {
    expect(toErrorMessage({status: 401, response: {status: 401}})).toMatch(/鉴权失败/)
  })

  it('response 含 Bearer sk- 时不泄露密钥', () => {
    const msg = toErrorMessage({
      response: {
        status: 400,
        data: {error: {message: 'bad key Bearer sk-should-hide'}},
      },
    })
    expect(msg).not.toContain('sk-should-hide')
    expect(msg).not.toMatch(/Bearer\s+sk-/i)
  })

  it('普通 Bearer token 脱敏为 ***', () => {
    const msg = toErrorMessage('token Bearer eyJhbGciOi.abc.def expired')
    expect(msg).toContain('Bearer ***')
    expect(msg).not.toContain('eyJhbGciOi')
  })

  it('空值回退 fallback', () => {
    expect(toErrorMessage(null, '兜底')).toBe('兜底')
    expect(toErrorMessage(undefined)).toBe('未知错误')
  })

  it('无 Bearer 前缀的裸 sk-/xai-/gsk_ Key 也脱敏', () => {
    expect(toErrorMessage('invalid key sk-proj-AbCdEfGhIjKlMnOpQrSt')).not.toContain(
      'sk-proj-AbCdEfGhIjKlMnOpQrSt',
    )
    expect(toErrorMessage('bad xai-AbCdEfGhIjKlMnOpQr123')).not.toContain(
      'xai-AbCdEfGhIjKlMnOpQr123',
    )
    expect(toErrorMessage('denied gsk_AbCdEfGhIjKlMnOpQrStUv')).not.toContain(
      'gsk_AbCdEfGhIjKlMnOpQrStUv',
    )
    expect(toErrorMessage('invalid key sk-proj-AbCdEfGhIjKlMnOpQrSt')).toContain('***')
  })
})
