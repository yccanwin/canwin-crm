#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const LOCAL_DB_CONTAINER = 'supabase_db_canwin-crm'
const MINIMUM_ASSERTIONS = 150
const EXPECTED_REAL_JWT_SESSIONS = 7
const PUBLIC_TABLES = [
  'portrait_field_definitions', 'portrait_field_options', 'store_portrait_values',
  'store_portrait_value_options', 'store_derived_portrait_values',
]
const PORTRAIT_CATALOG_RPC = 'read_portrait_catalog'
const PORTRAIT_DERIVED_RPC = 'read_store_derived_portraits'
const WIRE_GOLDEN_PATH = 'apps/web/src/portrait/fixtures/portrait-wire-golden.json'
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const forbiddenKeys = new Set([
  'full_name', 'phone', 'mobile', 'email', 'wechat', 'identity_number', 'id_card_number',
  'license_number', 'ocr_text', 'document_id', 'document_path', 'storage_key', 'storage_path',
  'signed_url', 'file_path', 'note', 'follow_up',
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
let authorizedCases = 0
let deniedCases = 0
let staleSessionCases = 0
let derivedStaleCases = 0
let unauthorizedCanaryHits = 0
let documentStorageCanaryHits = 0
let forbiddenPortraitKeyHits = 0
let auditCanaryHits = 0
let secretPatternCounts = [0, 0, 0, 0]
let piiPatternCount = 0
let staleSessionDenialCode = null
let runtimeCleanupSql = null
let safeStage = 'RT23-00'

function fail() { throw new Error('PORTRAIT_RUNTIME_FAILED') }
function assert(condition, { p0 = false } = {}) {
  if (!condition) {
    if (p0) unauthorizedCanaryHits += 1
    fail()
  }
  assertions += 1
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'` }
function runPsql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres',
  ], { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 90_000, windowsHide: true })
  if (result.status !== 0 || typeof result.stdout !== 'string') fail()
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
}
function psqlNumber(sql) {
  const value = Number(runPsql(sql))
  if (!Number.isFinite(value)) fail()
  return value
}
function psqlJson(sql) {
  try { return JSON.parse(runPsql(sql)) } catch { fail() }
}
function safeData(result) {
  if (result.error) fail()
  return result.data
}
function serialize(value) {
  try { return JSON.stringify(value ?? null) } catch { fail() }
}
function forbiddenKeyCount(value) {
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + forbiddenKeyCount(child), 0)
  if (!value || typeof value !== 'object') return 0
  return Object.entries(value).reduce((sum, [key, child]) => sum + Number(forbiddenKeys.has(key.toLowerCase())) + forbiddenKeyCount(child), 0)
}
function assertSafe(value, canaries) {
  const text = serialize(value)
  const canaryHits = canaries.filter((canary) => text.includes(canary)).length
  const keyHits = forbiddenKeyCount(value)
  const secretHits = secretPatterns.map((pattern) => (text.match(pattern) ?? []).length)
  const piiHits = piiPatterns.reduce((sum, pattern) => sum + (text.match(pattern) ?? []).length, 0)
  documentStorageCanaryHits += canaryHits
  forbiddenPortraitKeyHits += keyHits
  secretPatternCounts = secretPatternCounts.map((count, index) => count + secretHits[index])
  piiPatternCount += piiHits
  assert(canaryHits === 0, { p0: true })
  assert(keyHits === 0, { p0: true })
  assert(secretHits.every((count) => count === 0), { p0: true })
  assert(piiHits === 0, { p0: true })
}
function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...expected].sort().join('|')
}
function assertCatalogShape(value, golden) {
  assert(exactKeys(value, ['schema_version','fields']))
  assert(value.schema_version === golden.schema_version)
  assert(Array.isArray(value.fields) && value.fields.length >= 3)
  const goldenByType = new Map(golden.fields.map((field) => [`${field.source_kind}:${field.value_type}`, field]))
  for (const field of value.fields) {
    assert(exactKeys(field, Object.keys(golden.fields[0])))
    assert(field.privacy_level === 'shared_non_sensitive')
    assert(exactKeys(field.capabilities, ['can_set','can_clear']))
    assert(field.capabilities.can_set === false && field.capabilities.can_clear === false)
    assert(Array.isArray(field.options))
    for (const option of field.options) assert(exactKeys(option, ['public_id','option_key','label','status','sort_order']))
    const shape = goldenByType.get(`${field.source_kind}:${field.value_type}`)
    if (shape) {
      assert(serialize(field.allowed_filter_operators) === serialize(shape.allowed_filter_operators))
      assert(Object.keys(field.constraints).sort().join('|') === Object.keys(shape.constraints).sort().join('|'))
    }
  }
}
function assertDerivedEnvelopeShape(value, golden) {
  assert(exactKeys(value, Object.keys(golden)))
  assert(value.schema_version === 1)
  assert(exactKeys(value.context, Object.keys(golden.context)))
  assert(Array.isArray(value.values))
  for (const item of value.values) assert(exactKeys(item, Object.keys(golden.values[0])))
}
async function createUser(admin, label, password, runId, metadata = {}) {
  const email = `${label}.${runId}@example.com`
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata })
  if (result.error || !result.data.user) fail()
  assert(typeof result.data.user.id === 'string')
  return { id: result.data.user.id, email }
}
async function signIn(apiUrl, publishableKey, email, password) {
  const client = createClient(apiUrl, publishableKey, clientOptions)
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.session) fail()
  assert(typeof result.data.session.access_token === 'string')
  return client
}

async function main() {
  safeStage = 'RT23-01'
  const apiUrl = process.env.CANWIN_TEST_API_URL
  const publishableKey = process.env.CANWIN_TEST_PUBLISHABLE_KEY
  const secretKey = process.env.CANWIN_TEST_SECRET_KEY
  if (typeof apiUrl !== 'string') fail()
  assert(['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname))
  assert(typeof publishableKey === 'string' && publishableKey.startsWith('sb_publishable_'))
  assert(typeof secretKey === 'string' && secretKey.startsWith('sb_secret_'))
  const admin = createClient(apiUrl, secretKey, clientOptions)
  const anon = createClient(apiUrl, publishableKey, clientOptions)
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const password = `Cw-${crypto.randomUUID()}-9a`
  const canaries = [
    `DOCUMENT-CANARY-${runId}`,
    `STORAGE-CANARY-${runId}`,
    `AUDIT-CANARY-${runId}`,
    `sb_secret_CI_CANARY_${runId.replaceAll('-', '')}`,
    `pii-canary-${runId}@invalid.example`,
  ]
  const wireGolden = JSON.parse(fs.readFileSync(WIRE_GOLDEN_PATH, 'utf8'))
  assert(wireGolden.fixture_version === 1 && wireGolden.synthetic_only === true)
  assertCatalogShape(wireGolden.catalog_envelope, wireGolden.catalog_envelope)
  for (const envelope of wireGolden.derived_envelopes) assertDerivedEnvelopeShape(envelope, wireGolden.derived_envelopes[0])

  safeStage = 'RT23-02'
  const departments = safeData(await admin.from('departments').insert([
    { code: `p23-a-${runId}`.slice(0, 62), name: 'Synthetic Portrait A' },
    { code: `p23-b-${runId}`.slice(0, 62), name: 'Synthetic Portrait B' },
    { code: `p23-off-${runId}`.slice(0, 62), name: 'Synthetic Portrait Off' },
  ]).select('id,public_id,code'))
  assert(Array.isArray(departments) && departments.length === 3)
  const departmentIds = departments.map((department) => department.id)
  runtimeCleanupSql = `
    begin;
    alter table public.departments disable trigger user;
    delete from public.departments where id in (${departmentIds.join(',')});
    alter table public.departments enable trigger user;
    commit;
  `
  const departmentA = departments.find((row) => row.code.startsWith('p23-a-'))
  const departmentB = departments.find((row) => row.code.startsWith('p23-b-'))
  const departmentOff = departments.find((row) => row.code.startsWith('p23-off-'))
  assert(Boolean(departmentA && departmentB && departmentOff))
  const roles = [
    ['SA', 'super_admin', departmentA.id, {}], ['A1', 'sales', departmentA.id, {}],
    ['B1', 'sales', departmentB.id, {}], ['DISABLED', 'sales', departmentA.id, {}],
    ['INACTIVE', 'sales', departmentOff.id, {}], ['STALE', 'sales', departmentA.id, {}],
    ['FORGED', 'sales', departmentB.id, {
      role: 'super_admin',
      primary_department_id: String(departmentA.id),
      document_storage_canary: canaries[0],
      forged_secret_canary: canaries[3],
      forged_pii_canary: canaries[4],
    }],
  ]
  assert(roles.length === EXPECTED_REAL_JWT_SESSIONS)
  const users = {}
  for (const [key, role, departmentId, metadata] of roles) {
    users[key] = { role, departmentId, ...(await createUser(admin, key.toLowerCase(), password, runId, metadata)) }
    const createdUserIds = Object.values(users).map((user) => sqlLiteral(user.id)).join(',')
    runtimeCleanupSql = `
      begin;
      delete from auth.sessions where user_id in (${createdUserIds});
      delete from auth.users where id in (${createdUserIds});
      alter table public.departments disable trigger user;
      delete from public.departments where id in (${departmentIds.join(',')});
      alter table public.departments enable trigger user;
      commit;
    `
  }
  const members = safeData(await admin.from('members').insert(Object.values(users).map((user) => ({
    auth_user_id: user.id, primary_department_id: user.departmentId, role: user.role,
    status: 'active', accepted_at: new Date().toISOString(),
  }))).select('id,public_id,auth_user_id'))
  assert(Array.isArray(members) && members.length === EXPECTED_REAL_JWT_SESSIONS)
  const memberIds = members.map((member) => member.id)
  for (const user of Object.values(users)) {
    user.memberId = members.find((member) => member.auth_user_id === user.id)?.id
    assert(Number.isSafeInteger(user.memberId))
  }
  runtimeCleanupSql = `
    begin;
    alter table public.members disable trigger user;
    delete from public.members where id in (${memberIds.join(',')});
    alter table public.members enable trigger user;
    delete from auth.sessions where user_id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    delete from auth.users where id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    alter table public.departments disable trigger user;
    delete from public.departments where id in (${departmentIds.join(',')});
    alter table public.departments enable trigger user;
    commit;
  `
  const clients = {}
  for (const [key] of roles) clients[key] = await signIn(apiUrl, publishableKey, users[key].email, password)

  safeStage = 'RT23-03'
  const reservedDefinitionSnapshot = psqlJson(`
    select coalesce(json_agg(json_build_object(
      'id',id,'field_key',field_key,'status',status,'version',version,
      'updated_at_epoch_microseconds',(extract(epoch from updated_at)*1000000)::bigint
    ) order by field_key),'[]'::json)::text
    from public.portrait_field_definitions
    where public_id in(
      '23000000-0000-4000-8000-000000000001',
      '23000000-0000-4000-8000-000000000002',
      '23000000-0000-4000-8000-000000000003'
    );
  `)
  assert(Array.isArray(reservedDefinitionSnapshot) && reservedDefinitionSnapshot.length === 3)
  runPsql(`
    begin;
    alter table public.portrait_field_definitions disable trigger portrait_field_definitions_guard;
    update public.portrait_field_definitions
      set status='active', updated_at=now(), version=version+1
      where field_key in('has_legal_person_id','has_business_license','documents_complete');
    alter table public.portrait_field_definitions enable trigger portrait_field_definitions_guard;
    commit;
  `)
  runtimeCleanupSql = `
    begin;
    alter table public.portrait_field_definitions disable trigger portrait_field_definitions_guard;
    alter table public.portrait_field_definitions disable trigger portrait_field_definitions_touch;
    ${reservedDefinitionSnapshot.map((row) => `update public.portrait_field_definitions set status=${sqlLiteral(row.status)},version=${row.version},updated_at=to_timestamp(${row.updated_at_epoch_microseconds}::numeric/1000000) where id=${row.id};`).join('\n')}
    alter table public.portrait_field_definitions enable trigger portrait_field_definitions_touch;
    alter table public.portrait_field_definitions enable trigger portrait_field_definitions_guard;
    alter table public.members disable trigger user;
    delete from public.members where id in (${memberIds.join(',')});
    alter table public.members enable trigger user;
    delete from auth.sessions where user_id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    delete from auth.users where id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    alter table public.departments disable trigger user;
    delete from public.departments where id in (${departmentIds.join(',')});
    alter table public.departments enable trigger user;
    commit;
  `
  const fixture = psqlJson(`
    with a as (
      insert into public.accounts(name,created_by_member_id,updated_by_member_id)
      values(${sqlLiteral(`Synthetic Portrait ${runId}`)},${users.SA.memberId},${users.SA.memberId}) returning id
    ), s as (
      insert into public.stores(account_id,name,created_by_member_id,updated_by_member_id)
      select id,${sqlLiteral(`Synthetic Store ${runId}`)},${users.SA.memberId},${users.SA.memberId} from a returning id
    ), defs as (
      insert into public.portrait_field_definitions
        (field_key,label,value_type,source_kind,context_scope,status,is_read_only,allow_keyword_search,sort_order,created_by_member_id,updated_by_member_id,created_by_system,updated_by_system)
      values
        (${sqlLiteral(`p23_text_${runId.replaceAll('-', '_')}`.slice(0,63))},'Text','text','manual','store_global','active',false,true,1,${users.SA.memberId},${users.SA.memberId},null,null),
        (${sqlLiteral(`p23_bool_${runId.replaceAll('-', '_')}`.slice(0,63))},'Boolean','boolean','manual','store_global','active',false,false,2,${users.SA.memberId},${users.SA.memberId},null,null)
      returning id,field_key
    ), manual_values as (
      insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,text_value,boolean_value,created_by_member_id,updated_by_member_id)
      select (select id from s),id,value_type,1,
        case when value_type='text' then 'synthetic searchable portrait' end,
        case when value_type='boolean' then false end,
        ${users.SA.memberId},${users.SA.memberId}
      from public.portrait_field_definitions where id in (select id from defs) and source_kind='manual'
      returning id
    ), legal_value as (
      insert into public.store_derived_portrait_values
        (store_id,field_definition_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
      select (select id from s),id,1,'fresh',true,'calc-1','source-1',now(),now()-interval '1 minute','COMPUTED','system:runtime','system:runtime'
      from public.portrait_field_definitions where field_key='has_legal_person_id' returning id
    ), license_value as (
      insert into public.store_derived_portrait_values
        (store_id,field_definition_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
      select (select id from s),id,1,'unknown',null,null,null,null,null,'NOT_COMPUTED','system:runtime','system:runtime'
      from public.portrait_field_definitions where field_key='has_business_license' returning id
    ), dept_a_value as (
      insert into public.store_derived_portrait_values
        (store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
      select (select id from s),id,${departmentA.id},1,'stale',null,'calc-1','source-2',now()-interval '2 minutes',now()-interval '1 minute','SOURCE_CHANGED','system:runtime','system:runtime'
      from public.portrait_field_definitions where field_key='documents_complete' returning id
    )
    select json_build_object(
      'account_id',(select id from a),'store_id',(select id from s),
      'store_public_id',(select public_id from public.stores where id=(select id from s)),
      'definition_ids',(select json_agg(id) from defs),
      'definition_count',(select count(*) from defs),'manual_count',(select count(*) from manual_values),
      'derived_count',(select count(*) from legal_value)+(select count(*) from license_value)+(select count(*) from dept_a_value)
    )::text;
  `)
  runtimeCleanupSql = `
    begin;
    alter table public.store_derived_portrait_values disable trigger store_derived_portrait_values_guard;
    delete from public.store_derived_portrait_values where store_id=${fixture.store_id};
    alter table public.store_derived_portrait_values enable trigger store_derived_portrait_values_guard;
    alter table public.store_portrait_values disable trigger store_portrait_values_guard;
    delete from public.store_portrait_values where store_id=${fixture.store_id};
    alter table public.store_portrait_values enable trigger store_portrait_values_guard;
    alter table public.portrait_field_definitions disable trigger portrait_field_definitions_guard;
    alter table public.portrait_field_definitions disable trigger portrait_field_definitions_touch;
    delete from public.portrait_field_definitions where id in (${fixture.definition_ids.join(',')});
    ${reservedDefinitionSnapshot.map((row) => `update public.portrait_field_definitions set status=${sqlLiteral(row.status)},version=${row.version},updated_at=to_timestamp(${row.updated_at_epoch_microseconds}::numeric/1000000) where id=${row.id};`).join('\n')}
    alter table public.portrait_field_definitions enable trigger portrait_field_definitions_touch;
    alter table public.portrait_field_definitions enable trigger portrait_field_definitions_guard;
    alter table public.stores disable trigger user;
    delete from public.stores where id=${fixture.store_id};
    alter table public.stores enable trigger user;
    alter table public.accounts disable trigger user;
    delete from public.accounts where id=${fixture.account_id};
    alter table public.accounts enable trigger user;
    alter table public.members disable trigger user;
    update public.members set status='active',disabled_at=null,disabled_by_member_id=null,disabled_reason=null
      where id in (${memberIds.join(',')});
    delete from public.members where id in (${memberIds.join(',')});
    alter table public.members enable trigger user;
    delete from auth.sessions where user_id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    delete from auth.users where id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')});
    alter table public.departments disable trigger user;
    delete from public.departments where id in (${departmentIds.join(',')});
    alter table public.departments enable trigger user;
    commit;
  `
  assert(fixture.definition_count === 2)
  assert(fixture.manual_count === 2)
  assert(fixture.derived_count === 3)

  safeStage = 'RT23-03A'
  const catalogs = {}
  for (const key of ['SA','A1','B1','FORGED']) {
    const result = await clients[key].rpc(PORTRAIT_CATALOG_RPC)
    const catalog = safeData(result)
    assertCatalogShape(catalog, wireGolden.catalog_envelope)
    assertSafe(catalog, canaries)
    catalogs[key] = catalog
  }
  const derivedEnvelopes = {}
  for (const key of ['A1','B1','FORGED']) {
    const result = await clients[key].rpc(PORTRAIT_DERIVED_RPC, { p_store_public_id: fixture.store_public_id })
    const envelope = safeData(result)
    assertDerivedEnvelopeShape(envelope, wireGolden.derived_envelopes[0])
    assert(envelope.context.store_public_id === fixture.store_public_id)
    assertSafe(envelope, canaries)
    derivedEnvelopes[key] = envelope
  }

  safeStage = 'RT23-04'
  assert(catalogs.A1.fields.every((field) => ['text','single_select','multi_select','boolean','number'].includes(field.value_type)))
  assert(catalogs.A1.fields.every((field) => field.privacy_level === 'shared_non_sensitive'))
  assert(catalogs.A1.fields.filter((field) => field.source_kind === 'system_derived').every((field) => field.allow_keyword_search === false))
  assert(serialize(catalogs.A1) === serialize(catalogs.B1))
  assert(serialize(catalogs.B1) === serialize(catalogs.FORGED), { p0: true })
  authorizedCases += Object.keys(catalogs).length

  safeStage = 'RT23-05'
  const aDerived = derivedEnvelopes.A1.values
  const bDerived = derivedEnvelopes.B1.values
  const forgedDerived = derivedEnvelopes.FORGED.values
  assert(aDerived.length === 3)
  assert(bDerived.length === 3)
  assert(forgedDerived.length === 3, { p0: true })
  assert(forgedDerived.every((item) => item.department_public_id === null || item.department_public_id === derivedEnvelopes.FORGED.context.primary_department_public_id), { p0: true })
  assert(aDerived.some((row) => row.freshness === 'fresh' && row.value === true))
  assert(aDerived.some((row) => row.freshness === 'stale' && row.value === null))
  assert(!aDerived.some((row) => row.freshness === 'stale' && row.value !== null), { p0: true })
  assert(bDerived.some((row) => row.freshness === 'unknown' && row.value === null))
  const frozenDerivedPublicIds = new Set(['23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000003'])
  for (const envelope of Object.values(derivedEnvelopes)) {
    assert(envelope.values.every((row) => frozenDerivedPublicIds.has(row.field_public_id)))
    assert(new Set(envelope.values.map((row) => row.field_public_id)).size === 3)
    assert(envelope.values.filter((row) => row.freshness === 'fresh').every((row) => row.reason_code === null && typeof row.value === 'boolean'))
    assert(envelope.values.filter((row) => row.freshness !== 'fresh').every((row) => row.value === null && typeof row.reason_code === 'string'))
    assert(envelope.values.every((row) => row.store_public_id === envelope.context.store_public_id && row.context_version === envelope.context.context_version))
  }
  const valueById = (envelope, publicId) => envelope.values.find((row) => row.field_public_id === publicId)
  const legalId = '23000000-0000-4000-8000-000000000001'
  const licenseId = '23000000-0000-4000-8000-000000000002'
  const documentsId = '23000000-0000-4000-8000-000000000003'
  for (const envelope of [derivedEnvelopes.A1, derivedEnvelopes.B1, derivedEnvelopes.FORGED]) {
    assert(valueById(envelope, legalId).freshness === 'fresh')
    assert(valueById(envelope, legalId).value === true)
    assert(valueById(envelope, legalId).reason_code === null)
    assert(valueById(envelope, licenseId).freshness === 'unknown')
    assert(valueById(envelope, licenseId).value === null)
    assert(valueById(envelope, licenseId).reason_code === 'NOT_COMPUTED')
    assert(envelope.context.auth_user_public_id === users[envelope === derivedEnvelopes.A1 ? 'A1' : envelope === derivedEnvelopes.B1 ? 'B1' : 'FORGED'].id)
    assert(envelope.context.member_public_id === members.find((member) => member.auth_user_id === envelope.context.auth_user_public_id).public_id)
  }
  assert(valueById(derivedEnvelopes.A1, documentsId).freshness === 'stale')
  assert(valueById(derivedEnvelopes.A1, documentsId).reason_code === 'SOURCE_CHANGED')
  assert(valueById(derivedEnvelopes.A1, documentsId).department_public_id === derivedEnvelopes.A1.context.primary_department_public_id)
  for (const envelope of [derivedEnvelopes.B1, derivedEnvelopes.FORGED]) {
    assert(valueById(envelope, documentsId).freshness === 'unknown')
    assert(valueById(envelope, documentsId).value === null)
    assert(valueById(envelope, documentsId).reason_code === 'NOT_COMPUTED')
    assert(valueById(envelope, documentsId).department_public_id === envelope.context.primary_department_public_id)
  }
  derivedStaleCases += 1
  const reservedUnknown = catalogs.A1.fields.filter((field) => ['has_legal_person_id','has_business_license','documents_complete'].includes(field.field_key))
  assert(reservedUnknown.length === 3)
  assert(reservedUnknown.every((field) => field.status === 'active'))
  assert(reservedUnknown.find((field) => field.field_key === 'has_legal_person_id').public_id === legalId)
  assert(reservedUnknown.find((field) => field.field_key === 'has_business_license').public_id === licenseId)
  assert(reservedUnknown.find((field) => field.field_key === 'documents_complete').public_id === documentsId)
  assert(derivedEnvelopes.A1.context.primary_department_public_id === departmentA.public_id)
  assert(derivedEnvelopes.B1.context.primary_department_public_id === departmentB.public_id)
  assert(derivedEnvelopes.FORGED.context.primary_department_public_id === departmentB.public_id)
  assert(aDerived.filter((item) => item.freshness === 'unknown').every((item) => item.value === null))

  safeStage = 'RT23-06'
  for (const [key] of roles) {
    for (const table of PUBLIC_TABLES) {
      const readResult = await clients[key].from(table).select('*').limit(1)
      assert(Boolean(readResult.error), { p0: true })
      assertSafe(readResult, canaries)
      const result = await clients[key].from(table).insert({})
      assert(Boolean(result.error), { p0: true })
      assertSafe(result, canaries)
      deniedCases += 1
    }
  }
  for (const client of [anon, admin]) {
    for (const table of PUBLIC_TABLES) {
      const readResult = await client.from(table).select('*').limit(1)
      assert(Boolean(readResult.error) || readResult.data?.length === 0, { p0: true })
      assertSafe(readResult, canaries)
      deniedCases += 1
    }
    const history = await client.schema('app_private').from('store_derived_portrait_history').select('*').limit(1)
    assert(Boolean(history.error), { p0: true })
    assertSafe(history, canaries)
  }

  safeStage = 'RT23-07'
  if ((await admin.from('members').update({ status: 'disabled', disabled_at: new Date().toISOString(), disabled_by_member_id: users.SA.memberId, disabled_reason: 'Synthetic runtime' }).eq('id', users.DISABLED.memberId)).error) fail()
  if ((await admin.from('departments').update({ status: 'inactive' }).eq('id', departmentOff.id)).error) fail()
  for (const key of ['DISABLED', 'INACTIVE']) {
    const catalogResult = await clients[key].rpc(PORTRAIT_CATALOG_RPC)
    assert(Boolean(catalogResult.error))
    assert(catalogResult.error.message === 'SESSION_INVALID')
    assertSafe(catalogResult, canaries)
    for (const table of PUBLIC_TABLES) {
      const rows = await clients[key].from(table).select('*').limit(1)
      assert(Boolean(rows.error), { p0: true })
      assertSafe(rows, canaries)
      deniedCases += 1
    }
  }

  safeStage = 'RT23-08'
  const staleSessionsBefore = psqlNumber(`select count(*) from auth.sessions where user_id=${sqlLiteral(users.STALE.id)};`)
  assert(staleSessionsBefore >= 1)
  runPsql(`delete from auth.sessions where user_id=${sqlLiteral(users.STALE.id)};`)
  const staleSessionsAfter = psqlNumber(`select count(*) from auth.sessions where user_id=${sqlLiteral(users.STALE.id)};`)
  assert(staleSessionsAfter === 0)
  const staleCatalog = await clients.STALE.rpc(PORTRAIT_CATALOG_RPC)
  assert(Boolean(staleCatalog.error))
  assert(staleCatalog.error.message === 'SESSION_INVALID')
  assertSafe(staleCatalog, canaries)
  staleSessionDenialCode = staleCatalog.error.message
  const staleDerived = await clients.STALE.rpc(PORTRAIT_DERIVED_RPC, { p_store_public_id: fixture.store_public_id })
  assert(Boolean(staleDerived.error))
  assert(staleDerived.error.message === 'SESSION_INVALID')
  assertSafe(staleDerived, canaries)
  for (const table of PUBLIC_TABLES) {
    const rows = await clients.STALE.from(table).select('*').limit(1)
    assert(Boolean(rows.error), { p0: true })
    assertSafe(rows, canaries)
  }
  staleSessionCases += 1

  safeStage = 'RT23-09'
  const realtimeRows = psqlNumber(`select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history');`)
  assert(realtimeRows === 0, { p0: true })
  auditCanaryHits = psqlNumber(`select count(*) from public.audit_log where ${canaries.map((canary) => `safe_data::text like ${sqlLiteral(`%${canary}%`)}`).join(' or ')};`)
  assert(auditCanaryHits === 0, { p0: true })
  assert(assertions >= MINIMUM_ASSERTIONS)

  const summary = {
    status: 'PASS', assertions, real_jwt_sessions: roles.length, authorized_cases: authorizedCases,
    denied_cases: deniedCases, stale_session_cases: staleSessionCases,
    stale_session_denial_code: staleSessionDenialCode, derived_stale_cases: derivedStaleCases,
    derived_unknown_cases: reservedUnknown.length, realtime_rows: realtimeRows,
    unauthorized_canary_hits: unauthorizedCanaryHits, document_storage_canary_hits: documentStorageCanaryHits,
    forbidden_portrait_key_hits: forbiddenPortraitKeyHits, audit_canary_hits: auditCanaryHits,
    secret_pattern_counts: secretPatternCounts, pii_pattern_count: piiPatternCount,
  }
  const output = JSON.stringify(summary)
  summary.secret_pattern_counts = summary.secret_pattern_counts.map((count, index) => count + (output.match(secretPatterns[index]) ?? []).length)
  summary.pii_pattern_count += piiPatterns.reduce((sum, pattern) => sum + (output.match(pattern) ?? []).length, 0)
  assert(summary.secret_pattern_counts.every((count) => count === 0), { p0: true })
  assert(summary.pii_pattern_count === 0, { p0: true })
  summary.assertions = assertions
  runPsql(runtimeCleanupSql)
  const cleanupVerification = psqlJson(`
    select json_build_object(
      'sessions',(select count(*) from auth.sessions where user_id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')})),
      'users',(select count(*) from auth.users where id in (${Object.values(users).map((user) => sqlLiteral(user.id)).join(',')})),
      'members',(select count(*) from public.members where id in (${memberIds.join(',')})),
      'departments',(select count(*) from public.departments where id in (${departmentIds.join(',')})),
      'accounts',(select count(*) from public.accounts where id=${fixture.account_id}),
      'stores',(select count(*) from public.stores where id=${fixture.store_id}),
      'definitions',(select count(*) from public.portrait_field_definitions where id in (${fixture.definition_ids.join(',')})),
      'manual_values',(select count(*) from public.store_portrait_values where store_id=${fixture.store_id}),
      'derived_values',(select count(*) from public.store_derived_portrait_values where store_id=${fixture.store_id}),
      'reserved_restored',(select count(*) from public.portrait_field_definitions as d
        join jsonb_to_recordset(${sqlLiteral(JSON.stringify(reservedDefinitionSnapshot))}::jsonb)
          as snapshot(id bigint,field_key text,status text,version bigint,updated_at_epoch_microseconds bigint)
          on snapshot.id=d.id
        where d.field_key=snapshot.field_key and d.status=snapshot.status and d.version=snapshot.version
          and (extract(epoch from d.updated_at)*1000000)::bigint=snapshot.updated_at_epoch_microseconds)
    )::text;
  `)
  assert(Object.entries(cleanupVerification).every(([key, value]) => key === 'reserved_restored' ? value === 3 : value === 0))
  runtimeCleanupSql = null
  console.log(JSON.stringify(summary))
}

main().catch(() => {
  if (runtimeCleanupSql) {
    try { runPsql(runtimeCleanupSql) } catch { /* failure output remains stage/counters only */ }
  }
  console.error(JSON.stringify({ status: 'FAIL', stage: safeStage, assertions,
    unauthorized_canary_hits: unauthorizedCanaryHits, document_storage_canary_hits: documentStorageCanaryHits,
    forbidden_portrait_key_hits: forbiddenPortraitKeyHits, audit_canary_hits: auditCanaryHits }))
  process.exit(1)
})
