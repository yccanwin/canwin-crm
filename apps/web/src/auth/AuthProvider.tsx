import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'
import { normalizeAuthError } from './auth-errors'
import { authMachine, initialAuthState } from './auth-machine'
import { invitationIdFromLocation } from './invitation'
import { clearReturnTo, returnToFromCurrentLocation, storeReturnTo } from './return-to'
import type { AuthAdapter, InviteMemberInput } from './auth-types'

function clearSensitiveClientState() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index)
        if (key?.startsWith('canwin.crm.sensitive.')) storage.removeItem(key)
      }
    } catch {
      // Storage availability must not block logout or revocation handling.
    }
  }
}

export function AuthProvider({ adapter, children }: { adapter: AuthAdapter; children: ReactNode }) {
  const [state, dispatch] = useReducer(authMachine, initialAuthState)
  const mounted = useRef(true)
  const explicitSignOut = useRef(false)

  const resolveAccess = useCallback(
    async (expiredWhenMissing = false) => {
      dispatch({ type: 'ACCESS_STARTED' })
      try {
        const user = await adapter.getAuthenticatedUser()
        if (!mounted.current) return
        if (!user) {
          dispatch({ type: 'SESSION_MISSING', expired: expiredWhenMissing })
          return
        }
        const context = await adapter.getAccessContext()
        if (mounted.current) {
          dispatch({ type: 'ACCESS_RESOLVED', context, invitationPending: Boolean(invitationIdFromLocation()) })
        }
      } catch (error) {
        if (!mounted.current) return
        const safeError = normalizeAuthError(error, expiredWhenMissing ? 'SESSION_EXPIRED' : 'UNEXPECTED')
        dispatch({ type: 'OPERATION_FAILED', error: safeError, resume: 'signed_out' })
      }
    },
    [adapter],
  )

  useEffect(() => {
    mounted.current = true
    void resolveAccess(false)
    const unsubscribe = adapter.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearSensitiveClientState()
        if (!explicitSignOut.current) storeReturnTo(returnToFromCurrentLocation())
        explicitSignOut.current = false
        dispatch({ type: 'SESSION_MISSING', expired: true })
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Supabase calls are deliberately deferred outside the auth callback.
        queueMicrotask(() => {
          if (mounted.current) void resolveAccess(true)
        })
      }
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [adapter, resolveAccess])

  const login = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: 'SIGN_IN_STARTED' })
      try {
        await adapter.signIn(email.trim(), password)
        await resolveAccess(false)
        return true
      } catch (error) {
        const safeError = normalizeAuthError(error, 'INVALID_CREDENTIALS')
        dispatch({ type: 'OPERATION_FAILED', error: safeError, resume: 'signed_out' })
        return false
      }
    },
    [adapter, resolveAccess],
  )

  const acceptInvite = useCallback(
    async (password: string, invitationId: string) => {
      dispatch({ type: 'PASSWORD_STARTED' })
      try {
        await adapter.setPassword(password)
        dispatch({ type: 'INVITE_ACCEPT_STARTED' })
        await adapter.acceptInvitation(invitationId)
        await resolveAccess(false)
        return true
      } catch (error) {
        const safeError = normalizeAuthError(error, 'INVITATION_INVALID')
        dispatch({ type: 'OPERATION_FAILED', error: safeError, resume: 'invite_required' })
        return false
      }
    },
    [adapter, resolveAccess],
  )

  const inviteMember = useCallback(
    async (input: InviteMemberInput) => {
      try {
        await adapter.inviteMember(input)
        return null
      } catch (error) {
        return normalizeAuthError(error, 'INVITE_MEMBER_FAILED')
      }
    },
    [adapter],
  )

  const signOut = useCallback(async () => {
    explicitSignOut.current = true
    clearReturnTo()
    clearSensitiveClientState()
    dispatch({ type: 'SIGN_OUT_STARTED' })
    try {
      await adapter.signOutLocal()
    } catch (error) {
      explicitSignOut.current = false
      const safeError = normalizeAuthError(error)
      dispatch({ type: 'OPERATION_FAILED', error: safeError, resume: 'signed_out' })
      return
    }
    dispatch({ type: 'SESSION_MISSING', expired: false })
  }, [adapter])

  const retry = useCallback(async () => {
    dispatch({ type: 'LOAD_STARTED' })
    await resolveAccess(false)
  }, [resolveAccess])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, acceptInvite, inviteMember, signOut, retry }),
    [state, login, acceptInvite, inviteMember, signOut, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
