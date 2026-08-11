import type { ContactAccess, ContactAccessGranted, ContactDenialReasonCode, ContactStructure } from './contact-contract'
import type { SafeContactError } from './contact-errors'

export type ContactViewStatus =
  | 'idle'
  | 'structure_loading'
  | 'locked'
  | 'reason_required'
  | 'authorizing'
  | 'granted'
  | 'granted_empty'
  | 'denied'
  | 'offline'
  | 'error'

export interface ContactViewState {
  status: ContactViewStatus
  structure: ContactStructure | null
  sensitive: ContactAccessGranted | null
  active_access_request_id: string | null
  denial_reason_code: ContactDenialReasonCode | null
  error: SafeContactError | null
}

export const initialContactViewState: ContactViewState = {
  status: 'idle',
  structure: null,
  sensitive: null,
  active_access_request_id: null,
  denial_reason_code: null,
  error: null,
}

export type ContactViewEvent =
  | { type: 'STRUCTURE_LOADING' }
  | { type: 'STRUCTURE_LOADED'; structure: ContactStructure }
  | { type: 'REASON_REQUESTED' }
  | { type: 'ACCESS_REQUESTED'; request_id: string }
  | { type: 'ACCESS_RESOLVED'; request_id: string; access: ContactAccess }
  | { type: 'ACCESS_FAILED'; request_id: string; error: SafeContactError }
  | { type: 'AUTH_CHANGED' }
  | { type: 'PERMISSION_REVOKED' }
  | { type: 'APP_RESUMED' }
  | { type: 'NETWORK_OFFLINE' }
  | { type: 'NETWORK_RESTORED' }
  | { type: 'RESET' }

function withoutSensitive(
  state: ContactViewState,
  status: ContactViewStatus,
  error: SafeContactError | null = null,
): ContactViewState {
  return {
    ...state,
    status,
    sensitive: null,
    active_access_request_id: null,
    denial_reason_code: null,
    error,
  }
}

export function contactViewMachine(state: ContactViewState, event: ContactViewEvent): ContactViewState {
  switch (event.type) {
    case 'STRUCTURE_LOADING':
      return { ...withoutSensitive(state, 'structure_loading'), structure: null }
    case 'STRUCTURE_LOADED':
      return { ...withoutSensitive(state, 'locked'), structure: event.structure }
    case 'REASON_REQUESTED':
      return withoutSensitive(state, 'reason_required')
    case 'ACCESS_REQUESTED':
      return {
        ...withoutSensitive(state, 'authorizing'),
        active_access_request_id: event.request_id,
      }
    case 'ACCESS_RESOLVED':
      if (state.status !== 'authorizing' || state.active_access_request_id !== event.request_id) return state
      if (!event.access.allowed) {
        return {
          ...withoutSensitive(state, 'denied'),
          denial_reason_code: event.access.reason_code,
        }
      }
      return {
        ...state,
        status: event.access.channels.length === 0 ? 'granted_empty' : 'granted',
        sensitive: event.access,
        active_access_request_id: null,
        denial_reason_code: null,
        error: null,
      }
    case 'ACCESS_FAILED':
      if (state.status !== 'authorizing' || state.active_access_request_id !== event.request_id) return state
      return withoutSensitive(state, 'error', event.error)
    case 'NETWORK_OFFLINE':
      return withoutSensitive(state, 'offline')
    case 'AUTH_CHANGED':
    case 'PERMISSION_REVOKED':
    case 'APP_RESUMED':
    case 'NETWORK_RESTORED':
      return withoutSensitive(state, state.structure ? 'locked' : 'idle')
    case 'RESET':
      return initialContactViewState
  }
}
