import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

function throwEnvelope(value: unknown) {
  const record = asRecord(value)
  const error = asRecord(record?.error)
  if (record?.ok === false && error) {
    throw {
      code: typeof error.code === 'string' ? error.code : 'UNEXPECTED',
      request_id: typeof error.request_id === 'string' ? error.request_id : null,
    }
  }
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
      throwEnvelope(data)
      return parseAccessContext(asRecord(data)?.data)
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
      throwEnvelope(data)
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
      if (error) throw error
      throwEnvelope(data)
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
