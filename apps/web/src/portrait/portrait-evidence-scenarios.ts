export const PORTRAIT_EVIDENCE_SCENARIOS = [
  'types',
  'clear',
  'unsupported',
  'inactive-history',
  'derived',
  'department-switch',
  'error',
] as const

export type PortraitEvidenceScenario = (typeof PORTRAIT_EVIDENCE_SCENARIOS)[number]
