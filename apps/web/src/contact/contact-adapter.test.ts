import { describe, expect, test, vi } from 'vitest'
import { createContactAdapter, type ContactRpcClient } from './contact-adapter'
import { normalizeContactError } from './contact-errors'

const contactId = '11111111-1111-4111-8111-111111111111'

function rpcFixture(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async (name: string, parameters: Record<string, unknown>) => {
    void name
    void parameters
    return { data, error }
  })
  return { adapter: createContactAdapter({ rpc } as ContactRpcClient), rpc }
}

describe('contact RPC adapter', () => {
  test('sends only contact public id and a trimmed safe reason', async () => {
    const fixture = rpcFixture({
      ok: true,
      data: { contact_access: { allowed: false, reason_code: 'NOT_CLAIMED' } },
    })

    await fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '  合规抽查  ' })

    expect(fixture.rpc).toHaveBeenCalledWith('read_contact_secret', {
      p_contact_public_id: contactId,
      p_reason: '合规抽查',
    })
    const parameters = fixture.rpc.mock.calls[0]?.[1]
    expect(Object.keys(parameters ?? {})).not.toEqual(
      expect.arrayContaining(['role', 'role_id', 'department', 'department_id', 'member', 'member_id']),
    )
  })

  test('returns the safe denied union without manufacturing placeholders', async () => {
    const fixture = rpcFixture({
      ok: true,
      data: { contact_access: { allowed: false, reason_code: 'CONTACT_UNAVAILABLE' } },
    })
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '合规抽查' }),
    ).resolves.toEqual({ allowed: false, reason_code: 'CONTACT_UNAVAILABLE' })
  })

  test.each([
    ['unknown denial', { ok: true, data: { contact_access: { allowed: false, reason_code: 'UNKNOWN' } } }],
    ['denial with a sensitive key', { ok: true, data: { contact_access: { allowed: false, reason_code: 'CONTACT_UNAVAILABLE', full_name: '示例联系人' } } }],
    ['non-JSON-shaped data', '<html>provider error</html>'],
  ])('maps %s to one safe fail-closed error', async (_caseName, data) => {
    const fixture = rpcFixture(data)
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '合规抽查' }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTACT_RESPONSE', request_id: null })
  })

  test('does not call RPC when contact id or reason is unsafe', async () => {
    const fixture = rpcFixture(null)
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: 'not-a-uuid', reason: '合规抽查' }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTACT_ID' })
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '   ' }),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS_REASON' })
    expect(fixture.rpc).not.toHaveBeenCalled()
  })

  test('accepts a 500-character reason and rejects a 501-character reason before RPC', async () => {
    const fixture = rpcFixture({
      ok: true,
      data: { contact_access: { allowed: false, reason_code: 'NOT_CLAIMED' } },
    })
    await fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: 'a'.repeat(500) })
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: 'a'.repeat(501) }),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS_REASON' })
    expect(fixture.rpc).toHaveBeenCalledTimes(1)
  })

  test('counts Unicode code points like PostgreSQL char_length', async () => {
    const fixture = rpcFixture({
      ok: true,
      data: { contact_access: { allowed: false, reason_code: 'NOT_CLAIMED' } },
    })
    await fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '😀'.repeat(500) })
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '😀'.repeat(501) }),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS_REASON' })
    expect(fixture.rpc).toHaveBeenCalledTimes(1)
  })

  test('drops provider details and keeps only a safe mapped error', async () => {
    const fixture = rpcFixture(null, {
      code: 'PGRST301',
      message: 'raw database message containing contact@example.test',
      details: 'private details',
    })
    await expect(
      fixture.adapter.readSensitiveContact({ contact_public_id: contactId, reason: '合规抽查' }),
    ).rejects.toEqual({
      code: 'SESSION_EXPIRED',
      message_key: 'auth.session_expired',
      message: '登录状态已过期。',
      recovery: '重新登录后再查看联系人。',
      request_id: null,
    })
  })

  test('normalizes network failures without returning provider text', () => {
    expect(normalizeContactError(new TypeError('contact@example.test failed'))).toEqual({
      code: 'NETWORK_UNAVAILABLE',
      message_key: 'common.network_unavailable',
      message: '暂时无法连接服务。',
      recovery: '检查网络后重新授权，旧联系方式不会恢复。',
      request_id: null,
    })
  })

  test('contains no browser persistence, service worker, or logging sink', () => {
    const implementation = `${createContactAdapter}${normalizeContactError}`.toLowerCase()
    expect(implementation).not.toMatch(/localstorage|indexeddb|serviceworker|console\./)
  })
})
