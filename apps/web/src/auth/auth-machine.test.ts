import { describe, expect, test } from 'vitest'
import { accessContext } from '../test/auth-fixtures'
import { authMachine, initialAuthState } from './auth-machine'

describe('auth state machine', () => {
  test('allows only an active member and department with server capability', () => {
    const state = authMachine(initialAuthState, {
      type: 'ACCESS_RESOLVED',
      context: accessContext(),
      invitationPending: false,
    })
    expect(state.status).toBe('active')
  })

  test.each([
    ['restricted', 'MEMBERSHIP_RESTRICTED'],
    ['disabled', 'MEMBERSHIP_INACTIVE'],
  ] as const)('blocks the real database member status %s', (memberStatus, code) => {
    const state = authMachine(initialAuthState, {
      type: 'ACCESS_RESOLVED',
      context: accessContext({ memberStatus }),
      invitationPending: false,
    })
    expect(state.status).toBe('blocked')
    expect(state.error?.code).toBe(code)
  })

  test('presents invitation acceptance only when a validated invitation is in the URL', () => {
    const context = { ...accessContext(), member: null }
    expect(
      authMachine(initialAuthState, { type: 'ACCESS_RESOLVED', context, invitationPending: true }).status,
    ).toBe('invite_required')
    expect(
      authMachine(initialAuthState, { type: 'ACCESS_RESOLVED', context, invitationPending: false }).status,
    ).toBe('blocked')
  })
})
