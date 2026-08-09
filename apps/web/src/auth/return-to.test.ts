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
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java%73cript:alert(1)',
    'vbscript:msgbox(1)',
  ])('rejects unsafe or unknown target %s', (target) => {
    expect(sanitizeReturnTo(target)).toBe(DEFAULT_RETURN_TO)
  })

  test.each([
    ['raw null', '/\u0000'],
    ['raw tab', '/\t'],
    ['raw newline', '/\n'],
    ['raw carriage return', '/\r'],
    ['raw delete', `/\u007f`],
    ['encoded null', '/%00'],
    ['encoded tab', '/%09'],
    ['encoded newline', '/%0a'],
    ['encoded carriage return', '/%0D'],
    ['encoded delete', '/%7f'],
  ])('rejects %s control characters', (_label, target) => {
    expect(sanitizeReturnTo(target)).toBe(DEFAULT_RETURN_TO)
  })

  test('stores and consumes only the allowed home route', () => {
    expect(storeReturnTo('/')).toBe('/')
    expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe('/')
    expect(consumeReturnTo()).toBe('/')
    expect(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBeNull()
  })
})
