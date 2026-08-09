#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const apiUrl = process.env.CANWIN_TEST_API_URL
const publishableKey = process.env.CANWIN_TEST_PUBLISHABLE_KEY
const secretKey = process.env.CANWIN_TEST_SECRET_KEY
const functionUrl = process.env.CANWIN_TEST_FUNCTION_URL

if (typeof apiUrl !== 'string') {
  throw new Error('CANWIN_TEST_API_URL is required for local Auth runtime verification.')
}
const parsedApiUrl = new URL(apiUrl)
if (!['127.0.0.1', 'localhost'].includes(parsedApiUrl.hostname)) {
  throw new Error('Auth runtime verification refuses non-local Supabase projects.')
}
if (typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) {
  throw new Error('CANWIN_TEST_PUBLISHABLE_KEY is unavailable or invalid.')
}
if (typeof secretKey !== 'string' || !secretKey.startsWith('sb_secret_')) {
  throw new Error('CANWIN_TEST_SECRET_KEY is unavailable or invalid.')
}
if (typeof functionUrl !== 'string') {
  throw new Error('CANWIN_TEST_FUNCTION_URL is required for local Auth runtime verification.')
}
const parsedFunctionUrl = new URL(functionUrl)
if (
  !['127.0.0.1', 'localhost'].includes(parsedFunctionUrl.hostname) ||
  parsedFunctionUrl.pathname !== '/functions/v1/invite-member'
) {
  throw new Error('Auth runtime verification refuses a non-local or unexpected Edge Function URL.')
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(apiUrl, secretKey, clientOptions)
const publicClient = createClient(apiUrl, publishableKey, clientOptions)
const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const password = `Cw-${crypto.randomUUID()}-9a`
let assertions = 0

function assert(condition, label) {
  if (!condition) throw new Error(`Auth runtime assertion failed: ${label}`)
  assertions += 1
}

function safeFailure(operation, error) {
  const code = typeof error?.code === 'string' ? error.code : null
  const status = typeof error?.status === 'number' ? error.status : null
  throw new Error(`${operation} failed (${code ?? status ?? 'unknown'}).`)
}

async function createAuthUser(label, userMetadata = {}) {
  const email = `${label}.${runId}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  })
  if (error || !data.user) safeFailure(`create ${label} user`, error)
  return { email, id: data.user.id }
}

async function signIn(email) {
  const client = createClient(apiUrl, publishableKey, clientOptions)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) safeFailure('password sign-in', error)
  return { client, session: data.session }
}

function rpcData(result, label) {
  if (result.error) safeFailure(label, result.error)
  assert(result.data?.ok === true, `${label} returns success envelope`)
  return result.data.data
}

function rpcError(result, expectedCode, label) {
  if (result.error) safeFailure(label, result.error)
  assert(result.data?.ok === false, `${label} returns error envelope`)
  assert(result.data?.error?.code === expectedCode, `${label} returns ${expectedCode}`)
}

const signupEmail = `signup.${runId}@example.com`
const signup = await publicClient.auth.signUp({ email: signupEmail, password })
assert(Boolean(signup.error), 'public email signup is disabled')

const departmentInsert = await admin
  .from('departments')
  .insert([
    { code: `dept-a-${runId}`.slice(0, 62), name: 'Synthetic Department A' },
    { code: `dept-b-${runId}`.slice(0, 62), name: 'Synthetic Department B' },
  ])
  .select('id,code')
if (departmentInsert.error || departmentInsert.data?.length !== 2) {
  safeFailure('create synthetic departments', departmentInsert.error)
}
const departmentA = departmentInsert.data.find((item) => item.code.startsWith('dept-a-'))
const departmentB = departmentInsert.data.find((item) => item.code.startsWith('dept-b-'))
assert(Boolean(departmentA && departmentB), 'two isolated departments exist')

const superAdminUser = await createAuthUser('sa')
const managerUser = await createAuthUser('manager-a')
const salesUser = await createAuthUser('sales-a', {
  role: 'super_admin',
  primary_department_id: String(departmentB.id),
})

const memberInsert = await admin
  .from('members')
  .insert([
    {
      auth_user_id: superAdminUser.id,
      primary_department_id: departmentA.id,
      role: 'super_admin',
      status: 'active',
      accepted_at: new Date().toISOString(),
    },
    {
      auth_user_id: managerUser.id,
      primary_department_id: departmentA.id,
      role: 'department_manager',
      status: 'active',
      accepted_at: new Date().toISOString(),
    },
    {
      auth_user_id: salesUser.id,
      primary_department_id: departmentA.id,
      role: 'sales',
      status: 'active',
      accepted_at: new Date().toISOString(),
    },
  ])
  .select('id,auth_user_id')
if (memberInsert.error || memberInsert.data?.length !== 3) {
  safeFailure('create synthetic members', memberInsert.error)
}
const superAdminMember = memberInsert.data.find((item) => item.auth_user_id === superAdminUser.id)
const managerMember = memberInsert.data.find((item) => item.auth_user_id === managerUser.id)
const salesMember = memberInsert.data.find((item) => item.auth_user_id === salesUser.id)
assert(Boolean(superAdminMember && managerMember && salesMember), 'synthetic role members exist')

const profileInsert = await admin.from('member_profiles').insert([
  { member_id: superAdminMember.id, display_name: 'Synthetic SA' },
  { member_id: managerMember.id, display_name: 'Synthetic Manager A' },
  { member_id: salesMember.id, display_name: 'Synthetic Sales A' },
])
if (profileInsert.error) safeFailure('create synthetic member profiles', profileInsert.error)

const managerLogin = await signIn(managerUser.email)
const salesLogin = await signIn(salesUser.email)
const superAdminLogin = await signIn(superAdminUser.email)

const managerContext = rpcData(
  await managerLogin.client.rpc('get_my_auth_context'),
  'manager access context',
)
assert(managerContext.member.role === 'department_manager', 'manager role comes from authoritative member row')
assert(managerContext.capabilities.can_invite_sales.allowed === true, 'manager can invite sales')
assert(managerContext.capabilities.can_invite_department_manager.allowed === false, 'manager cannot invite managers')

const forgedSalesContext = rpcData(
  await salesLogin.client.rpc('get_my_auth_context'),
  'forged-metadata sales access context',
)
assert(forgedSalesContext.member.role === 'sales', 'user metadata cannot elevate the sales role')
assert(forgedSalesContext.primary_department.id === String(departmentA.id), 'user metadata cannot change department')

rpcError(
  await salesLogin.client.rpc('prepare_member_invitation', {
    p_department_id: departmentB.id,
    p_display_name: 'Forbidden Invite',
    p_email: `forbidden.${runId}@example.com`,
    p_idempotency_key: crypto.randomUUID(),
    p_target_role: 'sales',
  }),
  'FORBIDDEN',
  'sales invitation attempt',
)

rpcError(
  await managerLogin.client.rpc('prepare_member_invitation', {
    p_department_id: departmentA.id,
    p_display_name: 'Forbidden Manager',
    p_email: `manager-target.${runId}@example.com`,
    p_idempotency_key: crypto.randomUUID(),
    p_target_role: 'department_manager',
  }),
  'FORBIDDEN',
  'department manager privilege escalation attempt',
)

const invitedEmail = `invited.${runId}@example.com`
const edgeInvitationResponse = await fetch(functionUrl, {
  method: 'POST',
  headers: {
    apikey: publishableKey,
    authorization: `Bearer ${managerLogin.session.access_token}`,
    'content-type': 'application/json',
    origin: 'http://127.0.0.1:4173',
  },
  body: JSON.stringify({
    department_id: departmentA.id,
    display_name: 'Synthetic Invited Sales',
    email: invitedEmail,
    idempotency_key: crypto.randomUUID(),
    target_role: 'sales',
  }),
})
const edgeInvitation = await edgeInvitationResponse.json()
if (edgeInvitationResponse.status !== 201) {
  const safeCode = typeof edgeInvitation?.error?.code === 'string'
    ? edgeInvitation.error.code
    : 'UNKNOWN'
  throw new Error(`Edge invitation failed (${edgeInvitationResponse.status}:${safeCode}).`)
}
assert(edgeInvitationResponse.status === 201, 'Edge invitation returns HTTP 201')
assert(edgeInvitation?.ok === true, 'Edge invitation returns a success envelope')
assert(edgeInvitation?.data?.status === 'sent', 'Edge invitation reports persisted sent status')
const invitationId = edgeInvitation?.data?.invitation_id
assert(typeof invitationId === 'string', 'invitation has an application id')

const invitationBinding = await admin
  .from('member_invitations')
  .select('invited_auth_user_id')
  .eq('id', invitationId)
  .single()
if (invitationBinding.error || !invitationBinding.data?.invited_auth_user_id) {
  safeFailure('read persisted invitation binding', invitationBinding.error)
}
const invitedAuthUserId = invitationBinding.data.invited_auth_user_id

const invitedUpdate = await admin.auth.admin.updateUserById(invitedAuthUserId, {
  password,
  email_confirm: true,
})
if (invitedUpdate.error) safeFailure('activate invited Auth user locally', invitedUpdate.error)
const invitedLogin = await signIn(invitedEmail)

const invitationRequiredContext = rpcData(
  await invitedLogin.client.rpc('get_my_auth_context'),
  'pre-acceptance access context',
)
assert(invitationRequiredContext.member === null, 'invited user has no member before acceptance')
assert(
  invitationRequiredContext.capabilities.can_access_crm.reason_code === 'INVITATION_REQUIRED',
  'invited user is safely held at invitation acceptance',
)

rpcError(
  await salesLogin.client.rpc('accept_my_invitation', {
    p_invitation_id: invitationId,
  }),
  'INVITATION_USER_MISMATCH',
  'wrong user invitation acceptance',
)

const acceptance = rpcData(
  await invitedLogin.client.rpc('accept_my_invitation', {
    p_invitation_id: invitationId,
  }),
  'invitation acceptance',
)
assert(typeof acceptance.member_id === 'number', 'acceptance creates one stable member id')
const replay = rpcData(
  await invitedLogin.client.rpc('accept_my_invitation', {
    p_invitation_id: invitationId,
  }),
  'invitation replay',
)
assert(replay.member_id === acceptance.member_id, 'invitation replay returns the original member')

const acceptedContext = rpcData(
  await invitedLogin.client.rpc('get_my_auth_context'),
  'accepted member context',
)
assert(acceptedContext.capabilities.can_access_crm.allowed === true, 'accepted member can access CRM')
assert(acceptedContext.member.role === 'sales', 'accepted member inherits invitation role')
assert(acceptedContext.primary_department.id === String(departmentA.id), 'accepted member inherits invitation department')

const superAdminInvitation = rpcData(
  await superAdminLogin.client.rpc('prepare_member_invitation', {
    p_department_id: departmentB.id,
    p_display_name: 'Synthetic Manager B',
    p_email: `manager-b.${runId}@example.com`,
    p_idempotency_key: crypto.randomUUID(),
    p_target_role: 'department_manager',
  }),
  'super administrator manager invitation',
)
assert(typeof superAdminInvitation.invitation_id === 'string', 'super administrator can invite a manager across departments')

const disableResult = await admin
  .from('members')
  .update({
    status: 'disabled',
    disabled_at: new Date().toISOString(),
    disabled_by_member_id: superAdminMember.id,
    disabled_reason: 'Synthetic stale JWT verification',
  })
  .eq('id', salesMember.id)
if (disableResult.error) safeFailure('disable synthetic sales member', disableResult.error)

const disabledContext = rpcData(
  await salesLogin.client.rpc('get_my_auth_context'),
  'disabled member context with old JWT',
)
assert(disabledContext.capabilities.can_access_crm.allowed === false, 'old JWT loses CRM access immediately')
assert(disabledContext.capabilities.can_access_crm.reason_code === 'MEMBERSHIP_DISABLED', 'disabled reason is stable')

const staleJwtRead = await salesLogin.client.from('members').select('id')
if (staleJwtRead.error) safeFailure('old JWT direct table read', staleJwtRead.error)
assert(staleJwtRead.data.length === 0, 'old JWT cannot read protected member rows')

const disableDepartmentResult = await admin
  .from('departments')
  .update({ status: 'inactive' })
  .eq('id', departmentA.id)
if (disableDepartmentResult.error) {
  safeFailure('disable synthetic primary department', disableDepartmentResult.error)
}

const inactiveDepartmentContext = rpcData(
  await managerLogin.client.rpc('get_my_auth_context'),
  'inactive-department context with old JWT',
)
assert(
  inactiveDepartmentContext.capabilities.can_access_crm.allowed === false,
  'old JWT loses CRM access when the primary department is inactive',
)
assert(
  inactiveDepartmentContext.capabilities.can_access_crm.reason_code === 'DEPARTMENT_INACTIVE',
  'inactive department reason is stable',
)

const inactiveDepartmentRead = await managerLogin.client.from('members').select('id')
if (inactiveDepartmentRead.error) {
  safeFailure('inactive-department old JWT direct table read', inactiveDepartmentRead.error)
}
assert(
  inactiveDepartmentRead.data.length === 0,
  'inactive-department old JWT cannot read protected member rows',
)

rpcError(
  await managerLogin.client.rpc('prepare_member_invitation', {
    p_department_id: departmentB.id,
    p_display_name: 'Blocked Inactive Department',
    p_email: `blocked-inactive.${runId}@example.com`,
    p_idempotency_key: crypto.randomUUID(),
    p_target_role: 'sales',
  }),
  'MEMBERSHIP_INACTIVE',
  'inactive-department old JWT invitation attempt',
)

const signOut = await managerLogin.client.auth.signOut({ scope: 'local' })
if (signOut.error) safeFailure('local sign out', signOut.error)
const signedOutUser = await managerLogin.client.auth.getUser()
assert(Boolean(signedOutUser.error) && signedOutUser.data.user === null, 'local sign out removes the browser session')

console.log(JSON.stringify({
  status: 'PASS',
  assertions,
  scope: [
    'invite-only signup',
    'real password sessions',
    'authoritative roles and departments',
    'invitation delivery and atomic acceptance',
    'replay and wrong-user rejection',
    'stale JWT denial',
    'inactive-department stale JWT denial',
    'local sign out',
  ],
}))
