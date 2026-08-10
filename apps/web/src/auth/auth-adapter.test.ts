import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import { accessContext } from '../test/auth-fixtures'
import { createSupabaseAuthAdapterFromClient } from './auth-adapter'

function clientFixture() {
  const context = accessContext({ canInvite: true, canInviteSales: true })
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => {
    if (name === 'get_my_auth_context') return { data: { ok: true, data: context }, error: null }
    return { data: { ok: true, data: {} }, error: null }
  })
  const invoke = vi.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({ data: { ok: true, data: {} }, error: null }),
  )
  const signOut = vi.fn(async () => ({ error: null }))
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: context.auth_user_id, email: 'member@example.com' } }, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc,
    functions: { invoke },
  } as unknown as SupabaseClient

  return { adapter: createSupabaseAuthAdapterFromClient(client), context, invoke, rpc, signOut }
}

describe('Supabase auth adapter contract', () => {
  const requestId = '11111111-1111-4111-8111-111111111111'
  const correlationId = '22222222-2222-4222-8222-222222222222'

  test('unwraps get_my_auth_context envelope data', async () => {
    const fixture = clientFixture()
    await expect(fixture.adapter.getAccessContext()).resolves.toEqual(fixture.context)
    expect(fixture.rpc).toHaveBeenCalledWith('get_my_auth_context')
  })

  test('keeps access-context parsing compatible with additive success trace metadata', async () => {
    const fixture = clientFixture()
    fixture.rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        data: fixture.context,
        request_id: requestId,
        correlation_id: correlationId,
      },
      error: null,
    })

    await expect(fixture.adapter.getAccessContext()).resolves.toEqual(fixture.context)
  })

  test('extracts only stable RPC error fields and validated trace identifiers', async () => {
    const fixture = clientFixture()
    fixture.rpc.mockResolvedValueOnce({
      data: {
        ok: false,
        error: {
          code: 'INVITATION_EXPIRED',
          message_key: 'auth.invitation_expired',
          message: 'raw database detail',
          safe_params: { email: 'private@example.test' },
          request_id: requestId,
          correlation_id: correlationId,
        },
      },
      error: null,
    })

    await expect(fixture.adapter.acceptInvitation('44444444-4444-4444-8444-444444444444')).rejects.toEqual({
      code: 'INVITATION_EXPIRED',
      request_id: requestId,
      correlation_id: correlationId,
    })
  })

  test('passes the invitation id to the acceptance RPC', async () => {
    const fixture = clientFixture()
    await fixture.adapter.acceptInvitation('44444444-4444-4444-8444-444444444444')
    expect(fixture.rpc).toHaveBeenCalledWith('accept_my_invitation', {
      p_invitation_id: '44444444-4444-4444-8444-444444444444',
    })
  })

  test('invokes the Edge Function with target role and an idempotency key', async () => {
    const fixture = clientFixture()
    const input = {
      email: 'new@example.com',
      display_name: '新成员',
      target_role: 'sales' as const,
      department_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: '55555555-5555-4555-8555-555555555555',
    }
    await fixture.adapter.inviteMember(input)
    expect(fixture.invoke).toHaveBeenCalledWith('invite-member', { body: input })
  })

  test('extracts a stable business envelope from FunctionsHttpError context', async () => {
    const fixture = clientFixture()
    const input = {
      email: 'new@example.com',
      display_name: '新成员',
      target_role: 'sales' as const,
      department_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: '55555555-5555-4555-8555-555555555555',
    }
    const response = new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'INVITATION_EXPIRED',
          message: 'raw edge detail',
          safe_params: { email: 'private@example.test' },
          request_id: requestId,
          correlation_id: correlationId,
        },
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    )
    fixture.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(response) })

    await expect(fixture.adapter.inviteMember(input)).rejects.toEqual({
      code: 'INVITATION_EXPIRED',
      request_id: requestId,
      correlation_id: correlationId,
    })
  })

  test('drops invalid trace identifiers without exposing other envelope fields', async () => {
    const fixture = clientFixture()
    fixture.rpc.mockResolvedValueOnce({
      data: {
        ok: false,
        error: {
          code: 'INVITATION_EXPIRED',
          message: 'raw database detail',
          safe_params: { token: 'private-token' },
          request_id: `${requestId}\n`,
          correlation_id: 'a'.repeat(200),
        },
      },
      error: null,
    })

    await expect(fixture.adapter.acceptInvitation('44444444-4444-4444-8444-444444444444')).rejects.toEqual({
      code: 'INVITATION_EXPIRED',
      request_id: null,
    })
  })

  test('degrades non-JSON FunctionsHttpError bodies without leaking response text', async () => {
    const fixture = clientFixture()
    const input = {
      email: 'new@example.com',
      display_name: '新成员',
      target_role: 'sales' as const,
      department_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: '55555555-5555-4555-8555-555555555555',
    }
    const response = new Response('raw non-json edge failure', { status: 500 })
    fixture.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(response) })

    await expect(fixture.adapter.inviteMember(input)).rejects.toEqual({ code: 'UNEXPECTED', request_id: null })
  })

  test('uses local scope for user initiated sign out', async () => {
    const fixture = clientFixture()
    await fixture.adapter.signOutLocal()
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
