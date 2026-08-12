export const PORTRAIT_SCHEMA_VERSION = 1 as const
export const PORTRAIT_CATALOG_RPC = 'read_portrait_catalog' as const
export const PORTRAIT_DERIVED_RPC = 'read_store_derived_portraits' as const

export const PORTRAIT_VALUE_TYPES = [
  'text',
  'single_select',
  'multi_select',
  'boolean',
  'number',
] as const

export const DERIVED_REASON_CODES = [
  'NOT_COMPUTED',
  'SOURCE_NOT_READY',
  'REQUIREMENTS_NOT_CONFIGURED',
  'SOURCE_CHANGED',
  'RECOMPUTE_PENDING',
  'COMPUTE_FAILED',
] as const

export type PortraitValueType = (typeof PORTRAIT_VALUE_TYPES)[number]
export type PortraitSourceKind = 'manual' | 'system_derived'
export type PortraitContextScope = 'store_global' | 'store_department'
export type PortraitFieldStatus = 'active' | 'inactive' | 'reserved'
export type PortraitOptionStatus = 'active' | 'inactive'
export type DerivedFreshness = 'fresh' | 'unknown' | 'stale'
export type DerivedReasonCode = (typeof DERIVED_REASON_CODES)[number]

export interface PortraitCapabilities {
  can_set: boolean
  can_clear: boolean
}

export interface PortraitOption {
  public_id: string
  option_key: string
  label: string
  status: PortraitOptionStatus
  sort_order: number
}

interface PortraitFieldBase {
  schema_version: typeof PORTRAIT_SCHEMA_VERSION
  public_id: string
  field_key: string
  label: string
  description: string | null
  source_kind: PortraitSourceKind
  privacy_level: 'shared_non_sensitive'
  context_scope: PortraitContextScope
  status: PortraitFieldStatus
  sort_order: number
  allow_keyword_search: boolean
  capabilities: PortraitCapabilities
  options: PortraitOption[]
}

export interface TextPortraitField extends PortraitFieldBase {
  value_type: 'text'
  constraints: { min_length: number; max_length: number }
  allowed_filter_operators: readonly ['equals', 'prefix']
}

export interface SingleSelectPortraitField extends PortraitFieldBase {
  value_type: 'single_select'
  constraints: Record<string, never>
  allowed_filter_operators: readonly ['equals']
}

export interface MultiSelectPortraitField extends PortraitFieldBase {
  value_type: 'multi_select'
  constraints: { min_selections: number; max_selections: number }
  allowed_filter_operators: readonly ['contains_any', 'contains_all']
}

export interface BooleanPortraitField extends PortraitFieldBase {
  value_type: 'boolean'
  constraints: Record<string, never>
  allowed_filter_operators:
    | readonly ['is_true', 'is_false']
    | readonly ['is_true', 'is_false', 'is_unknown']
}

export interface NumberPortraitField extends PortraitFieldBase {
  value_type: 'number'
  constraints: { maximum_scale: number }
  allowed_filter_operators: readonly ['eq', 'gte', 'lte', 'between']
}

export type KnownPortraitField =
  | TextPortraitField
  | SingleSelectPortraitField
  | MultiSelectPortraitField
  | BooleanPortraitField
  | NumberPortraitField

export interface UnsupportedPortraitField extends PortraitFieldBase {
  value_type: 'unsupported'
  raw_value_type: string
  unsupported_reason: 'UNSUPPORTED_VALUE_TYPE' | 'INVALID_CONSTRAINTS'
  constraints: null
  allowed_filter_operators: readonly []
  capabilities: { can_set: false; can_clear: false }
}

export type PortraitField = KnownPortraitField | UnsupportedPortraitField

export type PortraitValue =
  | { value_type: 'text'; value: string }
  | { value_type: 'single_select'; option_public_id: string }
  | { value_type: 'multi_select'; option_public_ids: string[] }
  | { value_type: 'boolean'; value: boolean }
  | { value_type: 'number'; value: string }

export type PortraitMutation =
  | { op: 'set'; value: PortraitValue }
  | { op: 'clear' }

export interface DerivedPortraitValue {
  schema_version: typeof PORTRAIT_SCHEMA_VERSION
  field_public_id: string
  store_public_id: string
  department_public_id: string | null
  context_version: number
  freshness: DerivedFreshness
  value: boolean | null
  calculation_version: string | null
  source_version: string | null
  computed_at: string | null
  source_changed_at: string | null
  reason_code: DerivedReasonCode | null
}

export interface DerivedPresentation {
  label: string
  filter_bucket: 'is_true' | 'is_false' | 'is_unknown'
  freshness: DerivedFreshness
}

export interface PortraitCatalogEnvelope {
  schema_version: typeof PORTRAIT_SCHEMA_VERSION
  fields: PortraitField[]
}

export interface PortraitDerivedContext {
  auth_user_public_id: string
  member_public_id: string
  primary_department_public_id: string
  store_public_id: string
  context_version: number
}

export interface PortraitDerivedEnvelope {
  schema_version: typeof PORTRAIT_SCHEMA_VERSION
  context: PortraitDerivedContext
  values: DerivedPortraitValue[]
}

const definitionKeys = [
  'schema_version',
  'public_id',
  'field_key',
  'label',
  'description',
  'value_type',
  'source_kind',
  'privacy_level',
  'context_scope',
  'status',
  'sort_order',
  'constraints',
  'allow_keyword_search',
  'allowed_filter_operators',
  'capabilities',
  'options',
] as const

const derivedKeys = [
  'schema_version',
  'field_public_id',
  'store_public_id',
  'department_public_id',
  'context_version',
  'freshness',
  'value',
  'calculation_version',
  'source_version',
  'computed_at',
  'source_changed_at',
  'reason_code',
] as const

const optionKeys = ['public_id', 'option_key', 'label', 'status', 'sort_order'] as const
const derivedContextKeys = [
  'auth_user_public_id',
  'member_public_id',
  'primary_department_public_id',
  'store_public_id',
  'context_version',
] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const fieldKeyPattern = /^[a-z][a-z0-9_]{0,63}$/
const canonicalDecimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

const reservedDerivedFields: Record<string, PortraitContextScope> = {
  has_legal_person_id: 'store_global',
  has_business_license: 'store_global',
  documents_complete: 'store_department',
}

const expectedOperators = {
  text: ['equals', 'prefix'],
  single_select: ['equals'],
  multi_select: ['contains_any', 'contains_all'],
  manual_boolean: ['is_true', 'is_false'],
  derived_boolean: ['is_true', 'is_false', 'is_unknown'],
  number: ['eq', 'gte', 'lte', 'between'],
} as const

function invalid(): never {
  throw new Error('INVALID_PORTRAIT_RESPONSE')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(record)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function isSafeText(value: unknown, maximumLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    [...value].length <= maximumLength &&
    (allowEmpty || value.trim().length > 0) &&
    !hasControlCharacter(value)
  )
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function isPortraitPublicId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

export function isCanonicalDecimal(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 100 &&
    value !== '-0' &&
    canonicalDecimalPattern.test(value)
  )
}

function parseCapabilities(value: unknown): PortraitCapabilities {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['can_set', 'can_clear']) ||
    typeof value.can_set !== 'boolean' ||
    typeof value.can_clear !== 'boolean'
  ) {
    return invalid()
  }
  return { can_set: value.can_set, can_clear: value.can_clear }
}

function parseOptions(value: unknown): PortraitOption[] {
  if (!Array.isArray(value) || value.length > 200) return invalid()
  const options = value.map((option) => {
    if (
      !isRecord(option) ||
      !hasExactKeys(option, optionKeys) ||
      !isPortraitPublicId(option.public_id) ||
      !isSafeText(option.option_key, 64) ||
      !fieldKeyPattern.test(option.option_key) ||
      !isSafeText(option.label, 100) ||
      (option.status !== 'active' && option.status !== 'inactive') ||
      !isNonNegativeSafeInteger(option.sort_order)
    ) {
      return invalid()
    }
    return {
      public_id: option.public_id,
      option_key: option.option_key,
      label: option.label,
      status: option.status,
      sort_order: option.sort_order,
    } satisfies PortraitOption
  })
  if (new Set(options.map((option) => option.public_id)).size !== options.length) return invalid()
  if (new Set(options.map((option) => option.option_key)).size !== options.length) return invalid()
  return options.sort((left, right) => left.sort_order - right.sort_order || left.public_id.localeCompare(right.public_id))
}

function parseExactOperators<const Operators extends readonly string[]>(
  value: unknown,
  expected: Operators,
): Operators {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((operator) => typeof operator !== 'string') ||
    new Set(value).size !== value.length ||
    expected.some((operator) => !value.includes(operator))
  ) {
    return invalid()
  }
  return expected
}

function parseDefinitionBase(value: Record<string, unknown>): PortraitFieldBase {
  if (
    !hasExactKeys(value, definitionKeys) ||
    value.schema_version !== PORTRAIT_SCHEMA_VERSION ||
    !isPortraitPublicId(value.public_id) ||
    !isSafeText(value.field_key, 64) ||
    !fieldKeyPattern.test(value.field_key) ||
    !isSafeText(value.label, 100) ||
    (value.description !== null && !isSafeText(value.description, 500, true)) ||
    (value.source_kind !== 'manual' && value.source_kind !== 'system_derived') ||
    value.privacy_level !== 'shared_non_sensitive' ||
    (value.context_scope !== 'store_global' && value.context_scope !== 'store_department') ||
    (value.status !== 'active' && value.status !== 'inactive' && value.status !== 'reserved') ||
    !isNonNegativeSafeInteger(value.sort_order) ||
    typeof value.allow_keyword_search !== 'boolean'
  ) {
    return invalid()
  }

  const capabilities = parseCapabilities(value.capabilities)
  const options = parseOptions(value.options)
  const sourceKind = value.source_kind
  const status = value.status
  if ((sourceKind === 'system_derived' || status !== 'active') && (capabilities.can_set || capabilities.can_clear)) {
    return invalid()
  }
  if (value.allow_keyword_search && (sourceKind !== 'manual' || status !== 'active')) return invalid()

  return {
    schema_version: PORTRAIT_SCHEMA_VERSION,
    public_id: value.public_id,
    field_key: value.field_key,
    label: value.label,
    description: value.description,
    source_kind: sourceKind,
    privacy_level: 'shared_non_sensitive' as const,
    context_scope: value.context_scope,
    status,
    sort_order: value.sort_order,
    allow_keyword_search: value.allow_keyword_search,
    capabilities,
    options,
  }
}

function unsupportedDefinition(
  base: ReturnType<typeof parseDefinitionBase>,
  rawValueType: string,
  reason: UnsupportedPortraitField['unsupported_reason'],
): UnsupportedPortraitField {
  if (base.capabilities.can_set || base.capabilities.can_clear || base.allow_keyword_search) return invalid()
  return {
    ...base,
    value_type: 'unsupported',
    raw_value_type: rawValueType,
    unsupported_reason: reason,
    constraints: null,
    allowed_filter_operators: [],
    capabilities: { can_set: false, can_clear: false },
  }
}

export function parsePortraitFieldDefinition(value: unknown): PortraitField {
  if (!isRecord(value)) return invalid()
  const base = parseDefinitionBase(value)
  const rawValueType = value.value_type
  if (!isSafeText(rawValueType, 64) || !fieldKeyPattern.test(rawValueType)) return invalid()

  if (!PORTRAIT_VALUE_TYPES.includes(rawValueType as PortraitValueType)) {
    return unsupportedDefinition(base, rawValueType, 'UNSUPPORTED_VALUE_TYPE')
  }

  const valueType = rawValueType as PortraitValueType
  const constraints = value.constraints
  const optionsMustBeEmpty = valueType !== 'single_select' && valueType !== 'multi_select'
  if (optionsMustBeEmpty && base.options.length > 0) return invalid()

  if (base.source_kind === 'system_derived') {
    if (
      valueType !== 'boolean' ||
      reservedDerivedFields[base.field_key] !== base.context_scope ||
      !['reserved', 'active', 'inactive'].includes(base.status) ||
      base.allow_keyword_search
    ) {
      return invalid()
    }
  } else if (base.context_scope !== 'store_global' || base.status === 'reserved') {
    return invalid()
  }

  if (valueType === 'text') {
    if (
      !isRecord(constraints) ||
      !hasExactKeys(constraints, ['min_length', 'max_length']) ||
      !isNonNegativeSafeInteger(constraints.min_length) ||
      !isPositiveSafeInteger(constraints.max_length) ||
      constraints.min_length > constraints.max_length ||
      constraints.max_length > 2000 ||
      (base.allow_keyword_search && base.source_kind !== 'manual')
    ) {
      return unsupportedDefinition(base, rawValueType, 'INVALID_CONSTRAINTS')
    }
    return {
      ...base,
      value_type: 'text',
      constraints: { min_length: constraints.min_length, max_length: constraints.max_length },
      allowed_filter_operators: parseExactOperators(value.allowed_filter_operators, expectedOperators.text),
    }
  }

  if (valueType === 'single_select') {
    if (!isRecord(constraints) || !hasExactKeys(constraints, [])) {
      return unsupportedDefinition(base, rawValueType, 'INVALID_CONSTRAINTS')
    }
    return {
      ...base,
      value_type: 'single_select',
      constraints: {},
      allowed_filter_operators: parseExactOperators(value.allowed_filter_operators, expectedOperators.single_select),
    }
  }

  if (valueType === 'multi_select') {
    if (
      !isRecord(constraints) ||
      !hasExactKeys(constraints, ['min_selections', 'max_selections']) ||
      !isNonNegativeSafeInteger(constraints.min_selections) ||
      !isPositiveSafeInteger(constraints.max_selections) ||
      constraints.min_selections > constraints.max_selections ||
      constraints.max_selections > 50
    ) {
      return unsupportedDefinition(base, rawValueType, 'INVALID_CONSTRAINTS')
    }
    return {
      ...base,
      value_type: 'multi_select',
      constraints: {
        min_selections: constraints.min_selections,
        max_selections: constraints.max_selections,
      },
      allowed_filter_operators: parseExactOperators(value.allowed_filter_operators, expectedOperators.multi_select),
    }
  }

  if (valueType === 'boolean') {
    if (!isRecord(constraints) || !hasExactKeys(constraints, [])) {
      return unsupportedDefinition(base, rawValueType, 'INVALID_CONSTRAINTS')
    }
    const operators = base.source_kind === 'system_derived'
      ? expectedOperators.derived_boolean
      : expectedOperators.manual_boolean
    return {
      ...base,
      value_type: 'boolean',
      constraints: {},
      allowed_filter_operators: parseExactOperators(value.allowed_filter_operators, operators),
    }
  }

  if (
    !isRecord(constraints) ||
    !hasExactKeys(constraints, ['maximum_scale']) ||
    !isNonNegativeSafeInteger(constraints.maximum_scale) ||
    constraints.maximum_scale > 18 ||
    base.allow_keyword_search
  ) {
    return unsupportedDefinition(base, rawValueType, 'INVALID_CONSTRAINTS')
  }
  return {
    ...base,
    value_type: 'number',
    constraints: { maximum_scale: constraints.maximum_scale },
    allowed_filter_operators: parseExactOperators(value.allowed_filter_operators, expectedOperators.number),
  }
}

export function parsePortraitCatalogEnvelope(value: unknown): PortraitCatalogEnvelope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schema_version', 'fields']) ||
    value.schema_version !== PORTRAIT_SCHEMA_VERSION ||
    !Array.isArray(value.fields) ||
    value.fields.length > 200
  ) {
    return invalid()
  }
  const fields = value.fields.map(parsePortraitFieldDefinition)
  if (new Set(fields.map((field) => field.public_id)).size !== fields.length) return invalid()
  if (new Set(fields.map((field) => field.field_key)).size !== fields.length) return invalid()
  fields.sort((left, right) => left.sort_order - right.sort_order || left.public_id.localeCompare(right.public_id))
  return { schema_version: PORTRAIT_SCHEMA_VERSION, fields }
}

export function parsePortraitValue(value: unknown): PortraitValue {
  if (!isRecord(value) || !isSafeText(value.value_type, 64)) return invalid()
  if (value.value_type === 'text') {
    if (!hasExactKeys(value, ['value_type', 'value']) || !isSafeText(value.value, 2000)) return invalid()
    return { value_type: 'text', value: value.value }
  }
  if (value.value_type === 'single_select') {
    if (!hasExactKeys(value, ['value_type', 'option_public_id']) || !isPortraitPublicId(value.option_public_id)) {
      return invalid()
    }
    return { value_type: 'single_select', option_public_id: value.option_public_id }
  }
  if (value.value_type === 'multi_select') {
    if (
      !hasExactKeys(value, ['value_type', 'option_public_ids']) ||
      !Array.isArray(value.option_public_ids) ||
      value.option_public_ids.length < 1 ||
      value.option_public_ids.length > 50 ||
      value.option_public_ids.some((id) => !isPortraitPublicId(id)) ||
      new Set(value.option_public_ids).size !== value.option_public_ids.length
    ) {
      return invalid()
    }
    return { value_type: 'multi_select', option_public_ids: [...value.option_public_ids].sort() }
  }
  if (value.value_type === 'boolean') {
    if (!hasExactKeys(value, ['value_type', 'value']) || typeof value.value !== 'boolean') return invalid()
    return { value_type: 'boolean', value: value.value }
  }
  if (value.value_type === 'number') {
    if (!hasExactKeys(value, ['value_type', 'value']) || !isCanonicalDecimal(value.value)) return invalid()
    return { value_type: 'number', value: value.value }
  }
  return invalid()
}

function optionIsActive(field: KnownPortraitField, publicId: string) {
  return field.options.some((option) => option.public_id === publicId && option.status === 'active')
}

function validateValueAgainstField(field: KnownPortraitField, value: PortraitValue) {
  if (field.value_type !== value.value_type) return invalid()
  if (field.value_type === 'text' && value.value_type === 'text') {
    const length = [...value.value].length
    if (length < field.constraints.min_length || length > field.constraints.max_length) return invalid()
  }
  if (field.value_type === 'single_select' && value.value_type === 'single_select') {
    if (!optionIsActive(field, value.option_public_id)) return invalid()
  }
  if (field.value_type === 'multi_select' && value.value_type === 'multi_select') {
    if (
      value.option_public_ids.length < field.constraints.min_selections ||
      value.option_public_ids.length > field.constraints.max_selections ||
      value.option_public_ids.some((id) => !optionIsActive(field, id))
    ) {
      return invalid()
    }
  }
  if (field.value_type === 'number' && value.value_type === 'number') {
    const scale = value.value.includes('.') ? value.value.length - value.value.indexOf('.') - 1 : 0
    if (scale > field.constraints.maximum_scale) return invalid()
  }
}

export function parsePortraitMutation(value: unknown, field: PortraitField): PortraitMutation {
  if (field.value_type === 'unsupported' || field.source_kind !== 'manual' || field.status !== 'active') {
    return invalid()
  }
  if (!isRecord(value) || typeof value.op !== 'string') return invalid()
  if (value.op === 'clear') {
    if (!hasExactKeys(value, ['op']) || !field.capabilities.can_clear) return invalid()
    return { op: 'clear' }
  }
  if (value.op === 'set') {
    if (!hasExactKeys(value, ['op', 'value']) || !field.capabilities.can_set) return invalid()
    const parsed = parsePortraitValue(value.value)
    validateValueAgainstField(field, parsed)
    return { op: 'set', value: parsed }
  }
  return invalid()
}

function isSafeVersion(value: unknown): value is string {
  return isSafeText(value, 100)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && timestampPattern.test(value) && !Number.isNaN(Date.parse(value))
}

export function parseDerivedPortraitValue(value: unknown, field: PortraitField): DerivedPortraitValue {
  if (
    field.value_type !== 'boolean' ||
    field.source_kind !== 'system_derived' ||
    !isRecord(value) ||
    !hasExactKeys(value, derivedKeys) ||
    value.schema_version !== PORTRAIT_SCHEMA_VERSION ||
    value.field_public_id !== field.public_id ||
    !isPortraitPublicId(value.store_public_id) ||
    !isPositiveSafeInteger(value.context_version) ||
    (value.freshness !== 'fresh' && value.freshness !== 'unknown' && value.freshness !== 'stale') ||
    (value.reason_code !== null && !DERIVED_REASON_CODES.includes(value.reason_code as DerivedReasonCode))
  ) {
    return invalid()
  }

  if (field.context_scope === 'store_department') {
    if (!isPortraitPublicId(value.department_public_id)) return invalid()
  } else if (value.department_public_id !== null) {
    return invalid()
  }

  const optionalVersionsAreSafe =
    (value.calculation_version === null || isSafeVersion(value.calculation_version)) &&
    (value.source_version === null || isSafeVersion(value.source_version)) &&
    (value.computed_at === null || isTimestamp(value.computed_at)) &&
    (value.source_changed_at === null || isTimestamp(value.source_changed_at))
  if (!optionalVersionsAreSafe) return invalid()

  if (value.freshness === 'fresh') {
    if (
      typeof value.value !== 'boolean' ||
      value.reason_code !== null ||
      !isSafeVersion(value.calculation_version) ||
      !isSafeVersion(value.source_version) ||
      !isTimestamp(value.computed_at) ||
      !isTimestamp(value.source_changed_at)
    ) {
      return invalid()
    }
  }

  if (value.freshness === 'unknown') {
    const allowed = ['NOT_COMPUTED', 'SOURCE_NOT_READY', 'REQUIREMENTS_NOT_CONFIGURED', 'COMPUTE_FAILED']
    if (value.value !== null || !allowed.includes(value.reason_code as string)) return invalid()
  }

  if (value.freshness === 'stale') {
    const allowed = ['SOURCE_CHANGED', 'RECOMPUTE_PENDING', 'COMPUTE_FAILED']
    if (
      value.value !== null ||
      !allowed.includes(value.reason_code as string) ||
      !isSafeVersion(value.calculation_version) ||
      !isSafeVersion(value.source_version) ||
      !isTimestamp(value.computed_at) ||
      !isTimestamp(value.source_changed_at)
    ) {
      return invalid()
    }
  }

  return {
    schema_version: PORTRAIT_SCHEMA_VERSION,
    field_public_id: value.field_public_id,
    store_public_id: value.store_public_id,
    department_public_id: value.department_public_id as string | null,
    context_version: value.context_version,
    freshness: value.freshness,
    value: value.value as boolean | null,
    calculation_version: value.calculation_version as string | null,
    source_version: value.source_version as string | null,
    computed_at: value.computed_at as string | null,
    source_changed_at: value.source_changed_at as string | null,
    reason_code: value.reason_code as DerivedReasonCode | null,
  }
}

function parseDerivedContext(value: unknown): PortraitDerivedContext {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, derivedContextKeys) ||
    !isPortraitPublicId(value.auth_user_public_id) ||
    !isPortraitPublicId(value.member_public_id) ||
    !isPortraitPublicId(value.primary_department_public_id) ||
    !isPortraitPublicId(value.store_public_id) ||
    !isPositiveSafeInteger(value.context_version)
  ) {
    return invalid()
  }
  return {
    auth_user_public_id: value.auth_user_public_id,
    member_public_id: value.member_public_id,
    primary_department_public_id: value.primary_department_public_id,
    store_public_id: value.store_public_id,
    context_version: value.context_version,
  }
}

function contextsMatch(left: PortraitDerivedContext, right: PortraitDerivedContext) {
  return (
    left.auth_user_public_id === right.auth_user_public_id &&
    left.member_public_id === right.member_public_id &&
    left.primary_department_public_id === right.primary_department_public_id &&
    left.store_public_id === right.store_public_id &&
    left.context_version === right.context_version
  )
}

export function parseDerivedPortraitEnvelope(
  value: unknown,
  fields: readonly PortraitField[],
  expectedContext: PortraitDerivedContext,
): PortraitDerivedEnvelope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schema_version', 'context', 'values']) ||
    value.schema_version !== PORTRAIT_SCHEMA_VERSION ||
    !Array.isArray(value.values) ||
    value.values.length > 200
  ) {
    return invalid()
  }

  const context = parseDerivedContext(value.context)
  const expected = parseDerivedContext(expectedContext)
  if (!contextsMatch(context, expected)) return invalid()

  const fieldMap = new Map(fields.map((field) => [field.public_id, field]))
  const values = value.values.map((item) => {
    if (!isRecord(item) || !isPortraitPublicId(item.field_public_id)) return invalid()
    const field = fieldMap.get(item.field_public_id)
    if (!field) return invalid()
    const parsed = parseDerivedPortraitValue(item, field)
    if (
      parsed.store_public_id !== context.store_public_id ||
      parsed.context_version !== context.context_version ||
      (field.context_scope === 'store_department'
        ? parsed.department_public_id !== context.primary_department_public_id
        : parsed.department_public_id !== null)
    ) {
      return invalid()
    }
    return parsed
  })

  if (new Set(values.map((item) => `${item.field_public_id}:${item.department_public_id ?? 'global'}`)).size !== values.length) {
    return invalid()
  }

  return { schema_version: PORTRAIT_SCHEMA_VERSION, context, values }
}

export function presentDerivedPortrait(field: PortraitField, value: DerivedPortraitValue): DerivedPresentation {
  if (field.value_type !== 'boolean' || field.source_kind !== 'system_derived') return invalid()
  if (value.freshness === 'unknown') {
    return { label: '未计算 / 数据未就绪', filter_bucket: 'is_unknown', freshness: 'unknown' }
  }
  if (value.freshness === 'stale') {
    return { label: '待刷新', filter_bucket: 'is_unknown', freshness: 'stale' }
  }
  const documentsComplete = field.field_key === 'documents_complete'
  return {
    label: value.value ? (documentsComplete ? '齐全' : '具备') : (documentsComplete ? '不齐全' : '不具备'),
    filter_bucket: value.value ? 'is_true' : 'is_false',
    freshness: 'fresh',
  }
}
