const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function invitationIdFromLocation() {
  const value = new URLSearchParams(window.location.search).get('invitation_id')
  return value && uuidPattern.test(value) ? value : null
}
