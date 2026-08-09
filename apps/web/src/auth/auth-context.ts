import { createContext, useContext } from 'react'
import type { AuthState, InviteMemberInput, SafeAuthError } from './auth-types'

export interface AuthContextValue extends AuthState {
  login(email: string, password: string): Promise<boolean>
  acceptInvite(password: string, invitationId: string): Promise<boolean>
  inviteMember(input: InviteMemberInput): Promise<SafeAuthError | null>
  signOut(): Promise<void>
  retry(): Promise<void>
}
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用。')
  return value
}
