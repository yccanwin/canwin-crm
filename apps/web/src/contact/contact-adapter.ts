import type { ContactAccess } from './contact-contract'
import { isContactPublicId, parseContactAccessEnvelope } from './contact-contract'
import { normalizeContactError, safeContactError } from './contact-errors'

export const CONTACT_READ_RPC_NAME = 'read_contact_secret'

export interface ContactReadInput {
  contact_public_id: string
  reason: string
}

export interface ContactAdapter {
  readSensitiveContact(input: ContactReadInput): Promise<ContactAccess>
}

export interface ContactRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

function isSafeReason(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const characterCount = [...normalized].length
  const hasControlCharacter =
    typeof value === 'string' && [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  return (
    typeof value === 'string' &&
    characterCount > 0 &&
    characterCount <= 500 &&
    !hasControlCharacter
  )
}

function errorFromEnvelope(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const envelope = value as Record<string, unknown>
  if (envelope.ok !== false || typeof envelope.error !== 'object' || envelope.error === null) return null
  const error = envelope.error as Record<string, unknown>
  return safeContactError(
    typeof error.code === 'string' ? error.code : 'UNEXPECTED',
    error.request_id,
    error.correlation_id,
  )
}

export function createContactAdapter(rpcClient: ContactRpcClient): ContactAdapter {
  return {
    async readSensitiveContact(input) {
      if (!isContactPublicId(input.contact_public_id)) throw safeContactError('INVALID_CONTACT_ID')
      if (!isSafeReason(input.reason)) throw safeContactError('INVALID_ACCESS_REASON')

      try {
        const { data, error } = await rpcClient.rpc(CONTACT_READ_RPC_NAME, {
          p_contact_public_id: input.contact_public_id,
          p_reason: input.reason.trim(),
        })
        if (error) throw normalizeContactError(error)

        const envelopeError = errorFromEnvelope(data)
        if (envelopeError) throw envelopeError

        return parseContactAccessEnvelope(data)
      } catch (error) {
        throw normalizeContactError(error, 'INVALID_CONTACT_RESPONSE')
      }
    },
  }
}
