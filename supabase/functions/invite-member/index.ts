import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

type JsonObject = Record<string, unknown>

type InvitationRequest = {
  email?: unknown
  display_name?: unknown
  department_id?: unknown
  target_role?: unknown
  idempotency_key?: unknown
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function environmentValue(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function keyFromDictionary(name: string, localFallbackName: string): string {
  const dictionary = Deno.env.get(name)?.trim()
  if (dictionary) {
    const parsed = JSON.parse(dictionary) as Record<string, unknown>
    const primary = parsed.primary ?? parsed.default
    if (typeof primary === 'string' && primary.length > 0) return primary
    const first = Object.values(parsed).find((value) => typeof value === 'string' && value.length > 0)
    if (typeof first === 'string') return first
    throw new Error(`Missing key in ${name}`)
  }

  const supabaseUrl = new URL(environmentValue('SUPABASE_URL'))
  if (!['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname)) {
    throw new Error(`Missing ${name}`)
  }

  return environmentValue(localFallbackName)
}

function allowedOrigins(): string[] {
  const configuredOrigins = Deno.env.get('CANWIN_APP_ORIGINS')?.trim()
  if (!configuredOrigins) {
    const supabaseUrl = new URL(environmentValue('SUPABASE_URL'))
    if (['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname)) {
      return ['http://127.0.0.1:4173']
    }
    throw new Error('Missing CANWIN_APP_ORIGINS')
  }

  const parsed = JSON.parse(configuredOrigins) as unknown
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
    throw new Error('Invalid CANWIN_APP_ORIGINS')
  }
  return parsed.map((value) => new URL(value).origin)
}

function corsHeaders(origin: string | null, allowList: string[]): Record<string, string> {
  if (!origin || !allowList.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  }
}

function envelope(code: string, requestId: string, safeParams: JsonObject = {}): JsonObject {
  return {
    code,
    message_key: `auth.${code.toLowerCase()}`,
    safe_params: safeParams,
    request_id: requestId,
  }
}

function respond(
  body: JsonObject,
  status: number,
  requestId: string,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...cors, 'x-request-id': requestId },
  })
}

function statusFor(code: string): number {
  if (code === 'AUTH_REQUIRED' || code === 'SESSION_INVALID') return 401
  if (code === 'FORBIDDEN' || code === 'MEMBERSHIP_INACTIVE') return 403
  if (code === 'IDEMPOTENCY_CONFLICT' || code === 'INVITATION_ALREADY_PENDING') return 409
  if (code === 'INVALID_REQUEST') return 400
  return 422
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID()

  let origins: string[]
  try {
    origins = allowedOrigins()
  } catch {
    return respond({ ok: false, error: envelope('CONFIGURATION_INVALID', requestId) }, 500, requestId, {})
  }

  const requestOrigin = request.headers.get('origin')
  const cors = corsHeaders(requestOrigin, origins)
  if (requestOrigin && !origins.includes(requestOrigin)) {
    return respond({ ok: false, error: envelope('ORIGIN_NOT_ALLOWED', requestId) }, 403, requestId, {})
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') {
    return respond({ ok: false, error: envelope('METHOD_NOT_ALLOWED', requestId) }, 405, requestId, cors)
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) {
    return respond({ ok: false, error: envelope('AUTH_REQUIRED', requestId) }, 401, requestId, cors)
  }

  let body: InvitationRequest
  try {
    body = await request.json() as InvitationRequest
  } catch {
    return respond({ ok: false, error: envelope('INVALID_REQUEST', requestId) }, 400, requestId, cors)
  }

  if (
    typeof body.email !== 'string' ||
    typeof body.display_name !== 'string' ||
    (typeof body.department_id !== 'string' && typeof body.department_id !== 'number') ||
    (body.target_role !== 'sales' && body.target_role !== 'department_manager') ||
    typeof body.idempotency_key !== 'string'
  ) {
    return respond({ ok: false, error: envelope('INVALID_REQUEST', requestId) }, 400, requestId, cors)
  }

  let supabaseUrl: string
  let publishableKey: string
  let secretKey: string
  try {
    supabaseUrl = environmentValue('SUPABASE_URL')
    publishableKey = keyFromDictionary('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY')
    secretKey = keyFromDictionary('SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY')
  } catch {
    return respond({ ok: false, error: envelope('CONFIGURATION_INVALID', requestId) }, 500, requestId, cors)
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  })

  const { error: userError } = await adminClient.auth.getUser(accessToken)
  if (userError) {
    return respond({ ok: false, error: envelope('SESSION_INVALID', requestId) }, 401, requestId, cors)
  }

  const { data: prepared, error: prepareError } = await callerClient.rpc('prepare_member_invitation', {
    p_department_id: String(body.department_id),
    p_display_name: body.display_name,
    p_email: body.email,
    p_idempotency_key: body.idempotency_key,
    p_target_role: body.target_role,
  })

  if (prepareError || !prepared || typeof prepared !== 'object') {
    return respond({ ok: false, error: envelope('UNEXPECTED', requestId) }, 500, requestId, cors)
  }

  const preparation = prepared as { ok?: boolean; data?: JsonObject; error?: { code?: string } }
  if (!preparation.ok) {
    const code = preparation.error?.code ?? 'UNEXPECTED'
    return respond({ ok: false, error: envelope(code, requestId) }, statusFor(code), requestId, cors)
  }

  const invitationId = preparation.data?.invitation_id
  if (typeof invitationId !== 'string') {
    return respond({ ok: false, error: envelope('UNEXPECTED', requestId) }, 500, requestId, cors)
  }

  const redirectOrigin = requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0]
  const redirectUrl = new URL('/invite/accept', redirectOrigin)
  redirectUrl.searchParams.set('invitation_id', invitationId)

  const { data: invited, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(
    body.email.trim().toLowerCase(),
    { redirectTo: redirectUrl.toString() },
  )

  const deliveryCode = invitationError ? `AUTH_${invitationError.status ?? 'DELIVERY_FAILED'}` : null
  const { data: completed, error: completeError } = await adminClient.rpc('complete_member_invitation_delivery', {
    p_invited_auth_user_id: invited?.user?.id ?? null,
    p_delivered: !invitationError,
    p_error_code: deliveryCode,
    p_invitation_id: invitationId,
  })

  if (completeError || !completed || typeof completed !== 'object') {
    return respond({ ok: false, error: envelope('INVITATION_DELIVERY_STATE_FAILED', requestId) }, 500, requestId, cors)
  }

  const completion = completed as {
    ok?: unknown
    data?: { status?: unknown }
    error?: { code?: unknown }
  }

  if (invitationError) {
    if (completion.ok !== true || completion.data?.status !== 'delivery_failed') {
      return respond({ ok: false, error: envelope('INVITATION_DELIVERY_STATE_FAILED', requestId) }, 500, requestId, cors)
    }
    return respond({ ok: false, error: envelope('INVITATION_DELIVERY_FAILED', requestId) }, 502, requestId, cors)
  }

  if (completion.ok !== true || completion.data?.status !== 'sent') {
    return respond({ ok: false, error: envelope('INVITATION_DELIVERY_STATE_FAILED', requestId) }, 500, requestId, cors)
  }

  return respond({ ok: true, data: { invitation_id: invitationId, status: 'sent' } }, 201, requestId, cors)
})
