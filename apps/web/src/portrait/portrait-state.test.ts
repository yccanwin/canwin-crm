import { describe, expect, test } from 'vitest'
import type { DerivedPortraitValue, PortraitField } from './portrait-contract'
import {
  initialPortraitViewState,
  parsePortraitContext,
  portraitCacheKey,
  portraitViewMachine,
  readCachedDerived,
  type PortraitContext,
  type PortraitViewState,
} from './portrait-state'

const userId = '40000000-0000-4000-8000-000000000001'
const memberId = '45000000-0000-4000-8000-000000000001'
const departmentA = '50000000-0000-4000-8000-000000000001'
const departmentB = '50000000-0000-4000-8000-000000000002'
const fieldId = '60000000-0000-4000-8000-000000000001'
const storeId = '70000000-0000-4000-8000-000000000001'

const contextA: PortraitContext = {
  auth_user_public_id: userId,
  member_public_id: memberId,
  primary_department_public_id: departmentA,
  store_public_id: storeId,
  context_version: 7,
}

const contextB: PortraitContext = {
  ...contextA,
  primary_department_public_id: departmentB,
  context_version: 8,
}

const field = {
  public_id: fieldId,
  value_type: 'boolean',
  field_key: 'documents_complete',
} as PortraitField

function derived(context = contextA): DerivedPortraitValue {
  return {
    schema_version: 1,
    field_public_id: fieldId,
    store_public_id: context.store_public_id,
    department_public_id: context.primary_department_public_id,
    context_version: context.context_version,
    freshness: 'unknown',
    value: null,
    calculation_version: null,
    source_version: null,
    computed_at: null,
    source_changed_at: null,
    reason_code: 'NOT_COMPUTED',
  }
}

function readyState(context = contextA): PortraitViewState {
  const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context })
  const loading = portraitViewMachine(selected, { type: 'LOAD_REQUESTED', request_id: 'request-1' })
  return portraitViewMachine(loading, {
    type: 'LOAD_SUCCEEDED',
    request_id: 'request-1',
    generation: loading.generation,
    fields: [field],
  })
}

describe('portrait context cache key', () => {
  test('contains auth user, department, store, field, and context version', () => {
    expect(portraitCacheKey(contextA, fieldId)).toBe(`${userId}:${memberId}:${departmentA}:${storeId}:${fieldId}:7`)
  })

  test.each([
    { ...contextA, auth_user_public_id: 'not-uuid' },
    { ...contextA, member_public_id: 'not-uuid' },
    { ...contextA, primary_department_public_id: 'not-uuid' },
    { ...contextA, store_public_id: 'not-uuid' },
    { ...contextA, context_version: 0 },
  ])('rejects unsafe context %#', (context) => {
    expect(() => parsePortraitContext(context)).toThrow('INVALID_PORTRAIT_CONTEXT')
  })

  test('uses different keys for different departments', () => {
    expect(portraitCacheKey(contextA, fieldId)).not.toBe(portraitCacheKey(contextB, fieldId))
  })

  test('uses different keys for different context versions', () => {
    expect(portraitCacheKey(contextA, fieldId)).not.toBe(portraitCacheKey({ ...contextA, context_version: 9 }, fieldId))
  })
})

describe('portrait generation and transient cache state', () => {
  test('selecting a context starts a new generation with an empty cache', () => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    expect(selected).toMatchObject({ status: 'idle', generation: 1, context: contextA, cache_entries: {} })
  })

  test('reselecting the exact same context does not churn generation', () => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    expect(portraitViewMachine(selected, { type: 'CONTEXT_SELECTED', context: contextA })).toBe(selected)
  })

  test('loads only the matching request in the current generation', () => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    const loading = portraitViewMachine(selected, { type: 'LOAD_REQUESTED', request_id: 'current' })
    const ready = portraitViewMachine(loading, {
      type: 'LOAD_SUCCEEDED', request_id: 'current', generation: loading.generation, fields: [field],
    })
    expect(ready).toMatchObject({ status: 'ready', fields: [field], active_request_id: null })
  })

  test.each([
    ['wrong-request', 1],
    ['request-1', 0],
  ] as const)('ignores stale load response %s generation %s', (requestId, generationDelta) => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    const loading = portraitViewMachine(selected, { type: 'LOAD_REQUESTED', request_id: 'request-1' })
    const stale = portraitViewMachine(loading, {
      type: 'LOAD_SUCCEEDED',
      request_id: requestId,
      generation: generationDelta === 0 ? loading.generation - 1 : loading.generation,
      fields: [field],
    })
    expect(stale).toBe(loading)
  })

  test('caches a department-derived value only in the exact live generation', () => {
    const ready = readyState()
    const cached = portraitViewMachine(ready, {
      type: 'DERIVED_CACHED', generation: ready.generation, field_public_id: fieldId, value: derived(),
    })
    expect(readCachedDerived(cached, contextA, fieldId)).toEqual(derived())
  })

  test.each([
    ['generation', { generation: 0, value: derived() }],
    ['department', { generation: 1, value: derived(contextB) }],
    ['context-version', { generation: 1, value: { ...derived(), context_version: 99 } }],
    ['store', { generation: 1, value: { ...derived(), store_public_id: '70000000-0000-4000-8000-000000000099' } }],
  ] as const)('does not cache a mismatched %s result', (_label, mismatch) => {
    const ready = readyState()
    const next = portraitViewMachine(ready, {
      type: 'DERIVED_CACHED',
      generation: mismatch.generation === 1 ? ready.generation : mismatch.generation,
      field_public_id: fieldId,
      value: mismatch.value,
    })
    expect(next.cache_entries).toEqual({})
  })

  test('department switch clears fields, cache, request, and increments generation before reload', () => {
    const ready = readyState()
    const cached = portraitViewMachine(ready, {
      type: 'DERIVED_CACHED', generation: ready.generation, field_public_id: fieldId, value: derived(),
    })
    const switched = portraitViewMachine(cached, { type: 'DEPARTMENT_SWITCHED', context: contextB })
    expect(switched).toMatchObject({
      status: 'idle', context: contextB, generation: cached.generation + 1,
      fields: [], cache_entries: {}, active_request_id: null,
    })
    expect(readCachedDerived(switched, contextA, fieldId)).toBeNull()
  })

  test.each([
    ['AUTH_CHANGED', 'idle', null],
    ['PERMISSION_REVOKED', 'idle', contextA],
    ['APP_RESUMED', 'idle', contextA],
    ['NETWORK_OFFLINE', 'offline', contextA],
    ['NETWORK_RESTORED', 'idle', contextA],
  ] as const)('clears all transient data on %s', (type, status, context) => {
    const ready = readyState()
    const cached = portraitViewMachine(ready, {
      type: 'DERIVED_CACHED', generation: ready.generation, field_public_id: fieldId, value: derived(),
    })
    const next = portraitViewMachine(cached, { type })
    expect(next).toMatchObject({ status, context, fields: [], cache_entries: {}, active_request_id: null })
    expect(next.generation).toBe(cached.generation + 1)
  })

  test('ignores a pre-switch response after the department generation changes', () => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    const loading = portraitViewMachine(selected, { type: 'LOAD_REQUESTED', request_id: 'old-request' })
    const switched = portraitViewMachine(loading, { type: 'DEPARTMENT_SWITCHED', context: contextB })
    const stale = portraitViewMachine(switched, {
      type: 'LOAD_SUCCEEDED',
      request_id: 'old-request',
      generation: loading.generation,
      fields: [field],
    })
    expect(stale).toBe(switched)
    expect(stale.fields).toEqual([])
  })

  test('exposes only a stable error code and clears prior cache on current failure', () => {
    const selected = portraitViewMachine(initialPortraitViewState, { type: 'CONTEXT_SELECTED', context: contextA })
    const loading = portraitViewMachine(selected, { type: 'LOAD_REQUESTED', request_id: 'request-1' })
    const failed = portraitViewMachine(loading, {
      type: 'LOAD_FAILED',
      request_id: 'request-1',
      generation: loading.generation,
      error_code: 'PORTRAITS_UNAVAILABLE',
    })
    expect(failed).toMatchObject({ status: 'error', error_code: 'PORTRAITS_UNAVAILABLE', cache_entries: {} })
  })
})
