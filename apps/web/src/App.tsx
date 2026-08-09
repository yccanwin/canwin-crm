import { useEffect } from 'react'
import { createSupabaseAuthAdapter } from './auth/auth-adapter'
import { useAuth } from './auth/auth-context'
import { AuthProvider } from './auth/AuthProvider'
import {
  consumeReturnTo,
  returnToFromCurrentLocation,
  returnToFromLoginQuery,
  storeReturnTo,
} from './auth/return-to'
import type { AuthAdapter } from './auth/auth-types'
import { AccessBlockedPage } from './pages/AccessBlockedPage'
import { HomePage } from './pages/HomePage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { LoginPage } from './pages/LoginPage'
import { LoadingPage, RetryPage } from './pages/StatusPage'
import { navigateTo, useAppRoute } from './router'

const defaultAdapter = createSupabaseAuthAdapter()

function AppContent() {
  const route = useAppRoute()
  const { status } = useAuth()

  useEffect(() => {
    if (status === 'signed_out') {
      if (route === 'home' || route === 'not_found') {
        const safeTarget = storeReturnTo(returnToFromCurrentLocation())
        navigateTo(`/login?return_to=${encodeURIComponent(safeTarget)}`, true)
      } else if (route === 'login') {
        storeReturnTo(returnToFromLoginQuery())
      }
      return
    }

    if (status === 'invite_required' && route !== 'invite_accept') {
      navigateTo('/invite/accept', true)
      return
    }

    if (status === 'active' && route !== 'home') {
      const target = consumeReturnTo(route === 'login' ? returnToFromLoginQuery() : null)
      navigateTo(target, true)
    }
  }, [route, status])

  if (status === 'loading' || status === 'resolving_access' || status === 'signing_out') {
    return <LoadingPage />
  }
  if (status === 'retryable_error') return <RetryPage />
  if (status === 'blocked') return <AccessBlockedPage />
  if (status === 'invite_required' || status === 'setting_password' || status === 'accepting_invite') {
    return <InviteAcceptPage />
  }
  if (status === 'active') return <HomePage />
  return <LoginPage />
}

function App({ adapter = defaultAdapter }: { adapter?: AuthAdapter }) {
  return (
    <AuthProvider adapter={adapter}>
      <AppContent />
    </AuthProvider>
  )
}

export default App
