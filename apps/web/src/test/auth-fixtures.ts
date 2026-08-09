import { vi } from 'vitest'
import type { AccessContext, AuthAdapter, AuthEventName } from '../auth/auth-types'

export function accessContext({
  memberStatus = 'active',
  departmentStatus = 'active',
  canAccess = true,
  canInvite = false,
  canInviteSales = false,
  canInviteManager = false,
}: {
  memberStatus?: 'active' | 'restricted' | 'disabled'
  departmentStatus?: 'active' | 'inactive'
  canAccess?: boolean
  canInvite?: boolean
  canInviteSales?: boolean
  canInviteManager?: boolean
} = {}): AccessContext {
  return {
    schema_version: 1,
    server_now: '2026-08-09T10:00:00.000Z',
    auth_user_id: '11111111-1111-4111-8111-111111111111',
    member: {
      id: '22222222-2222-4222-8222-222222222222',
      display_name: '测试成员',
      status: memberStatus,
    },
    primary_department: {
      id: '33333333-3333-4333-8333-333333333333',
      name: '测试部门',
      status: departmentStatus,
    },
    capabilities: {
      can_access_crm: { allowed: canAccess, reason_code: canAccess ? null : 'MEMBERSHIP_RESTRICTED' },
      can_invite_member: { allowed: canInvite, reason_code: canInvite ? null : 'FORBIDDEN' },
      can_invite_sales: { allowed: canInviteSales, reason_code: canInviteSales ? null : 'FORBIDDEN' },
      can_invite_department_manager: { allowed: canInviteManager, reason_code: canInviteManager ? null : 'FORBIDDEN' },
    },
  }
}

export function fakeAuthAdapter({
  authenticated = true,
  context = accessContext(),
}: {
  authenticated?: boolean
  context?: AccessContext
} = {}) {
  let hasAuthenticatedUser = authenticated
  const listeners = new Set<(event: AuthEventName) => void>()
  const getAuthenticatedUser = vi.fn(async () =>
    hasAuthenticatedUser ? { id: context.auth_user_id, email: 'member@example.com' } : null,
  )
  const getAccessContext = vi.fn(async () => context)
  const signIn = vi.fn(async () => undefined)
  const setPassword = vi.fn(async () => undefined)
  const acceptInvitation = vi.fn(async (invitationId: string) => {
    void invitationId
  })
  const inviteMember = vi.fn(async (): Promise<void> => undefined)
  const signOutLocal = vi.fn(async () => undefined)
  const onAuthStateChange = vi.fn((listener: (event: AuthEventName) => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  })

  const adapter: AuthAdapter = {
    getAuthenticatedUser,
    getAccessContext,
    signIn,
    setPassword,
    acceptInvitation,
    inviteMember,
    signOutLocal,
    onAuthStateChange,
  }

  return {
    adapter,
    acceptInvitation,
    emit(event: AuthEventName) {
      for (const listener of listeners) listener(event)
    },
    getAccessContext,
    getAuthenticatedUser,
    inviteMember,
    setAuthenticated(value: boolean) {
      hasAuthenticatedUser = value
    },
    setPassword,
    signIn,
    signOutLocal,
  }
}
