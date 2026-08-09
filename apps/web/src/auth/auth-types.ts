export type MemberStatus = 'active' | 'restricted' | 'disabled'

export type DepartmentStatus = 'active' | 'inactive'

export interface Capability {
  allowed: boolean
  reason_code: string | null
}

export interface AccessContext {
  schema_version: 1
  server_now: string
  auth_user_id: string
  member: {
    id: string
    display_name: string
    status: MemberStatus
  } | null
  primary_department: {
    id: string
    name: string
    status: DepartmentStatus
  } | null
  capabilities: {
    can_access_crm: Capability
    can_invite_member: Capability
    can_invite_sales: Capability
    can_invite_department_manager: Capability
  }
}

export interface AuthenticatedUser {
  id: string
  email: string | null
}

export type AuthEventName =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'

export interface InviteMemberInput {
  email: string
  display_name: string
  target_role: 'sales' | 'department_manager'
  department_id: string
  idempotency_key: string
}

export interface AuthAdapter {
  getAuthenticatedUser(): Promise<AuthenticatedUser | null>
  getAccessContext(): Promise<AccessContext>
  signIn(email: string, password: string): Promise<void>
  setPassword(password: string): Promise<void>
  acceptInvitation(invitationId: string): Promise<void>
  inviteMember(input: InviteMemberInput): Promise<void>
  signOutLocal(): Promise<void>
  onAuthStateChange(listener: (event: AuthEventName) => void): () => void
}

export interface SafeAuthError {
  code: string
  message_key: string
  message: string
  recovery: string
  request_id: string | null
  correlation_id?: string | null
}

export type AuthStatus =
  | 'loading'
  | 'signed_out'
  | 'signing_in'
  | 'resolving_access'
  | 'active'
  | 'invite_required'
  | 'setting_password'
  | 'accepting_invite'
  | 'signing_out'
  | 'blocked'
  | 'retryable_error'

export interface AuthState {
  status: AuthStatus
  context: AccessContext | null
  error: SafeAuthError | null
}
