import { describe, expect, test } from 'vitest'
import {
  isCanonicalDecimal,
  parseDerivedPortraitValue,
  parsePortraitCatalogEnvelope,
  parsePortraitFieldDefinition,
  parsePortraitMutation,
  parsePortraitValue,
  presentDerivedPortrait,
  type PortraitField,
} from './portrait-contract'

const fieldIds = {
  text: '10000000-0000-4000-8000-000000000001',
  single_select: '10000000-0000-4000-8000-000000000002',
  multi_select: '10000000-0000-4000-8000-000000000003',
  boolean: '10000000-0000-4000-8000-000000000004',
  number: '10000000-0000-4000-8000-000000000005',
  derived_global: '10000000-0000-4000-8000-000000000006',
  derived_department: '10000000-0000-4000-8000-000000000007',
}

const optionA = '20000000-0000-4000-8000-000000000001'
const optionB = '20000000-0000-4000-8000-000000000002'
const departmentId = '30000000-0000-4000-8000-000000000001'
const storeId = '70000000-0000-4000-8000-000000000001'

const typeConfig = {
  text: {
    constraints: { min_length: 1, max_length: 200 },
    allowed_filter_operators: ['equals', 'prefix'],
    options: [],
  },
  single_select: {
    constraints: {},
    allowed_filter_operators: ['equals'],
    options: [
      { public_id: optionB, option_key: 'retail', label: '零售', status: 'inactive', sort_order: 2 },
      { public_id: optionA, option_key: 'food', label: '餐饮', status: 'active', sort_order: 1 },
    ],
  },
  multi_select: {
    constraints: { min_selections: 1, max_selections: 5 },
    allowed_filter_operators: ['contains_any', 'contains_all'],
    options: [
      { public_id: optionA, option_key: 'takeout', label: '外卖', status: 'active', sort_order: 1 },
      { public_id: optionB, option_key: 'dine_in', label: '堂食', status: 'active', sort_order: 2 },
    ],
  },
  boolean: {
    constraints: {},
    allowed_filter_operators: ['is_true', 'is_false'],
    options: [],
  },
  number: {
    constraints: { maximum_scale: 6 },
    allowed_filter_operators: ['eq', 'gte', 'lte', 'between'],
    options: [],
  },
} as const

function manualField(valueType: keyof typeof typeConfig, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    public_id: fieldIds[valueType],
    field_key: `manual_${valueType}`,
    label: `合成${valueType}`,
    description: null,
    value_type: valueType,
    source_kind: 'manual',
    privacy_level: 'shared_non_sensitive',
    context_scope: 'store_global',
    status: 'active',
    sort_order: 10,
    constraints: typeConfig[valueType].constraints,
    allow_keyword_search: valueType === 'text',
    allowed_filter_operators: typeConfig[valueType].allowed_filter_operators,
    capabilities: { can_set: true, can_clear: true },
    options: typeConfig[valueType].options,
    ...overrides,
  }
}

function derivedField(fieldKey: 'has_business_license' | 'documents_complete') {
  return parsePortraitFieldDefinition({
    schema_version: 1,
    public_id: fieldKey === 'documents_complete' ? fieldIds.derived_department : fieldIds.derived_global,
    field_key: fieldKey,
    label: fieldKey === 'documents_complete' ? '证件齐全度' : '营业执照',
    description: null,
    value_type: 'boolean',
    source_kind: 'system_derived',
    privacy_level: 'shared_non_sensitive',
    context_scope: fieldKey === 'documents_complete' ? 'store_department' : 'store_global',
    status: 'reserved',
    sort_order: 1,
    constraints: {},
    allow_keyword_search: false,
    allowed_filter_operators: ['is_true', 'is_false', 'is_unknown'],
    capabilities: { can_set: false, can_clear: false },
    options: [],
  })
}

function derivedValue(
  field: PortraitField,
  freshness: 'fresh' | 'unknown' | 'stale',
  value: boolean | null,
  reasonCode: string | null,
) {
  return {
    schema_version: 1,
    field_public_id: field.public_id,
    store_public_id: storeId,
    department_public_id: field.context_scope === 'store_department' ? departmentId : null,
    context_version: 7,
    freshness,
    value,
    calculation_version: freshness === 'unknown' ? null : 'calc-v1',
    source_version: freshness === 'unknown' ? null : 'source-v1',
    computed_at: freshness === 'unknown' ? null : '2026-08-11T08:00:00.000Z',
    source_changed_at: freshness === 'unknown' ? null : '2026-08-11T08:00:00.000Z',
    reason_code: reasonCode,
  }
}

describe('portrait field exact contract', () => {
  test.each(['text', 'single_select', 'multi_select', 'boolean', 'number'] as const)(
    'parses the frozen %s definition',
    (valueType) => {
      expect(parsePortraitFieldDefinition(manualField(valueType))).toMatchObject({
        value_type: valueType,
        source_kind: 'manual',
        context_scope: 'store_global',
      })
    },
  )

  test('sorts definitions and options by sort_order then public_id', () => {
    const later = manualField('text', { sort_order: 20 })
    const select = manualField('single_select', { sort_order: 10 })
    const catalog = parsePortraitCatalogEnvelope({ schema_version: 1, fields: [later, select] })
    expect(catalog.fields.map((field) => field.value_type)).toEqual(['single_select', 'text'])
    expect(catalog.fields[0]?.options.map((option) => option.public_id)).toEqual([optionA, optionB])
  })

  test('keeps an unknown single field as a safe read-only unsupported placeholder', () => {
    const parsed = parsePortraitFieldDefinition(manualField('text', {
      value_type: 'future_score',
      constraints: { opaque: 'not-copied' },
      allow_keyword_search: false,
      allowed_filter_operators: ['future'],
      capabilities: { can_set: false, can_clear: false },
    }))
    expect(parsed).toMatchObject({
      value_type: 'unsupported',
      raw_value_type: 'future_score',
      constraints: null,
      capabilities: { can_set: false, can_clear: false },
    })
    expect(parsed).not.toHaveProperty('opaque')
  })

  test.each([
    null,
    [],
    { schema_version: 2, fields: [] },
    { schema_version: 1, fields: [], debug: true },
    { schema_version: 1 },
  ])('fails the whole catalog closed for malformed or unknown envelope %#', (value) => {
    expect(() => parsePortraitCatalogEnvelope(value)).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test.each(['source_kind', 'privacy_level', 'context_scope', 'status'])(
    'rejects an unknown security-bearing field %s',
    (key) => {
      expect(() => parsePortraitFieldDefinition(manualField('text', { [key]: 'future_value' }))).toThrow(
        'INVALID_PORTRAIT_RESPONSE',
      )
    },
  )

  test('rejects extra definition keys', () => {
    expect(() => parsePortraitFieldDefinition(manualField('text', { contact_value: 'forbidden' }))).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })

  test('rejects duplicate catalog public ids', () => {
    expect(() => parsePortraitCatalogEnvelope({
      schema_version: 1,
      fields: [manualField('text'), manualField('number', { public_id: fieldIds.text })],
    })).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test('rejects duplicate catalog field keys', () => {
    expect(() => parsePortraitCatalogEnvelope({
      schema_version: 1,
      fields: [manualField('text'), manualField('number', { field_key: 'manual_text' })],
    })).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test.each([
    ['text', { min_length: 5, max_length: 4 }],
    ['text', { min_length: 0, max_length: 2001 }],
    ['multi_select', { min_selections: 6, max_selections: 5 }],
    ['multi_select', { min_selections: 0, max_selections: 51 }],
    ['number', { maximum_scale: 19 }],
  ] as const)('fails closed for invalid %s constraints', (valueType, constraints) => {
    expect(() => parsePortraitFieldDefinition(manualField(valueType, { constraints }))).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })

  test('preserves an inactive field and its inactive historical option as read-only', () => {
    const parsed = parsePortraitFieldDefinition(manualField('single_select', {
      status: 'inactive',
      allow_keyword_search: false,
      capabilities: { can_set: false, can_clear: false },
    }))
    expect(parsed.status).toBe('inactive')
    expect(parsed.capabilities).toEqual({ can_set: false, can_clear: false })
    expect(parsed.options.find((option) => option.public_id === optionB)?.status).toBe('inactive')
  })

  test.each(['has_legal_person_id', 'has_business_license', 'documents_complete'] as const)(
    'requires reserved derived key %s to remain boolean and read-only',
    (fieldKey) => {
      const field = fieldKey === 'documents_complete'
        ? derivedField('documents_complete')
        : parsePortraitFieldDefinition({
          ...manualField('boolean'),
          public_id: fieldKey === 'has_legal_person_id' ? fieldIds.derived_global : '10000000-0000-4000-8000-000000000008',
          field_key: fieldKey,
          source_kind: 'system_derived',
          context_scope: 'store_global',
          status: 'reserved',
          capabilities: { can_set: false, can_clear: false },
          allowed_filter_operators: ['is_true', 'is_false', 'is_unknown'],
        })
      expect(field).toMatchObject({ value_type: 'boolean', source_kind: 'system_derived', status: 'reserved' })
      expect(field.capabilities).toEqual({ can_set: false, can_clear: false })
    },
  )

  test.each(['reserved', 'active', 'inactive'] as const)(
    'accepts fixed system-derived definitions in the read-only %s lifecycle state',
    (status) => {
      const field = parsePortraitFieldDefinition({
        schema_version: 1,
        public_id: fieldIds.derived_department,
        field_key: 'documents_complete',
        label: '证件齐全度',
        description: null,
        value_type: 'boolean',
        source_kind: 'system_derived',
        privacy_level: 'shared_non_sensitive',
        context_scope: 'store_department',
        status,
        sort_order: 900003,
        constraints: {},
        allow_keyword_search: false,
        allowed_filter_operators: ['is_true', 'is_false', 'is_unknown'],
        capabilities: { can_set: false, can_clear: false },
        options: [],
      })
      expect(field).toMatchObject({
        field_key: 'documents_complete',
        status,
        capabilities: { can_set: false, can_clear: false },
        allow_keyword_search: false,
      })
    },
  )

  test('rejects an arbitrary active system-derived key', () => {
    expect(() => parsePortraitFieldDefinition({
      ...manualField('boolean'),
      field_key: 'untrusted_system_result',
      source_kind: 'system_derived',
      context_scope: 'store_global',
      status: 'active',
      allow_keyword_search: false,
      allowed_filter_operators: ['is_true', 'is_false', 'is_unknown'],
      capabilities: { can_set: false, can_clear: false },
    })).toThrow('INVALID_PORTRAIT_RESPONSE')
  })
})

describe('canonical portrait values and explicit clear', () => {
  test.each([
    '0',
    '1',
    '-1',
    '10',
    '0.1',
    '-0.1',
    '123456789012345678901234567890.123456789',
    '999999999999999999999999999999999999',
  ])('accepts canonical decimal %s without Number conversion', (value) => {
    expect(isCanonicalDecimal(value)).toBe(true)
    expect(parsePortraitValue({ value_type: 'number', value })).toEqual({ value_type: 'number', value })
  })

  test.each([
    '',
    '00',
    '01',
    '+1',
    '-0',
    '1.0',
    '1.20',
    '.5',
    '1.',
    '1e3',
    ' 1',
    '1 ',
    'NaN',
    'Infinity',
  ])('rejects non-canonical decimal %s', (value) => {
    expect(isCanonicalDecimal(value)).toBe(false)
    expect(() => parsePortraitValue({ value_type: 'number', value })).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test.each([
    { value_type: 'text', value: '社区门店' },
    { value_type: 'single_select', option_public_id: optionA },
    { value_type: 'multi_select', option_public_ids: [optionB, optionA] },
    { value_type: 'boolean', value: false },
    { value_type: 'number', value: '0' },
  ])('parses the exact typed value %#', (value) => {
    expect(parsePortraitValue(value)).toMatchObject({ value_type: value.value_type })
  })

  test('keeps false and zero as set values rather than clear', () => {
    const booleanField = parsePortraitFieldDefinition(manualField('boolean'))
    const numberField = parsePortraitFieldDefinition(manualField('number'))
    expect(parsePortraitMutation({ op: 'set', value: { value_type: 'boolean', value: false } }, booleanField)).toEqual({
      op: 'set', value: { value_type: 'boolean', value: false },
    })
    expect(parsePortraitMutation({ op: 'set', value: { value_type: 'number', value: '0' } }, numberField)).toEqual({
      op: 'set', value: { value_type: 'number', value: '0' },
    })
  })

  test('accepts only the exact clear object when the server capability permits it', () => {
    const field = parsePortraitFieldDefinition(manualField('text'))
    expect(parsePortraitMutation({ op: 'clear' }, field)).toEqual({ op: 'clear' })
    expect(() => parsePortraitMutation({ op: 'clear', value: null }, field)).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test.each([
    null,
    '',
    false,
    0,
    [],
  ])('does not reinterpret %# as clear', (value) => {
    const field = parsePortraitFieldDefinition(manualField('text'))
    expect(() => parsePortraitMutation({ op: 'set', value }, field)).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test('rejects set and clear when server capability is absent', () => {
    const field = parsePortraitFieldDefinition(manualField('boolean', {
      capabilities: { can_set: false, can_clear: false },
    }))
    expect(() => parsePortraitMutation({ op: 'clear' }, field)).toThrow('INVALID_PORTRAIT_RESPONSE')
    expect(() => parsePortraitMutation({ op: 'set', value: { value_type: 'boolean', value: true } }, field)).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })

  test('rejects an inactive option for a new set while preserving it in the definition', () => {
    const field = parsePortraitFieldDefinition(manualField('single_select'))
    expect(() => parsePortraitMutation({
      op: 'set', value: { value_type: 'single_select', option_public_id: optionB },
    }, field)).toThrow('INVALID_PORTRAIT_RESPONSE')
    expect(field.options.find((option) => option.public_id === optionB)?.label).toBe('零售')
  })

  test('rejects an empty multi-select instead of treating it as clear', () => {
    expect(() => parsePortraitValue({ value_type: 'multi_select', option_public_ids: [] })).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })
})

describe('derived portrait three-state contract', () => {
  const globalField = derivedField('has_business_license')
  const departmentField = derivedField('documents_complete')

  test.each([
    [globalField, 'fresh', true, null, '具备', 'is_true'],
    [globalField, 'fresh', false, null, '不具备', 'is_false'],
    [departmentField, 'fresh', true, null, '齐全', 'is_true'],
    [departmentField, 'fresh', false, null, '不齐全', 'is_false'],
    [globalField, 'unknown', null, 'NOT_COMPUTED', '未计算 / 数据未就绪', 'is_unknown'],
    [globalField, 'stale', null, 'SOURCE_CHANGED', '待刷新', 'is_unknown'],
  ] as const)('maps %s %s without collapsing unknown into false', (field, freshness, bool, reason, label, bucket) => {
    const parsed = parseDerivedPortraitValue(derivedValue(field, freshness, bool, reason), field)
    expect(presentDerivedPortrait(field, parsed)).toMatchObject({ label, filter_bucket: bucket, freshness })
  })

  test.each([
    ['unknown', false, 'NOT_COMPUTED'],
    ['stale', true, 'SOURCE_CHANGED'],
    ['fresh', null, null],
    ['fresh', true, 'SOURCE_CHANGED'],
  ] as const)('rejects illegal %s/value/reason combination', (freshness, value, reason) => {
    expect(() => parseDerivedPortraitValue(derivedValue(globalField, freshness, value, reason), globalField)).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })

  test('requires documents_complete to carry an explicit department context', () => {
    expect(() => parseDerivedPortraitValue({
      ...derivedValue(departmentField, 'unknown', null, 'NOT_COMPUTED'),
      department_public_id: null,
    }, departmentField)).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test('forbids a department id on a store-global derived value', () => {
    expect(() => parseDerivedPortraitValue({
      ...derivedValue(globalField, 'unknown', null, 'NOT_COMPUTED'),
      department_public_id: departmentId,
    }, globalField)).toThrow('INVALID_PORTRAIT_RESPONSE')
  })

  test('rejects derived values presented to a manual field', () => {
    const manual = parsePortraitFieldDefinition(manualField('boolean'))
    expect(() => parseDerivedPortraitValue(derivedValue(globalField, 'unknown', null, 'NOT_COMPUTED'), manual)).toThrow(
      'INVALID_PORTRAIT_RESPONSE',
    )
  })
})
