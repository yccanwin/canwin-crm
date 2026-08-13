import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PortraitEvidencePanel } from '../portrait/PortraitEvidencePanel'
import {
  PORTRAIT_EVIDENCE_SCENARIOS,
  type PortraitEvidenceScenario,
} from '../portrait/portrait-evidence-scenarios'
import '../styles.css'

function scenarioFromUrl(): PortraitEvidenceScenario {
  const requested = new URLSearchParams(window.location.search).get('scenario')
  return PORTRAIT_EVIDENCE_SCENARIOS.includes(requested as PortraitEvidenceScenario)
    ? requested as PortraitEvidenceScenario
    : 'types'
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing evidence root')

createRoot(root).render(
  <StrictMode>
    <main className="auth-shell" data-evidence-viewport="360x800">
      <PortraitEvidencePanel scenario={scenarioFromUrl()} />
    </main>
  </StrictMode>,
)
