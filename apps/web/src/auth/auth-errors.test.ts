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

  test('does not reuse unknown backend codes', () => {
    expect(safeAuthError('DATABASE_STACK_TRACE').code).toBe('UNEXPECTED')
  })
})
