export const CONTACT_STRUCTURE_KEYS = [
  'public_id',
  'store_id',
  'role_label',
  'is_primary',
  'status',
  'version',
] as const

export const CONTACT_CHANNEL_TYPES = ['mobile', 'phone', 'email', 'wechat', 'other'] as const

export const CONTACT_DENIAL_REASON_CODES = [
  'AUTH_REQUIRED',
  'SESSION_INVALID',
  'MEMBERSHIP_INACTIVE',
  'DEPARTMENT_INACTIVE',
  'CONTACT_UNAVAILABLE',
  'NOT_CLAIMED',
  'REASON_REQUIRED',
  'REASON_INVALID',
] as const

export type ContactStatus = 'active' | 'inactive'
export type ContactChannelType = (typeof CONTACT_CHANNEL_TYPES)[number]
export type ContactDenialReasonCode = (typeof CONTACT_DENIAL_REASON_CODES)[number]

export interface ContactStructure {
  public_id: string
  store_id: number
  role_label: string
  is_primary: boolean
  status: ContactStatus
  version: number
}

export interface ContactChannel {
  type: ContactChannelType
  value: string
}

export interface ContactAccessDenied {
  allowed: false
  reason_code: ContactDenialReasonCode
}

export interface ContactAccessGranted {
  allowed: true
  full_name: string | null
  channels: ContactChannel[]
}

export type ContactAccess = ContactAccessDenied | ContactAccessGranted

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]) {
  const actualKeys = Object.keys(record)
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
}

function isSafeText(value: unknown, maximumLength: number) {
  return (
    typeof value === 'string' &&
    [...value].length <= maximumLength &&
    value.trim().length > 0 &&
    !hasControlCharacter(value)
  )
}

export function isContactPublicId(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuidPattern.test(value)
}

export function parseContactStructure(value: unknown): ContactStructure {
  if (!isRecord(value) || !hasExactKeys(value, CONTACT_STRUCTURE_KEYS)) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  const validStatus = value.status === 'active' || value.status === 'inactive'
  if (
    !isContactPublicId(value.public_id) ||
    !Number.isSafeInteger(value.store_id) ||
    (value.store_id as number) < 1 ||
    !isSafeText(value.role_label, 100) ||
    typeof value.is_primary !== 'boolean' ||
    !validStatus ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1
  ) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  return {
    public_id: value.public_id,
    store_id: value.store_id as number,
    role_label: value.role_label as string,
    is_primary: value.is_primary,
    status: value.status as ContactStatus,
    version: value.version as number,
  }
}

function parseChannels(value: unknown): ContactChannel[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  return value.map((channel) => {
    if (
      !isRecord(channel) ||
      !hasExactKeys(channel, ['type', 'value']) ||
      !CONTACT_CHANNEL_TYPES.includes(channel.type as ContactChannelType) ||
      !isSafeText(channel.value, 500)
    ) {
      throw new Error('INVALID_CONTACT_RESPONSE')
    }
    return { type: channel.type as ContactChannelType, value: channel.value as string }
  })
}

function parseContactAccess(value: unknown): ContactAccess {
  if (!isRecord(value) || typeof value.allowed !== 'boolean') {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  if (value.allowed === false) {
    if (
      !hasExactKeys(value, ['allowed', 'reason_code']) ||
      !CONTACT_DENIAL_REASON_CODES.includes(value.reason_code as ContactDenialReasonCode)
    ) {
      throw new Error('INVALID_CONTACT_RESPONSE')
    }
    return { allowed: false, reason_code: value.reason_code as ContactDenialReasonCode }
  }

  if (
    !hasExactKeys(value, ['allowed', 'full_name', 'channels']) ||
    (value.full_name !== null && !isSafeText(value.full_name, 200))
  ) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  return {
    allowed: true,
    full_name: value.full_name as string | null,
    channels: parseChannels(value.channels),
  }
}

export function parseContactAccessEnvelope(value: unknown): ContactAccess {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  const rootKeys = Object.keys(value)
  const rootKeysAreSafe = rootKeys.every((key) =>
    ['ok', 'data', 'request_id', 'correlation_id'].includes(key),
  )
  if (!rootKeysAreSafe || !hasExactKeys(value.data, ['contact_access'])) {
    throw new Error('INVALID_CONTACT_RESPONSE')
  }

  return parseContactAccess(value.data.contact_access)
}
