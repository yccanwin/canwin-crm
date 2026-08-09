import { isRetryableAuthError, safeAuthError } from './auth-errors'
import type { AccessContext, AuthState, SafeAuthError } from './auth-types'

export const initialAuthState: AuthState = {
  status: 'loading',
  context: null,
  error: null,
}

export type AuthMachineEvent =
  | { type: 'LOAD_STARTED' }
  | { type: 'SIGN_IN_STARTED' }
  | { type: 'ACCESS_STARTED' }
  | { type: 'ACCESS_RESOLVED'; context: AccessContext; invitationPending: boolean }
  | { type: 'SESSION_MISSING'; expired: boolean }
  | { type: 'PASSWORD_STARTED' }
  | { type: 'INVITE_ACCEPT_STARTED' }
  | { type: 'SIGN_OUT_STARTED' }
  | { type: 'OPERATION_FAILED'; error: SafeAuthError; resume: 'signed_out' | 'invite_required' }

function resolveAccessState(context: AccessContext, invitationPending: boolean): AuthState {
  if (!context.member) {
    if (invitationPending) return { status: 'invite_required', context, error: null }
    return { status: 'blocked', context, error: safeAuthError('ACCESS_NOT_PROVISIONED') }
  }
  if (context.member.status === 'restricted') {
    return { status: 'blocked', context, error: safeAuthError('MEMBERSHIP_RESTRICTED') }
  }
  if (context.member.status === 'disabled') {
    return { status: 'blocked', context, error: safeAuthError('MEMBERSHIP_INACTIVE') }
  }
  if (!context.primary_department) {
    return { status: 'blocked', context, error: safeAuthError('ACCESS_NOT_PROVISIONED') }
  }
  if (context.primary_department.status === 'inactive') {
    return { status: 'blocked', context, error: safeAuthError('DEPARTMENT_INACTIVE') }
  }
  if (!context.capabilities.can_access_crm.allowed) {
    return {
      status: 'blocked',
      context,
      error: safeAuthError(context.capabilities.can_access_crm.reason_code ?? 'ACCESS_NOT_PROVISIONED'),
    }
  }
  return { status: 'active', context, error: null }
}

export function authMachine(state: AuthState, event: AuthMachineEvent): AuthState {
  switch (event.type) {
    case 'LOAD_STARTED':
      return { status: 'loading', context: null, error: null }
    case 'SIGN_IN_STARTED':
      return { status: 'signing_in', context: null, error: null }
    case 'ACCESS_STARTED':
      return { status: 'resolving_access', context: state.context, error: null }
    case 'ACCESS_RESOLVED':
      return resolveAccessState(event.context, event.invitationPending)
    case 'SESSION_MISSING':
      return {
        status: 'signed_out',
        context: null,
        error: event.expired ? safeAuthError('SESSION_EXPIRED') : null,
      }
    case 'PASSWORD_STARTED':
      return { status: 'setting_password', context: state.context, error: null }
    case 'INVITE_ACCEPT_STARTED':
      return { status: 'accepting_invite', context: state.context, error: null }
    case 'SIGN_OUT_STARTED':
      return { status: 'signing_out', context: null, error: null }
    case 'OPERATION_FAILED':
      return {
        status: isRetryableAuthError(event.error) ? 'retryable_error' : event.resume,
        context: state.context,
        error: event.error,
      }
  }
}
