import type { DerivedPortraitValue, PortraitField } from './portrait-contract'
import { isPortraitPublicId } from './portrait-contract'

export interface PortraitContext {
  auth_user_public_id: string
  member_public_id: string
  primary_department_public_id: string
  store_public_id: string
  context_version: number
}

export interface PortraitCacheEntry {
  key: string
  field_public_id: string
  value: DerivedPortraitValue
}

export type PortraitViewStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error'

export interface PortraitViewState {
  status: PortraitViewStatus
  context: PortraitContext | null
  generation: number
  active_request_id: string | null
  fields: PortraitField[]
  cache_entries: Record<string, PortraitCacheEntry>
  error_code: 'INVALID_PORTRAIT_RESPONSE' | 'PORTRAITS_UNAVAILABLE' | null
}

export const initialPortraitViewState: PortraitViewState = {
  status: 'idle',
  context: null,
  generation: 0,
  active_request_id: null,
  fields: [],
  cache_entries: {},
  error_code: null,
}

export type PortraitViewEvent =
  | { type: 'CONTEXT_SELECTED'; context: PortraitContext }
  | { type: 'DEPARTMENT_SWITCHED'; context: PortraitContext }
  | { type: 'LOAD_REQUESTED'; request_id: string }
  | { type: 'LOAD_SUCCEEDED'; request_id: string; generation: number; fields: PortraitField[] }
  | {
      type: 'LOAD_FAILED'
      request_id: string
      generation: number
      error_code: 'INVALID_PORTRAIT_RESPONSE' | 'PORTRAITS_UNAVAILABLE'
    }
  | { type: 'DERIVED_CACHED'; generation: number; field_public_id: string; value: DerivedPortraitValue }
  | { type: 'AUTH_CHANGED' }
  | { type: 'PERMISSION_REVOKED' }
  | { type: 'APP_RESUMED' }
  | { type: 'NETWORK_OFFLINE' }
  | { type: 'NETWORK_RESTORED' }
  | { type: 'RESET' }

function invalidContext(): never {
  throw new Error('INVALID_PORTRAIT_CONTEXT')
}

export function parsePortraitContext(value: PortraitContext): PortraitContext {
  if (
    !isPortraitPublicId(value.auth_user_public_id) ||
    !isPortraitPublicId(value.member_public_id) ||
    !isPortraitPublicId(value.primary_department_public_id) ||
    !isPortraitPublicId(value.store_public_id) ||
    !Number.isSafeInteger(value.context_version) ||
    value.context_version < 1
  ) {
    return invalidContext()
  }
  return { ...value }
}

export function portraitCacheKey(context: PortraitContext, fieldPublicId: string) {
  const parsed = parsePortraitContext(context)
  if (!isPortraitPublicId(fieldPublicId)) return invalidContext()
  return [
    parsed.auth_user_public_id,
    parsed.member_public_id,
    parsed.primary_department_public_id,
    parsed.store_public_id,
    fieldPublicId,
    String(parsed.context_version),
  ].join(':')
}

function clearTransient(
  state: PortraitViewState,
  status: PortraitViewStatus,
  context: PortraitContext | null,
): PortraitViewState {
  return {
    ...state,
    status,
    context,
    generation: state.generation + 1,
    active_request_id: null,
    fields: [],
    cache_entries: {},
    error_code: null,
  }
}

function sameContext(left: PortraitContext | null, right: PortraitContext) {
  return (
    left?.auth_user_public_id === right.auth_user_public_id &&
    left.member_public_id === right.member_public_id &&
    left.primary_department_public_id === right.primary_department_public_id &&
    left.store_public_id === right.store_public_id &&
    left.context_version === right.context_version
  )
}

export function portraitViewMachine(state: PortraitViewState, event: PortraitViewEvent): PortraitViewState {
  switch (event.type) {
    case 'CONTEXT_SELECTED': {
      const context = parsePortraitContext(event.context)
      if (sameContext(state.context, context)) return state
      return clearTransient(state, 'idle', context)
    }
    case 'DEPARTMENT_SWITCHED': {
      const context = parsePortraitContext(event.context)
      return clearTransient(state, 'idle', context)
    }
    case 'LOAD_REQUESTED':
      if (!state.context || event.request_id.trim().length === 0) return state
      return {
        ...state,
        status: 'loading',
        active_request_id: event.request_id,
        fields: [],
        error_code: null,
      }
    case 'LOAD_SUCCEEDED':
      if (
        state.status !== 'loading' ||
        state.active_request_id !== event.request_id ||
        state.generation !== event.generation
      ) {
        return state
      }
      return {
        ...state,
        status: 'ready',
        active_request_id: null,
        fields: [...event.fields],
        error_code: null,
      }
    case 'LOAD_FAILED':
      if (
        state.status !== 'loading' ||
        state.active_request_id !== event.request_id ||
        state.generation !== event.generation
      ) {
        return state
      }
      return {
        ...state,
        status: 'error',
        active_request_id: null,
        fields: [],
        cache_entries: {},
        error_code: event.error_code,
      }
    case 'DERIVED_CACHED': {
      if (
        state.status !== 'ready' ||
        !state.context ||
        state.generation !== event.generation ||
        event.value.context_version !== state.context.context_version ||
        event.value.store_public_id !== state.context.store_public_id ||
        (event.value.department_public_id !== null &&
          event.value.department_public_id !== state.context.primary_department_public_id) ||
        event.value.field_public_id !== event.field_public_id
      ) {
        return state
      }
      const key = portraitCacheKey(state.context, event.field_public_id)
      return {
        ...state,
        cache_entries: {
          ...state.cache_entries,
          [key]: { key, field_public_id: event.field_public_id, value: event.value },
        },
      }
    }
    case 'NETWORK_OFFLINE':
      return clearTransient(state, 'offline', state.context)
    case 'NETWORK_RESTORED':
    case 'APP_RESUMED':
    case 'PERMISSION_REVOKED':
      return clearTransient(state, 'idle', state.context)
    case 'AUTH_CHANGED':
      return clearTransient(state, 'idle', null)
    case 'RESET':
      return { ...initialPortraitViewState, generation: state.generation + 1 }
  }
}

export function readCachedDerived(
  state: PortraitViewState,
  context: PortraitContext,
  fieldPublicId: string,
): DerivedPortraitValue | null {
  if (!sameContext(state.context, parsePortraitContext(context))) return null
  return state.cache_entries[portraitCacheKey(context, fieldPublicId)]?.value ?? null
}
