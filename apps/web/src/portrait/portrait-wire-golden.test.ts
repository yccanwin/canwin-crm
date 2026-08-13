import { describe, expect, test } from 'vitest'
import portraitWireGolden from './fixtures/portrait-wire-golden.json'
import {
  PORTRAIT_CATALOG_RPC,
  PORTRAIT_DERIVED_RPC,
  parseDerivedPortraitEnvelope,
  parsePortraitCatalogEnvelope,
  type PortraitDerivedContext,
} from './portrait-contract'

interface GoldenFixture {
  fixture_version: number
  synthetic_only: boolean
  catalog_envelope: unknown
  derived_envelopes: Array<{ context: PortraitDerivedContext } & Record<string, unknown>>
}

const golden = portraitWireGolden as GoldenFixture
const catalog = parsePortraitCatalogEnvelope(golden.catalog_envelope)

function cloned<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('shared portrait wire golden', () => {
  test('is explicitly synthetic and versioned', () => {
    expect(golden).toMatchObject({ fixture_version: 1, synthetic_only: true })
  })

  test('freezes the two read-only projection RPC names', () => {
    expect([PORTRAIT_CATALOG_RPC, PORTRAIT_DERIVED_RPC]).toEqual([
      'read_portrait_catalog',
      'read_store_derived_portraits',
    ])
  })

  test('parses one exact catalog containing five manual types and three reserved derived fields', () => {
    expect(catalog.fields).toHaveLength(8)
    expect(new Set(catalog.fields.map((field) => field.value_type))).toEqual(
      new Set(['text', 'single_select', 'multi_select', 'boolean', 'number']),
    )
    expect(catalog.fields.filter((field) => field.source_kind === 'system_derived')).toHaveLength(3)
  })

  test('freezes public privacy, constraints, operators, capabilities, and nested option ordering', () => {
    const text = catalog.fields.find((field) => field.field_key === 'business_note')
    const number = catalog.fields.find((field) => field.field_key === 'seat_count')
    const single = catalog.fields.find((field) => field.field_key === 'business_category')
    expect(text).toMatchObject({
      privacy_level: 'shared_non_sensitive',
      constraints: { min_length: 1, max_length: 500 },
      allowed_filter_operators: ['equals', 'prefix'],
      capabilities: { can_set: false, can_clear: false },
    })
    expect(number).toMatchObject({
      constraints: { maximum_scale: 12 },
      allowed_filter_operators: ['eq', 'gte', 'lte', 'between'],
    })
    expect(single?.options.map((option) => option.option_key)).toEqual(['food', 'retail'])
  })

  test.each([0, 1])('parses derived envelope %s against its exact public context', (index) => {
    const envelope = golden.derived_envelopes[index]
    expect(parseDerivedPortraitEnvelope(envelope, catalog.fields, envelope.context)).toMatchObject({
      schema_version: 1,
      context: envelope.context,
    })
  })

  test('freezes fresh reason null while retaining true and false as distinct conclusions', () => {
    const values = golden.derived_envelopes.flatMap((envelope) =>
      parseDerivedPortraitEnvelope(envelope, catalog.fields, envelope.context).values,
    )
    const fresh = values.filter((value) => value.freshness === 'fresh')
    expect(fresh.every((value) => value.reason_code === null)).toBe(true)
    expect(fresh.some((value) => value.value === true)).toBe(true)
    expect(fresh.some((value) => value.value === false)).toBe(true)
  })

  test('keeps unknown and stale null-valued and in separate reason states', () => {
    const values = parseDerivedPortraitEnvelope(
      golden.derived_envelopes[0],
      catalog.fields,
      golden.derived_envelopes[0].context,
    ).values
    expect(values.find((value) => value.freshness === 'unknown')).toMatchObject({
      value: null,
      reason_code: 'NOT_COMPUTED',
    })
    expect(values.find((value) => value.freshness === 'stale')).toMatchObject({
      value: null,
      reason_code: 'SOURCE_CHANGED',
    })
  })

  test.each([
    ['catalog extra key', () => {
      const value = cloned(golden.catalog_envelope) as Record<string, unknown>
      value.debug = true
      return () => parsePortraitCatalogEnvelope(value)
    }],
    ['derived extra key', () => {
      const value = cloned(golden.derived_envelopes[0]) as Record<string, unknown>
      value.raw = true
      return () => parseDerivedPortraitEnvelope(value, catalog.fields, golden.derived_envelopes[0].context)
    }],
    ['context mismatch', () => {
      const expected = { ...golden.derived_envelopes[0].context, context_version: 999 }
      return () => parseDerivedPortraitEnvelope(golden.derived_envelopes[0], catalog.fields, expected)
    }],
    ['internal store id', () => {
      const value = cloned(golden.derived_envelopes[0]) as GoldenFixture['derived_envelopes'][number]
      const first = (value.values as Array<Record<string, unknown>>)[0]
      first.store_id = 42
      return () => parseDerivedPortraitEnvelope(value, catalog.fields, value.context)
    }],
  ] as const)('fails closed for %s', (_label, makeAssertion) => {
    expect(makeAssertion()).toThrow('INVALID_PORTRAIT_RESPONSE')
  })
})
