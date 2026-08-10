#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const LOCAL_DB_CONTAINER = 'supabase_db_canwin-crm'
const MINIMUM_ASSERTIONS = 70
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const sensitiveKeys = new Set([
  'full_name', 'channels', 'mobile', 'phone', 'email', 'wechat', 'other',
  'masked_mobile', 'masked_phone', 'phone_tail', 'email_tail',
])
const secretPatterns = [
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\b(?:service_role_key|secret_key|publishable_key|anon_key)\b\s*[:=]\s*["']?(?!\*{3,}|redacted|null\b)[A-Za-z0-9_.-]{10,}/i,
  /["']?(?:SUPABASE_)?SECRET_KEY["']?\s*:\s*["'](?!\*{3,}|redacted)[^"'\r\n]{8,}["']/i,
]
const piiPatterns = [
  /\b(?![A-Za-z0-9._%+-]+@example\.(?:com|test)\b)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /(?<!\d)1[3-9]\d{9}(?!\d)/,
  /(?<!\d)\d{17}[0-9Xx](?!\d)/,
]

let assertions = 0
let deniedCases = 0
let authorizedCases = 0
let anonymousCases = 0
let unauthorizedCanaryHits = 0
let sensitiveKeyHits = 0
let auditCanaryHits = 0
let memberDepartmentRevocationCases = 0
let staleSessionCases = 0
let safeStage = 'RT22-00'

function setStage(value) {
  safeStage = value
}

function fail() {
  throw new Error('CONTACT_RUNTIME_FAILED')
}

function assert(condition, { p0 = false } = {}) {
  if (!condition) {
    if (p0) unauthorizedCanaryHits += 1
    fail()
  }
  assertions += 1
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    fail()
  }
}

function runPsql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', LOCAL_DB_CONTAINER,
    'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres',
  ], {
    cwd: process.cwd(),
    input: sql,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') fail()
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
}

function psqlJson(sql) {
  return parseJson(runPsql(sql))
}

function psqlNumber(sql) {
  const value = Number(runPsql(sql))
  if (!Number.isFinite(value)) fail()
  return value
}

function serialized(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    fail()
  }
}

function canaryHitCount(value, canaries) {
  const text = serialized(value)
  return canaries.reduce((total, canary) => total + (text.includes(canary) ? 1 : 0), 0)
}

function nestedSensitiveKeyCount(value) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + nestedSensitiveKeyCount(item), 0)
  if (typeof value !== 'object' || value === null) return 0
  let total = 0
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.has(key.toLowerCase())) total += 1
    total += nestedSensitiveKeyCount(child)
  }
  return total
}

function assertNoUnauthorizedSecret(value, canaries) {
  const canaryHits = canaryHitCount(value, canaries)
  const keyHits = nestedSensitiveKeyCount(value)
  unauthorizedCanaryHits += canaryHits
  sensitiveKeyHits += keyHits
  assert(canaryHits === 0, { p0: true })
  assert(keyHits === 0, { p0: true })
}

function safeOperation(result) {
  if (result.error) fail()
  return result.data
}

function assertDeniedRpc(result, canaries, expectedReasons = null) {
  const data = safeOperation(result)
  assert(data?.ok === true)
  const access = data?.data?.contact_access
  assert(access?.allowed === false)
  assert(typeof access?.reason_code === 'string' && access.reason_code.length > 0)
  if (expectedReasons) assert(expectedReasons.includes(access.reason_code))
  assert(Object.keys(access).sort().join('|') === 'allowed|reason_code')
  assertNoUnauthorizedSecret(data, canaries)
  deniedCases += 1
  return access.reason_code
}

function assertAuthorizedRpc(result, canaries) {
  const data = safeOperation(result)
  assert(data?.ok === true)
  const access = data?.data?.contact_access
  assert(access?.allowed === true)
  assert(typeof access.full_name === 'string' || access.full_name === null)
  assert(Array.isArray(access.channels))
  assert(Object.keys(access).sort().join('|') === 'allowed|channels|full_name')
  assert(access.full_name === canaries[0])
  assert(access.channels.length === 5)
  assert(access.channels.every((item) => item && typeof item.type === 'string' && typeof item.value === 'string'))
  assert(access.channels.every((item) => !Object.hasOwn(item, 'kind')))
  assert(access.channels.map((item) => item.value).join('|') === canaries.slice(1).join('|'))
  authorizedCases += 1
}

async function createAuthUser(admin, label, password, runId, userMetadata = {}) {
  const email = `${label}.${runId}@example.com`
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  })
  if (result.error || !result.data.user) fail()
  assert(typeof result.data.user.id === 'string')
  return { email, id: result.data.user.id }
}

async function signIn(apiUrl, publishableKey, password, email) {
  const client = createClient(apiUrl, publishableKey, clientOptions)
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.session) fail()
  assert(typeof result.data.session.access_token === 'string')
  return client
}

async function main() {
  setStage('RT22-01')
  const apiUrl = process.env.CANWIN_TEST_API_URL
  const publishableKey = process.env.CANWIN_TEST_PUBLISHABLE_KEY
  const secretKey = process.env.CANWIN_TEST_SECRET_KEY
  if (typeof apiUrl !== 'string') fail()
  const parsedUrl = new URL(apiUrl)
  assert(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname))
  assert(typeof publishableKey === 'string' && publishableKey.startsWith('sb_publishable_'))
  assert(typeof secretKey === 'string' && secretKey.startsWith('sb_secret_'))

  const admin = createClient(apiUrl, secretKey, clientOptions)
  const anon = createClient(apiUrl, publishableKey, clientOptions)
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const password = `Cw-${crypto.randomUUID()}-9a`

  setStage('RT22-02')
  const departmentResult = await admin.from('departments').insert([
    { code: `contact-a-${runId}`.slice(0, 62), name: 'Synthetic Contact Department A' },
    { code: `contact-b-${runId}`.slice(0, 62), name: 'Synthetic Contact Department B' },
    { code: `contact-c-${runId}`.slice(0, 62), name: 'Synthetic Contact Department C' },
  ]).select('id,code')
  const departments = safeOperation(departmentResult)
  assert(Array.isArray(departments) && departments.length === 3)
  const departmentA = departments.find((item) => item.code.startsWith('contact-a-'))
  const departmentB = departments.find((item) => item.code.startsWith('contact-b-'))
  const departmentC = departments.find((item) => item.code.startsWith('contact-c-'))
  assert(Boolean(departmentA && departmentB && departmentC))

  const roleDefinitions = [
    ['A1', 'sales', departmentA.id, {}],
    ['A2', 'sales', departmentA.id, {}],
    ['MA', 'department_manager', departmentA.id, {}],
    ['B1', 'sales', departmentB.id, {}],
    ['SA', 'super_admin', departmentA.id, {}],
    ['DISABLED', 'sales', departmentA.id, {}],
    ['INACTIVE', 'sales', departmentC.id, {}],
    ['STALE', 'sales', departmentA.id, {}],
    ['FORGED', 'sales', departmentB.id, { role: 'super_admin', primary_department_id: String(departmentA.id) }],
  ]
  const users = {}
  for (const [key, role, departmentId, metadata] of roleDefinitions) {
    users[key] = {
      role,
      departmentId,
      ...(await createAuthUser(admin, key.toLowerCase(), password, runId, metadata)),
    }
  }

  setStage('RT22-03')
  const acceptedAt = new Date().toISOString()
  const memberResult = await admin.from('members').insert(
    Object.values(users).map((user) => ({
      auth_user_id: user.id,
      primary_department_id: user.departmentId,
      role: user.role,
      status: 'active',
      accepted_at: acceptedAt,
    })),
  ).select('id,auth_user_id')
  const members = safeOperation(memberResult)
  assert(Array.isArray(members) && members.length === roleDefinitions.length)
  for (const user of Object.values(users)) {
    user.memberId = members.find((member) => member.auth_user_id === user.id)?.id
    assert(Number.isSafeInteger(user.memberId))
  }

  const clients = {}
  for (const [key] of roleDefinitions) clients[key] = await signIn(apiUrl, publishableKey, password, users[key].email)

  setStage('RT22-04')
  const canaries = [
    `CW-CANARY-NAME-${runId}`,
    `CW-CANARY-MOBILE-${runId}`,
    `CW-CANARY-PHONE-${runId}`,
    `cw-canary-${runId}@example.test`,
    `CW-CANARY-WECHAT-${runId}`,
    `CW-CANARY-OTHER-${runId}`,
  ]
  const fixture = psqlJson(`
    with inserted_account as (
      insert into public.accounts (name, created_by_member_id, updated_by_member_id)
      values (${sqlLiteral(`Synthetic Contact Account ${runId}`)}, ${users.SA.memberId}, ${users.SA.memberId})
      returning id
    ), inserted_store as (
      insert into public.stores (account_id, name, created_by_member_id, updated_by_member_id)
      select id, ${sqlLiteral(`Synthetic Contact Store ${runId}`)}, ${users.SA.memberId}, ${users.SA.memberId}
      from inserted_account returning id, account_id
    ), inserted_contact as (
      insert into public.contacts (store_id, role_label, is_primary, created_by_member_id, updated_by_member_id)
      select id, 'Primary contact', true, ${users.SA.memberId}, ${users.SA.memberId}
      from inserted_store returning id, public_id, store_id
    ), inserted_secret as (
      insert into app_private.contact_secrets
        (contact_id, full_name, mobile, phone, email, wechat, other, created_by_member_id, updated_by_member_id)
      select id, ${sqlLiteral(canaries[0])}, ${sqlLiteral(canaries[1])}, ${sqlLiteral(canaries[2])},
        ${sqlLiteral(canaries[3])}, ${sqlLiteral(canaries[4])}, ${sqlLiteral(canaries[5])},
        ${users.SA.memberId}, ${users.SA.memberId}
      from inserted_contact returning contact_id
    )
    select json_build_object(
      'account_id', (select id from inserted_account),
      'store_id', (select id from inserted_store),
      'contact_id', (select id from inserted_contact),
      'public_id', (select public_id from inserted_contact)
    )::text;
  `)
  assert(Number.isSafeInteger(fixture.account_id))
  assert(Number.isSafeInteger(fixture.store_id))
  assert(Number.isSafeInteger(fixture.contact_id))
  assert(typeof fixture.public_id === 'string')

  setStage('RT22-05')
  for (const [key] of roleDefinitions) {
    const result = await clients[key].from('contacts')
      .select('public_id,store_id,role_label,is_primary,status,version')
      .eq('public_id', fixture.public_id)
    const rows = safeOperation(result)
    assert(Array.isArray(rows) && rows.length === 1)
    assert(Object.keys(rows[0]).sort().join('|') === 'is_primary|public_id|role_label|status|store_id|version')
    assertNoUnauthorizedSecret(rows, canaries)
  }

  setStage('RT22-06')
  const ordinaryRoles = ['A1', 'A2', 'MA', 'B1', 'DISABLED', 'INACTIVE', 'STALE', 'FORGED']
  for (const key of ordinaryRoles) {
    assertDeniedRpc(
      await clients[key].rpc('read_contact_secret', {
        p_contact_public_id: fixture.public_id,
        p_reason: 'Synthetic local quality review',
      }),
      canaries,
      ['NOT_CLAIMED'],
    )
  }

  const anonRpc = await anon.rpc('read_contact_secret', {
    p_contact_public_id: fixture.public_id,
    p_reason: 'Synthetic local quality review',
  })
  assert(Boolean(anonRpc.error))
  assertNoUnauthorizedSecret(anonRpc, canaries)
  anonymousCases += 1

  const anonStructure = await anon.from('contacts').select('public_id')
  assert(Boolean(anonStructure.error) || anonStructure.data?.length === 0)
  assertNoUnauthorizedSecret(anonStructure, canaries)
  anonymousCases += 1

  const serviceRpc = await admin.rpc('read_contact_secret', {
    p_contact_public_id: fixture.public_id,
    p_reason: 'Synthetic local quality review',
  })
  assert(Boolean(serviceRpc.error))
  assertNoUnauthorizedSecret(serviceRpc, canaries)

  setStage('RT22-07')
  const directClients = [anon, admin, ...Object.values(clients)]
  for (const client of directClients) {
    const direct = await client.schema('app_private').from('contact_secrets').select('*')
    assert(Boolean(direct.error))
    assertNoUnauthorizedSecret(direct, canaries)
  }

  setStage('RT22-08')
  assertDeniedRpc(
    await clients.SA.rpc('read_contact_secret', { p_contact_public_id: fixture.public_id }),
    canaries,
    ['REASON_REQUIRED'],
  )
  assertDeniedRpc(
    await clients.SA.rpc('read_contact_secret', {
      p_contact_public_id: fixture.public_id,
      p_reason: 'unsafe\nreason',
    }),
    canaries,
    ['REASON_INVALID'],
  )
  assertAuthorizedRpc(
    await clients.SA.rpc('read_contact_secret', {
      p_contact_public_id: fixture.public_id,
      p_reason: 'Synthetic local quality review',
    }),
    canaries,
  )

  setStage('RT22-09')
  const disableResult = await admin.from('members').update({
    status: 'disabled',
    disabled_at: new Date().toISOString(),
    disabled_by_member_id: users.SA.memberId,
    disabled_reason: 'Synthetic contact runtime verification',
  }).eq('id', users.DISABLED.memberId)
  if (disableResult.error) fail()
  assertDeniedRpc(
    await clients.DISABLED.rpc('read_contact_secret', {
      p_contact_public_id: fixture.public_id,
      p_reason: 'Synthetic local quality review',
    }),
    canaries,
    ['SESSION_INVALID', 'MEMBERSHIP_INACTIVE'],
  )
  const disabledRead = safeOperation(await clients.DISABLED.from('contacts').select('public_id'))
  assert(Array.isArray(disabledRead) && disabledRead.length === 0)
  memberDepartmentRevocationCases += 1

  const departmentDisable = await admin.from('departments').update({ status: 'inactive' }).eq('id', departmentC.id)
  if (departmentDisable.error) fail()
  assertDeniedRpc(
    await clients.INACTIVE.rpc('read_contact_secret', {
      p_contact_public_id: fixture.public_id,
      p_reason: 'Synthetic local quality review',
    }),
    canaries,
    ['SESSION_INVALID', 'MEMBERSHIP_INACTIVE', 'DEPARTMENT_INACTIVE'],
  )
  const inactiveRead = safeOperation(await clients.INACTIVE.from('contacts').select('public_id'))
  assert(Array.isArray(inactiveRead) && inactiveRead.length === 0)
  memberDepartmentRevocationCases += 1

  setStage('RT22-10')
  const staleSessionsBefore = psqlNumber(`
    select count(*) from auth.sessions
    where user_id=${sqlLiteral(users.STALE.id)};
  `)
  assert(staleSessionsBefore >= 1)
  runPsql(`
    delete from auth.sessions
    where user_id=${sqlLiteral(users.STALE.id)};
  `)
  const staleSessionsAfter = psqlNumber(`
    select count(*) from auth.sessions
    where user_id=${sqlLiteral(users.STALE.id)};
  `)
  assert(staleSessionsAfter === 0)
  assertDeniedRpc(
    await clients.STALE.rpc('read_contact_secret', {
      p_contact_public_id: fixture.public_id,
      p_reason: 'Synthetic revoked session review',
    }),
    canaries,
    ['SESSION_INVALID'],
  )
  const staleRead = safeOperation(await clients.STALE.from('contacts').select('public_id'))
  assert(Array.isArray(staleRead) && staleRead.length === 0)
  staleSessionCases += 1

  setStage('RT22-11')
  const unavailableStates = [
    [`update public.contacts set status='inactive', status_reason='Synthetic inactive' where id=${fixture.contact_id};`, `update public.contacts set status='active', status_reason=null where id=${fixture.contact_id};`],
    [`update public.stores set status='inactive', status_reason='Synthetic inactive' where id=${fixture.store_id};`, `update public.stores set status='active', status_reason=null where id=${fixture.store_id};`],
    [`update public.accounts set status='suspected_closed', status_reason='Synthetic closed' where id=${fixture.account_id};`, `update public.accounts set status='active', status_reason=null where id=${fixture.account_id};`],
  ]
  for (const [disableSql, restoreSql] of unavailableStates) {
    runPsql(disableSql)
    assertDeniedRpc(
      await clients.SA.rpc('read_contact_secret', {
        p_contact_public_id: fixture.public_id,
        p_reason: 'Synthetic local quality review',
      }),
      canaries,
      ['CONTACT_UNAVAILABLE'],
    )
    runPsql(restoreSql)
  }

  setStage('RT22-12')
  const realtimeRows = psqlNumber(`
    select count(*) from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='app_private'
      and tablename='contact_secrets';
  `)
  assert(realtimeRows === 0, { p0: true })

  const audit = psqlJson(`
    select json_build_object(
      'allowed', count(*) filter (where outcome='success'),
      'denied', count(*) filter (where outcome='denied'),
      'canary_hits', count(*) filter (
        where safe_data::text like ${sqlLiteral(`%${canaries[0]}%`)}
           or safe_data::text like ${sqlLiteral(`%${canaries[1]}%`)}
           or safe_data::text like ${sqlLiteral(`%${canaries[2]}%`)}
           or safe_data::text like ${sqlLiteral(`%${canaries[3]}%`)}
           or safe_data::text like ${sqlLiteral(`%${canaries[4]}%`)}
           or safe_data::text like ${sqlLiteral(`%${canaries[5]}%`)}
      )
    )::text
    from public.audit_log
    where source='contacts' and action='secret.read'
      and target_type='contact' and target_id=${sqlLiteral(fixture.public_id)};
  `)
  assert(Number(audit.allowed) >= 1)
  assert(Number(audit.denied) >= deniedCases)
  auditCanaryHits = Number(audit.canary_hits)
  assert(auditCanaryHits === 0, { p0: true })
  assert(assertions >= MINIMUM_ASSERTIONS)

  const summary = {
    status: 'PASS',
    assertions,
    real_jwt_sessions: roleDefinitions.length,
    anonymous_cases: anonymousCases,
    authorized_cases: authorizedCases,
    denied_cases: deniedCases,
    member_department_revocation_cases: memberDepartmentRevocationCases,
    stale_session_cases: staleSessionCases,
    direct_private_rows: 0,
    realtime_rows: realtimeRows,
    unauthorized_canary_hits: unauthorizedCanaryHits,
    sensitive_key_hits: sensitiveKeyHits,
    audit_canary_hits: auditCanaryHits,
    secret_pattern_counts: [0, 0, 0, 0],
    pii_pattern_count: 0,
  }
  const output = JSON.stringify(summary)
  summary.secret_pattern_counts = secretPatterns.map((pattern) => (output.match(pattern) ?? []).length)
  summary.pii_pattern_count = piiPatterns.reduce((total, pattern) => total + (output.match(pattern) ?? []).length, 0)
  assert(summary.secret_pattern_counts.every((count) => count === 0), { p0: true })
  assert(summary.pii_pattern_count === 0, { p0: true })
  summary.assertions = assertions
  console.log(JSON.stringify(summary))
}

main().catch(() => {
  console.error(JSON.stringify({
    status: 'FAIL',
    stage: safeStage,
    assertions,
    unauthorized_canary_hits: unauthorizedCanaryHits,
    sensitive_key_hits: sensitiveKeyHits,
    audit_canary_hits: auditCanaryHits,
  }))
  process.exit(1)
})
