import { describe, expect, test } from 'vitest'
import { normalizeAuthError, safeAuthError } from './auth-errors'

describe('stable auth errors', () => {
  test('maps provider credential errors without exposing provider text', () => {
    const error = normalizeAuthError({ code: 'invalid_credentials', message: 'provider detail' })
    expect(error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码不正确，请重新输入。',
    })
    expect(JSON.stringify(error)).not.toContain('provider detail')
  })

  test('maps network failures to a retryable safe message', () => {
    expect(normalizeAuthError(new TypeError('fetch failed')).code).toBe('NETWORK_UNAVAILABLE')
  })

  test.each([
    [
      'INVITATION_EXPIRED',
      'INVITATION_EXPIRED',
      '邀请链接已过期。',
      '请联系管理员重新发送邀请。',
    ],
    [
      'invitation_already_used',
      'INVITATION_ALREADY_USED',
      '该邀请已被使用。',
      '请直接登录；如不是本人操作，请联系管理员重新邀请。',
    ],
    [
      'INVITATION_USER_MISMATCH',
      'INVITATION_WRONG_ACCOUNT',
      '当前登录账号与受邀账号不一致。',
      '请退出当前账号，并使用收到邀请的账号重新打开链接。',
    ],
  ] as const)(
    'maps %s to a stable invitation recovery state without exposing provider text',
    (providerCode, code, message, recovery) => {
      const error = normalizeAuthError({
        code: providerCode,
        message: 'raw provider invitation detail',
      })

      expect(error).toMatchObject({ code, message, recovery })
      expect(JSON.stringify(error)).not.toContain('raw provider invitation detail')
    },
  )

  test('does not reuse unknown backend codes', () => {
    expect(safeAuthError('DATABASE_STACK_TRACE').code).toBe('UNEXPECTED')
  })
})
