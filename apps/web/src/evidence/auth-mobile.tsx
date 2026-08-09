import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AuthContextValue } from '../auth/auth-context'
import type { AccessContext, AuthStatus, SafeAuthError } from '../auth/auth-types'
import { HomePage } from '../pages/HomePage'
import { InviteAcceptPage } from '../pages/InviteAcceptPage'
import { LoginPage } from '../pages/LoginPage'
import '../styles.css'

type Scenario = 'login' | 'invite' | 'home'

const SYNTHETIC_INVITATION_ID = '00000000-0000-4000-8000-000000000015'
const SYNTHETIC_USER_ID = '00000000-0000-4000-8000-000000000101'

const invitationContext: AccessContext = {
  schema_version: 1,
  server_now: '2026-08-10T00:00:00.000Z',
  auth_user_id: SYNTHETIC_USER_ID,
  member: null,
  primary_department: null,
  capabilities: {
    can_access_crm: { allowed: false, reason_code: 'INVITATION_REQUIRED' },
    can_invite_member: { allowed: false, reason_code: 'INVITATION_REQUIRED' },
    can_invite_sales: { allowed: false, reason_code: 'INVITATION_REQUIRED' },
    can_invite_department_manager: {
      allowed: false,
      reason_code: 'INVITATION_REQUIRED',
    },
  },
}

const homeContext: AccessContext = {
  schema_version: 1,
  server_now: '2026-08-10T00:00:00.000Z',
  auth_user_id: SYNTHETIC_USER_ID,
  member: {
    id: '00000000-0000-4000-8000-000000000201',
    display_name: '示例销售主管',
    status: 'active',
  },
  primary_department: {
    id: '00000000-0000-4000-8000-000000000301',
    name: '示例销售部',
    status: 'active',
  },
  capabilities: {
    can_access_crm: { allowed: true, reason_code: null },
    can_invite_member: { allowed: true, reason_code: null },
    can_invite_sales: { allowed: true, reason_code: null },
    can_invite_department_manager: {
      allowed: false,
      reason_code: 'ROLE_NOT_ALLOWED',
    },
  },
}

function getScenario(): Scenario {
  const value = new URLSearchParams(window.location.search).get('scenario')
  return value === 'invite' || value === 'home' ? value : 'login'
}

function prepareFixtureUrl(scenario: Scenario) {
  const url = new URL(window.location.href)
  if (scenario === 'invite') {
    url.searchParams.set('invitation_id', SYNTHETIC_INVITATION_ID)
  } else {
    url.searchParams.delete('invitation_id')
  }
  window.history.replaceState(null, '', url)
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

function initialStatus(scenario: Scenario): AuthStatus {
  if (scenario === 'invite') return 'invite_required'
  if (scenario === 'home') return 'active'
  return 'signed_out'
}

export function AuthMobileEvidence() {
  const initialScenario = getScenario()
  const [view, setView] = useState<Scenario>(initialScenario)
  const [status, setStatus] = useState<AuthStatus>(() => initialStatus(initialScenario))
  const [error, setError] = useState<SafeAuthError | null>(null)

  const context =
    view === 'home' ? homeContext : view === 'invite' ? invitationContext : null

  const value: AuthContextValue = {
    status,
    context,
    error,
    async login() {
      setError(null)
      setStatus('signing_in')
      await wait(500)
      setStatus('resolving_access')
      await wait(500)
      setView('home')
      setStatus('active')
      return true
    },
    async acceptInvite(password, invitationId) {
      if (password.length < 8 || invitationId !== SYNTHETIC_INVITATION_ID) {
        setError({
          code: 'FIXTURE_VALIDATION_FAILED',
          message_key: 'auth.invitation.invalid',
          message: '请检查邀请信息和密码后重试。',
          recovery: '请使用固定演示邀请并输入至少 8 位密码。',
          request_id: null,
        })
        return false
      }

      setError(null)
      setStatus('setting_password')
      await wait(700)
      setStatus('accepting_invite')
      await wait(900)
      setView('home')
      setStatus('active')
      return true
    },
    async inviteMember() {
      setError(null)
      await wait(500)
      return null
    },
    async signOut() {
      setError(null)
      setStatus('signing_out')
      await wait(450)
      setView('login')
      setStatus('signed_out')
    },
    async retry() {
      setError(null)
      setStatus(initialStatus(view))
    },
  }

  return (
    <AuthContext.Provider value={value}>
      <div data-evidence-fixture="auth-mobile" data-scenario={view}>
        {view === 'login' ? (
          <LoginPage />
        ) : view === 'invite' ? (
          <InviteAcceptPage />
        ) : (
          <HomePage />
        )}
      </div>
    </AuthContext.Provider>
  )
}

const scenario = getScenario()
prepareFixtureUrl(scenario)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthMobileEvidence />
  </StrictMode>,
)
