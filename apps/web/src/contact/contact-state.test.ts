import { describe, expect, test } from 'vitest'
import type { ContactAccessGranted, ContactStructure } from './contact-contract'
import { safeContactError } from './contact-errors'
import { contactViewMachine, initialContactViewState, type ContactViewState } from './contact-state'

const structure: ContactStructure = {
  public_id: '11111111-1111-4111-8111-111111111111',
  store_id: 42,
  role_label: '门店联系人',
  is_primary: true,
  status: 'active',
  version: 1,
}

const sensitive: ContactAccessGranted = {
  allowed: true,
  full_name: '示例联系人',
  channels: [{ type: 'email', value: 'contact@example.test' }],
}

const accessRequestId = 'contact-access-request-1'

function grantedState(): ContactViewState {
  return {
    status: 'granted',
    structure,
    sensitive,
    active_access_request_id: null,
    denial_reason_code: null,
    error: null,
  }
}

function authorizingState(): ContactViewState {
  return {
    status: 'authorizing',
    structure,
    sensitive: null,
    active_access_request_id: accessRequestId,
    denial_reason_code: null,
    error: null,
  }
}

describe('contact sensitive-memory state machine', () => {
  test('moves from structural lock to authorized content', () => {
    const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })
    const authorizing = contactViewMachine(locked, { type: 'ACCESS_REQUESTED', request_id: accessRequestId })
    const granted = contactViewMachine(authorizing, {
      type: 'ACCESS_RESOLVED',
      request_id: accessRequestId,
      access: sensitive,
    })
    expect([locked.status, authorizing.status, granted.status]).toEqual(['locked', 'authorizing', 'granted'])
    expect(granted.sensitive).toEqual(sensitive)
  })

  test('distinguishes authorized empty channels from denied access', () => {
    const empty = contactViewMachine(authorizingState(), {
      type: 'ACCESS_RESOLVED',
      request_id: accessRequestId,
      access: { allowed: true, full_name: '示例联系人', channels: [] },
    })
    const denied = contactViewMachine(authorizingState(), {
      type: 'ACCESS_RESOLVED',
      request_id: accessRequestId,
      access: { allowed: false, reason_code: 'NOT_CLAIMED' },
    })
    expect(empty.status).toBe('granted_empty')
    expect(empty.sensitive?.channels).toEqual([])
    expect(denied).toMatchObject({ status: 'denied', sensitive: null, denial_reason_code: 'NOT_CLAIMED' })
  })

  test.each([
    ['AUTH_CHANGED', 'locked'],
    ['PERMISSION_REVOKED', 'locked'],
    ['APP_RESUMED', 'locked'],
    ['NETWORK_OFFLINE', 'offline'],
    ['NETWORK_RESTORED', 'locked'],
  ] as const)('clears sensitive memory first on %s', (type, expectedStatus) => {
    const next = contactViewMachine(grantedState(), { type })
    expect(next.status).toBe(expectedStatus)
    expect(next.sensitive).toBeNull()
    expect(next.denial_reason_code).toBeNull()
  })

  test('clears sensitive memory before exposing a safe RPC failure', () => {
    const next = contactViewMachine(authorizingState(), {
      type: 'ACCESS_FAILED',
      request_id: accessRequestId,
      error: safeContactError('INVALID_CONTACT_RESPONSE'),
    })
    expect(next).toMatchObject({
      status: 'error',
      sensitive: null,
      denial_reason_code: null,
      error: { code: 'INVALID_CONTACT_RESPONSE' },
    })
  })

  test('switching contacts clears the prior structure and secrets together', () => {
    expect(contactViewMachine(grantedState(), { type: 'STRUCTURE_LOADING' })).toEqual({
      status: 'structure_loading',
      structure: null,
      sensitive: null,
      active_access_request_id: null,
      denial_reason_code: null,
      error: null,
    })
  })

  test.each(['AUTH_CHANGED', 'PERMISSION_REVOKED', 'NETWORK_OFFLINE'] as const)(
    'ignores a stale successful response after %s invalidates the request',
    (invalidatingEvent) => {
      const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })
      const authorizing = contactViewMachine(locked, {
        type: 'ACCESS_REQUESTED',
        request_id: accessRequestId,
      })
      const invalidated = contactViewMachine(authorizing, { type: invalidatingEvent })
      const stale = contactViewMachine(invalidated, {
        type: 'ACCESS_RESOLVED',
        request_id: accessRequestId,
        access: sensitive,
      })

      expect(stale).toEqual(invalidated)
      expect(stale.sensitive).toBeNull()
      expect(stale.active_access_request_id).toBeNull()
    },
  )

  test.each(['AUTH_CHANGED', 'PERMISSION_REVOKED', 'NETWORK_OFFLINE'] as const)(
    'ignores a stale failed response after %s invalidates the request',
    (invalidatingEvent) => {
      const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })
      const authorizing = contactViewMachine(locked, {
        type: 'ACCESS_REQUESTED',
        request_id: accessRequestId,
      })
      const invalidated = contactViewMachine(authorizing, { type: invalidatingEvent })
      const stale = contactViewMachine(invalidated, {
        type: 'ACCESS_FAILED',
        request_id: accessRequestId,
        error: safeContactError('INVALID_CONTACT_RESPONSE'),
      })

      expect(stale).toEqual(invalidated)
      expect(stale.error).toBeNull()
      expect(stale.active_access_request_id).toBeNull()
    },
  )

  test('ignores a response from a superseded access request', () => {
    const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })
    const first = contactViewMachine(locked, { type: 'ACCESS_REQUESTED', request_id: 'first' })
    const second = contactViewMachine(first, { type: 'ACCESS_REQUESTED', request_id: 'second' })
    const stale = contactViewMachine(second, {
      type: 'ACCESS_RESOLVED',
      request_id: 'first',
      access: sensitive,
    })

    expect(stale).toEqual(second)
    expect(stale.sensitive).toBeNull()

    const staleFailure = contactViewMachine(second, {
      type: 'ACCESS_FAILED',
      request_id: 'first',
      error: safeContactError('INVALID_CONTACT_RESPONSE'),
    })
    expect(staleFailure).toEqual(second)
    expect(staleFailure.error).toBeNull()
  })
})
