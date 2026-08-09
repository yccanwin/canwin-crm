export const DEFAULT_RETURN_TO = '/'
export const RETURN_TO_STORAGE_KEY = 'canwin.crm.return_to'

const maximumReturnToLength = 512
function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function decodeCandidate(candidate: string) {
  try {
    return decodeURIComponent(candidate)
  } catch {
    return null
  }
}

export function sanitizeReturnTo(candidate: string | null | undefined) {
  if (!candidate || candidate.length > maximumReturnToLength || hasControlCharacter(candidate)) {
    return DEFAULT_RETURN_TO
  }

  const decoded = decodeCandidate(candidate)
  if (!decoded || hasControlCharacter(decoded) || decoded.includes('\\') || decoded.startsWith('//')) {
    return DEFAULT_RETURN_TO
  }

  let target: URL
  try {
    target = new URL(decoded, 'https://crm.invalid')
  } catch {
    return DEFAULT_RETURN_TO
  }

  if (
    target.origin !== 'https://crm.invalid' ||
    target.username !== '' ||
    target.password !== '' ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    return DEFAULT_RETURN_TO
  }

  // WBS 1.5 only has one protected route. New business routes must be added here explicitly.
  return target.pathname === '/' ? '/' : DEFAULT_RETURN_TO
}

export function storeReturnTo(candidate: string | null | undefined) {
  const safeTarget = sanitizeReturnTo(candidate)
  try {
    window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, safeTarget)
  } catch {
    // A disabled storage API must not block authentication.
  }
  return safeTarget
}

export function consumeReturnTo(candidate?: string | null) {
  const explicitTarget = sanitizeReturnTo(candidate)
  if (candidate && explicitTarget !== DEFAULT_RETURN_TO) {
    try {
      window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY)
    } catch {
      // A disabled storage API must not block authentication.
    }
    return explicitTarget
  }

  try {
    const storedTarget = window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY)
    window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY)
    return sanitizeReturnTo(storedTarget)
  } catch {
    return DEFAULT_RETURN_TO
  }
}

export function clearReturnTo() {
  try {
    window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY)
  } catch {
    // A disabled storage API must not block authentication.
  }
}

export function returnToFromCurrentLocation() {
  return sanitizeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`)
}

export function returnToFromLoginQuery() {
  return sanitizeReturnTo(new URLSearchParams(window.location.search).get('return_to'))
}
