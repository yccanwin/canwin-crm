import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ContactSensitivePanelView } from '../contact/ContactSensitivePanel'
import { safeContactError } from '../contact/contact-errors'
import { contactViewMachine, initialContactViewState, type ContactViewState } from '../contact/contact-state'
import '../styles.css'

type Scenario = 'locked' | 'reason' | 'loading' | 'empty' | 'error'

const structure = {
  public_id: '00000000-0000-4000-8000-000000000022',
  store_id: 22,
  role_label: '负责人',
  is_primary: true,
  status: 'active' as const,
  version: 1,
}

const locked = contactViewMachine(initialContactViewState, { type: 'STRUCTURE_LOADED', structure })

function scenarioFromUrl(): Scenario {
  const value = new URLSearchParams(window.location.search).get('scenario')
  return value === 'reason' || value === 'loading' || value === 'empty' || value === 'error'
    ? value
    : 'locked'
}

function stateForScenario(scenario: Scenario): ContactViewState {
  if (scenario === 'reason') return contactViewMachine(locked, { type: 'REASON_REQUESTED' })
  if (scenario === 'loading') {
    return contactViewMachine(locked, { type: 'ACCESS_REQUESTED', request_id: 'synthetic-request' })
  }
  if (scenario === 'empty') {
    const loading = contactViewMachine(locked, { type: 'ACCESS_REQUESTED', request_id: 'synthetic-request' })
    return contactViewMachine(loading, {
      type: 'ACCESS_RESOLVED',
      request_id: 'synthetic-request',
      access: { allowed: true, full_name: null, channels: [] },
    })
  }
  if (scenario === 'error') {
    return { ...locked, status: 'error', error: safeContactError('UNEXPECTED') }
  }
  return locked
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing evidence root')

createRoot(root).render(
  <StrictMode>
    <main className="auth-shell" data-evidence-viewport="360x800">
      <ContactSensitivePanelView
        state={stateForScenario(scenarioFromUrl())}
        reason="合成质检理由"
        onOpenReason={() => undefined}
        onReasonChange={() => undefined}
        onSubmitReason={() => undefined}
        onRetry={() => undefined}
      />
    </main>
  </StrictMode>,
)
