import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { safeTraceId } from './auth-errors'
import type {
  AccessContext,
  AuthAdapter,
  AuthEventName,
  Capability,
  DepartmentStatus,
  InviteMemberInput,
  MemberStatus,
} from './auth-types'

const knownAuthEvents = new Set<AuthEventName>([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'USER_UPDATED',
  'PASSWORD_RECOVERY',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw { code: 'INVALID_ACCESS_CONTEXT' }
  }
  return value
}

function parseCapability(value: unknown): Capability {
  const record = asRecord(value)
  if (!record || typeof record.allowed !== 'boolean') {
    throw { code: 'INVALID_ACCESS_CONTEXT' }
  }
  return {
    allowed: record.allowed,
    reason_code: typeof record.reason_code === 'string' ? record.reason_code : null,
  }
}

function parseAccessContext(value: unknown): AccessContext {
  const record = asRecord(value)
  if (!record) throw { code: 'INVALID_ACCESS_CONTEXT' }

  const memberRecord = record.member === null ? null : asRecord(record.member)
  const departmentRecord = record.primary_department === null ? null : asRecord(record.primary_department)
  const capabilitiesRecord = asRecord(record.capabilities)
  if (!capabilitiesRecord) throw { code: 'INVALID_ACCESS_CONTEXT' }

  const memberStatus = memberRecord ? requiredString(memberRecord, 'status') : null
  const departmentStatus = departmentRecord ? requiredString(departmentRecord, 'status') : null
  if (memberStatus && !['active', 'restricted', 'disabled'].includes(memberStatus)) {
    throw { code: 'INVALID_ACCESS_CONTEXT' }
  }
  if (departmentStatus && !['active', 'inactive'].includes(departmentStatus)) {
    throw { code: 'INVALID_ACCESS_CONTEXT' }
  }

  return {
    schema_version: 1,
    server_now: requiredString(record, 'server_now'),
    auth_user_id: requiredString(record, 'auth_user_id'),
    member: memberRecord
      ? {
          id: requiredString(memberRecord, 'id'),
          display_name: requiredString(memberRecord, 'display_name'),
          status: memberStatus as MemberStatus,
        }
      : null,
    primary_department: departmentRecord
      ? {
          id: requiredString(departmentRecord, 'id'),
          name: requiredString(departmentRecord, 'name'),
          status: departmentStatus as DepartmentStatus,
        }
      : null,
    capabilities: {
      can_access_crm: parseCapability(capabilitiesRecord.can_access_crm),
      can_invite_member: parseCapability(capabilitiesRecord.can_invite_member),
      can_invite_sales: parseCapability(capabilitiesRecord.can_invite_sales),
      can_invite_department_manager: parseCapability(capabilitiesRecord.can_invite_department_manager),
    },
  }
}

interface StableEnvelopeError {
  code: string
  request_id: string | null
  correlation_id?: string | null
}

const businessCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/

function unexpectedEnvelopeError(): StableEnvelopeError {
  return { code: 'UNEXPECTED', request_id: null }
}

function traceIdFrom(
  nested: Record<string, unknown>,
  root: Record<string, unknown>,
  key: 'request_id' | 'correlation_id',
) {
  return safeTraceId(nested[key]) ?? safeTraceId(root[key])
}

function stableEnvelopeError(value: unknown): StableEnvelopeError | null {
  const record = asRecord(value)
  if (record?.ok !== false) return null

  const error = asRecord(record.error)
  const code = error?.code
  if (!error || typeof code !== 'string' || !businessCodePattern.test(code)) {
    return unexpectedEnvelopeError()
  }

  const requestId = traceIdFrom(error, record, 'request_id')
  const correlationId = traceIdFrom(error, record, 'correlation_id')
  return {
    code,
    request_id: requestId,
    ...(correlationId ? { correlation_id: correlationId } : {}),
  }
}

function assertSuccessEnvelope(value: unknown) {
  const record = asRecord(value)
  if (record?.ok === true) return record
  throw stableEnvelopeError(value) ?? unexpectedEnvelopeError()
}

async function throwFunctionInvokeError(error: unknown): Promise<never> {
  if (!(error instanceof FunctionsHttpError)) throw error

  const context = error.context as { json?: () => Promise<unknown> } | null
  if (!context || typeof context.json !== 'function') throw unexpectedEnvelopeError()

  let body: unknown
  try {
    body = await context.json()
  } catch {
    throw unexpectedEnvelopeError()
  }

  throw stableEnvelopeError(body) ?? unexpectedEnvelopeError()
}

export function createSupabaseAuthAdapterFromClient(client: SupabaseClient): AuthAdapter {
  return {
    async getAuthenticatedUser() {
      const { data, error } = await client.auth.getUser()
      if (error) throw error
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
    },
    async getAccessContext() {
      const { data, error } = await client.rpc('get_my_auth_context')
      if (error) throw error
      const envelope = assertSuccessEnvelope(data)
      return parseAccessContext(envelope.data)
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async setPassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) throw error
    },
    async acceptInvitation(invitationId) {
      const { data, error } = await client.rpc('accept_my_invitation', { p_invitation_id: invitationId })
      if (error) throw error
      assertSuccessEnvelope(data)
    },
    async inviteMember(input: InviteMemberInput) {
      const { data, error } = await client.functions.invoke('invite-member', {
        body: {
          email: input.email,
          display_name: input.display_name,
          target_role: input.target_role,
          department_id: input.department_id,
          idempotency_key: input.idempotency_key,
        },
      })
      if (error) await throwFunctionInvokeError(error)
      assertSuccessEnvelope(data)
    },
    async signOutLocal() {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (knownAuthEvents.has(event as AuthEventName)) listener(event as AuthEventName)
      })
      return () => data.subscription.unsubscribe()
    },
  }
}

function createConfigurationErrorAdapter(): AuthAdapter {
  const reject = async () => {
    throw { code: 'CONFIGURATION_INVALID' }
  }
  return {
    getAuthenticatedUser: reject,
    getAccessContext: reject,
    signIn: reject,
    setPassword: reject,
    acceptInvitation: reject,
    inviteMember: reject,
    signOutLocal: reject,
    onAuthStateChange: () => () => undefined,
  }
}

export function createSupabaseAuthAdapter(): AuthAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const environment = import.meta.env.VITE_APP_ENV

  if (
    !['development', 'test', 'production'].includes(environment) ||
    typeof url !== 'string' ||
    !/^https?:\/\//.test(url) ||
    typeof publishableKey !== 'string' ||
    !publishableKey.startsWith('sb_publishable_')
  ) {
    return createConfigurationErrorAdapter()
  }

  return createSupabaseAuthAdapterFromClient(
    createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    }),
  )
}
