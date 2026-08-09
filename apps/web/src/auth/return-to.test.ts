import { beforeEach, describe, expect, test } from 'vitest'
import {
  consumeReturnTo,
  DEFAULT_RETURN_TO,
  RETURN_TO_STORAGE_KEY,
  sanitizeReturnTo,
  storeReturnTo,
} from './return-to'

describe('safe return_to handling', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  test.each([
    'https://evil.example/path',
    '//evil.example/path',
    '%2F%2Fevil.example/path',
    '/login',
    '/invite/accept',
    '/?token=secret',
    '/#fragment',
    '/unknown',
    '/\\evil',
  ])('rejects unsafe or unknown target %s', (target) => {
    expect(sanitizeReturnTo(target)).toBe(DEFAULT_RETURN_TO)
  })

  test('stores and consumes only the allowed home route', () => {
    expect(storeReturnTo('/')).toBe('/')
    expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe('/')
    expect(consumeReturnTo()).toBe('/')
    expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBeNull()
  })
})
