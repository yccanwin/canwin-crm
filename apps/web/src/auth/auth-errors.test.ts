import { describe, expect, test } from 'vitest'
import { normalizeAuthError, safeAuthError } from './auth-errors'

describe('stable auth errors', () => {
  const requestId = '11111111-1111-4111-8111-111111111111'
  const correlationId = '22222222-2222-4222-8222-222222222222'

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

  test('preserves validated trace identifiers without exposing raw envelope fields', () => {
    const error = normalizeAuthError({
      code: 'FUTURE_SERVER_CODE',
      message: 'raw provider detail',
      safe_params: { email: 'private@example.test' },
      request_id: requestId,
      correlation_id: correlationId,
    })

    expect(error).toMatchObject({
      code: 'UNEXPECTED',
      request_id: requestId,
      correlation_id: correlationId,
    })
    expect(JSON.stringify(error)).not.toContain('raw provider detail')
    expect(JSON.stringify(error)).not.toContain('private@example.test')
  })

  test.each([
    ['invalid', 'not-a-uuid'],
    ['overlong', 'a'.repeat(200)],
    ['control-character', `${requestId}\n`],
  ])('drops %s trace identifiers', (_label, traceId) => {
    const error = normalizeAuthError({
      code: 'INVITATION_EXPIRED',
      request_id: traceId,
      correlation_id: traceId,
    })

    expect(error.request_id).toBeNull()
    expect(error).not.toHaveProperty('correlation_id')
  })
})
