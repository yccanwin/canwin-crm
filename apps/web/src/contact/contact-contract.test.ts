import { describe, expect, test } from 'vitest'
import { parseContactAccessEnvelope, parseContactStructure } from './contact-contract'

const contactId = '11111111-1111-4111-8111-111111111111'
const storeId = 42

function envelope(contactAccess: Record<string, unknown>) {
  return { ok: true, data: { contact_access: contactAccess } }
}

describe('contact structure whitelist', () => {
  test('accepts only the six frozen structural fields', () => {
    expect(
      parseContactStructure({
        public_id: contactId,
        store_id: storeId,
        role_label: '门店联系人',
        is_primary: true,
        status: 'active',
        version: 1,
      }),
    ).toEqual({
      public_id: contactId,
      store_id: storeId,
      role_label: '门店联系人',
      is_primary: true,
      status: 'active',
      version: 1,
    })
  })

  test.each(['full_name', 'mobile', 'phone', 'email', 'wechat', 'channels']) (
    'rejects the sensitive or derived field %s on a public structure',
    (field) => {
      expect(() =>
        parseContactStructure({
          public_id: contactId,
          store_id: storeId,
          role_label: '门店联系人',
          is_primary: false,
          status: 'active',
          version: 2,
          [field]: 'forbidden@example.test',
        }),
      ).toThrow('INVALID_CONTACT_RESPONSE')
    },
  )

  test('rejects invalid identifiers, unsafe bigint projections, and versions', () => {
    expect(() =>
      parseContactStructure({
        public_id: 'not-a-uuid',
        store_id: Number.MAX_SAFE_INTEGER + 1,
        role_label: '门店联系人',
        is_primary: false,
        status: 'active',
        version: 0,
      }),
    ).toThrow('INVALID_CONTACT_RESPONSE')
  })
})

describe('contact access discriminated union', () => {
  test.each([
    'AUTH_REQUIRED',
    'SESSION_INVALID',
    'MEMBERSHIP_INACTIVE',
    'DEPARTMENT_INACTIVE',
    'CONTACT_UNAVAILABLE',
    'NOT_CLAIMED',
    'REASON_REQUIRED',
    'REASON_INVALID',
  ] as const)('accepts the frozen safe denial reason %s', (reasonCode) => {
    expect(parseContactAccessEnvelope(envelope({ allowed: false, reason_code: reasonCode }))).toEqual({
      allowed: false,
      reason_code: reasonCode,
    })
  })

  test.each(['full_name', 'channels', 'mobile', 'masked_mobile', 'phone_tail']) (
    'fails closed when denied projection contains %s',
    (field) => {
      expect(() =>
        parseContactAccessEnvelope(
          envelope({ allowed: false, reason_code: 'NOT_CLAIMED', [field]: field === 'channels' ? [] : '' }),
        ),
      ).toThrow('INVALID_CONTACT_RESPONSE')
    },
  )

  test('fails closed for an unknown denial reason', () => {
    expect(() =>
      parseContactAccessEnvelope(envelope({ allowed: false, reason_code: 'NEW_SERVER_REASON' })),
    ).toThrow('INVALID_CONTACT_RESPONSE')
  })

  test('allows an empty channels list only on the granted branch', () => {
    expect(
      parseContactAccessEnvelope(envelope({ allowed: true, full_name: '示例联系人', channels: [] })),
    ).toEqual({ allowed: true, full_name: '示例联系人', channels: [] })
  })

  test('accepts the authorized null-name empty state', () => {
    expect(parseContactAccessEnvelope(envelope({ allowed: true, full_name: null, channels: [] }))).toEqual({
      allowed: true,
      full_name: null,
      channels: [],
    })
  })

  test('counts authorized full_name length by Unicode code point', () => {
    expect(
      parseContactAccessEnvelope(envelope({ allowed: true, full_name: '😀'.repeat(200), channels: [] })),
    ).toMatchObject({ allowed: true, full_name: '😀'.repeat(200) })
    expect(() =>
      parseContactAccessEnvelope(envelope({ allowed: true, full_name: '😀'.repeat(201), channels: [] })),
    ).toThrow('INVALID_CONTACT_RESPONSE')
  })

  test('accepts a granted contact with typed synthetic channels', () => {
    expect(
      parseContactAccessEnvelope(
        envelope({
          allowed: true,
          full_name: '示例联系人',
          channels: [{ type: 'email', value: 'contact@example.test' }],
        }),
      ),
    ).toEqual({
      allowed: true,
      full_name: '示例联系人',
      channels: [{ type: 'email', value: 'contact@example.test' }],
    })
  })

  test.each([null, 'not-json', [], { ok: true }, { ok: true, data: { contact_access: null } }]) (
    'fails closed for malformed or non-JSON-shaped response %#',
    (value) => {
      expect(() => parseContactAccessEnvelope(value)).toThrow('INVALID_CONTACT_RESPONSE')
    },
  )

  test('rejects unknown response fields instead of copying them into memory', () => {
    expect(() =>
      parseContactAccessEnvelope({
        ok: true,
        data: { contact_access: { allowed: false, reason_code: 'NOT_CLAIMED' }, debug: 'raw' },
      }),
    ).toThrow('INVALID_CONTACT_RESPONSE')
  })
})
