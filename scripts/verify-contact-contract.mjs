#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const expectedTestPlans = new Map([
  ['0032_wbs_2_2_contacts_schema.sql', 53],
  ['0033_wbs_2_2_contacts_acl.sql', 35],
  ['0034_wbs_2_2_contact_read_rpc.sql', 46],
])
const expectedTests = [...expectedTestPlans.keys()]
const expectedDenialCodes = [
  'AUTH_REQUIRED',
  'SESSION_INVALID',
  'MEMBERSHIP_INACTIVE',
  'DEPARTMENT_INACTIVE',
  'CONTACT_UNAVAILABLE',
  'NOT_CLAIMED',
  'REASON_REQUIRED',
  'REASON_INVALID',
]

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message)
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message)
}

function listFiles(directory, pattern) {
  const target = path.join(root, directory)
  return fs.existsSync(target) ? fs.readdirSync(target).filter((name) => pattern.test(name)).sort() : []
}

function planCount(sql, file, expected) {
  const plans = [...sql.matchAll(/\bselect\s+plan\s*\(\s*(\d+)\s*\)/gi)]
  if (plans.length !== 1) {
    failures.push(`${file} must contain exactly one literal pgTAP plan.`)
    return 0
  }
  const count = Number(plans[0][1])
  if (count !== expected) failures.push(`${file} must plan exactly ${expected} assertions; found ${count}.`)
  return count
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

function workflowStep(name, workflow) {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  if (start < 0) {
    failures.push(`CI must contain the ${name} step.`)
    return ''
  }
  const next = workflow.indexOf('\n      - name: ', start + marker.length)
  return workflow.slice(start, next < 0 ? workflow.length : next)
}

function tableBody(sql, qualifiedName) {
  const escaped = qualifiedName.replace('.', '\\.')
  const match = sql.match(new RegExp(`create\\s+table\\s+${escaped}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'))
  if (!match) failures.push(`Migration must create ${qualifiedName}.`)
  return match?.[1] ?? ''
}

const packageJson = JSON.parse(read('package.json') || '{}')
const workflow = read('.github/workflows/quality.yml')
const contract = read('docs/wbs-2.2/contract-and-scope.md')
const runtime = read('scripts/verify-contact-access-runtime.mjs')
read('docs/wbs-2.2/acceptance-evidence-template.md')
read('docs/wbs-2.2/third-party-review-package-template.md')

const migrations = listFiles('supabase/migrations', /^\d{14}_wbs_2_2_contacts_sensitive\.sql$/)
if (migrations.length !== 1) failures.push(`Expected one WBS 2.2 CLI migration; found ${migrations.length}.`)
const migrationSource = migrations.length === 1 ? read(`supabase/migrations/${migrations[0]}`) : ''
const migration = stripSqlComments(migrationSource)

const actualTests = listFiles('supabase/tests', /_wbs_2_2_.*\.sql$/)
if (actualTests.join('|') !== expectedTests.join('|')) {
  failures.push(`WBS 2.2 test set must be exactly: ${expectedTests.join(', ')}.`)
}
let plannedAssertions = 0
for (const file of expectedTests) {
  const testSql = stripSqlComments(read(`supabase/tests/${file}`))
  plannedAssertions += planCount(testSql, file, expectedTestPlans.get(file))
}
if (plannedAssertions !== 134) failures.push(`WBS 2.2 must plan exactly 134 assertions; found ${plannedAssertions}.`)

if (packageJson.scripts?.['verify:contacts'] !== 'node scripts/verify-contact-contract.mjs') {
  failures.push('package.json must expose verify:contacts.')
}
if (packageJson.scripts?.['verify:contacts:runtime'] !== 'node scripts/verify-contact-access-runtime.mjs') {
  failures.push('package.json must expose verify:contacts:runtime.')
}
if (!/(?:^|&&\s*)npm\s+run\s+verify:contacts(?:\s*&&|\s*$)/.test(packageJson.scripts?.check ?? '')) {
  failures.push('The aggregate check script must run verify:contacts.')
}
const staticStep = workflowStep('Verify contact boundary contract', workflow)
const runtimeStep = workflowStep('Verify contact access runtime', workflow)
requireMatch(staticStep, /^      - name: Verify contact boundary contract\n        run: npm run verify:contacts\n?$/m, 'CI contact static step must run only verify:contacts.')
for (const pattern of [
  /shell: bash/,
  /run: \|/,
  /set \+x/,
  /status_log="\$RUNNER_TEMP\/canwin-contact-status\.log"/,
  /cleanup_contact_status\(\)/,
  /rm -f -- "\$status_log"/,
  /trap cleanup_contact_status EXIT/,
  /trap 'exit 130' INT/,
  /trap 'exit 143' TERM/,
  /install -m 600 \/dev\/null "\$status_log"/,
  /status_json="\$\(npx supabase status -o json 2>"\$status_log"\)"/,
  /::add-mask::%s/,
  /npm run verify:contacts:runtime/,
]) requireMatch(runtimeStep, pattern, `Contact runtime CI step is missing ${pattern}.`)
forbidMatch(runtimeStep, /set -x|\b(?:cat|tail|head|less|tee)\b[^\n]*\$status_log|upload-artifact|GITHUB_(?:OUTPUT|ENV|STEP_SUMMARY)[^\n]*status_log/i, 'Contact runtime step must not replay, publish, or trace credential-bearing status data.')
if ((workflow.match(/npm run verify:contacts:runtime/g) ?? []).length !== 1) failures.push('CI must invoke verify:contacts:runtime exactly once.')
const runtimeOrder = [
  'set +x',
  'status_log="$RUNNER_TEMP/canwin-contact-status.log"',
  'trap cleanup_contact_status EXIT',
  'install -m 600 /dev/null "$status_log"',
  'status_json="$(npx supabase status -o json 2>"$status_log")"',
  '::add-mask::%s',
  'npm run verify:contacts:runtime',
]
let previousRuntimeMarker = -1
for (const marker of runtimeOrder) {
  const position = runtimeStep.indexOf(marker)
  if (position < 0 || position <= previousRuntimeMarker) failures.push(`Contact runtime CI order is invalid at ${marker}.`)
  previousRuntimeMarker = position
}

for (const [pattern, message] of [
  [/const\s+MINIMUM_ASSERTIONS\s*=\s*70\b/, 'Contact runtime must retain the frozen 70-assertion floor.'],
  [/\['STALE',\s*'sales',\s*departmentA\.id,\s*\{\}\]/, 'Contact runtime must create a dedicated real-JWT stale-session actor.'],
  [/select\s+count\(\*\)\s+from\s+auth\.sessions[\s\S]{0,100}?user_id=\$\{sqlLiteral\(users\.STALE\.id\)\}/i, 'Contact runtime must prove the signed-in stale actor has an auth.sessions row.'],
  [/delete\s+from\s+auth\.sessions[\s\S]{0,100}?user_id=\$\{sqlLiteral\(users\.STALE\.id\)\}/i, 'Contact runtime must actually revoke the signed-in stale actor session.'],
  [/assert\(staleSessionsBefore\s*>=\s*1\)/, 'Contact runtime must assert a real session existed before revocation.'],
  [/assert\(staleSessionsAfter\s*===\s*0\)/, 'Contact runtime must assert the session row is absent after revocation.'],
  [/assertDeniedRpc\(\s*await\s+clients\.STALE\.rpc\(\s*['"]read_contact_secret['"][\s\S]{0,280}?canaries,\s*\['SESSION_INVALID'\],?\s*\)/, 'Contact runtime must reuse the revoked actor old JWT and require the exact safe SESSION_INVALID denial.'],
  [/staleSessionCases\s*\+=\s*1/, 'Contact runtime must count the completed stale-session case from executed assertions.'],
  [/stale_session_cases:\s*staleSessionCases/, 'Contact runtime summary must report the executed stale-session count.'],
  [/member_department_revocation_cases:\s*memberDepartmentRevocationCases/, 'Member and department revocations must be reported separately from stale sessions.'],
  [/main\(\)\.catch\(\(\)\s*=>\s*\{\s*console\.error\(JSON\.stringify\(\{\s*status:\s*['"]FAIL['"],\s*stage:\s*safeStage,\s*assertions,\s*unauthorized_canary_hits:\s*unauthorizedCanaryHits,\s*sensitive_key_hits:\s*sensitiveKeyHits,\s*audit_canary_hits:\s*auditCanaryHits,?\s*\}\)\)\s*process\.exit\(1\)\s*\}\)\s*$/m, 'Contact runtime failure output must remain limited to sanitized stage and counters.'],
]) requireMatch(runtime, pattern, message)
forbidMatch(runtime, /old_session_cases\s*:/, 'Member or department inactivity must not be labeled as a stale-session case.')

const publicContacts = tableBody(migration, 'public.contacts')
const privateSecrets = tableBody(migration, 'app_private.contact_secrets')
for (const column of [
  'public_id', 'store_id', 'role_label', 'is_primary', 'status', 'status_reason',
  'status_changed_at', 'created_by_member_id', 'updated_by_member_id', 'created_at',
  'updated_at', 'version',
]) requireMatch(publicContacts, new RegExp(`\\b${column}\\b`, 'i'), `public.contacts must define ${column}.`)
forbidMatch(publicContacts, /\b(?:full_name|mobile|phone|email|wechat|other|channels?|mask(?:ed)?|tail|digest|hash)\b/i, 'public.contacts must not contain sensitive, masked, tail, or recoverable fields.')
forbidMatch(publicContacts, /\b(?:department_id|owner(?:_id)?|claim(?:ed|_id|_at)?|opportunity(?:_id)?|follow_?up|note)\b/i, 'public.contacts must not contain ownership or later-scope fields.')
for (const column of [
  'contact_id', 'full_name', 'mobile', 'phone', 'email', 'wechat', 'other',
  'created_by_member_id', 'updated_by_member_id', 'created_at', 'updated_at', 'version',
]) requireMatch(privateSecrets, new RegExp(`\\b${column}\\b`, 'i'), `contact_secrets must define ${column}.`)

requireMatch(publicContacts, /store_id\s+bigint\s+not\s+null[\s\S]*?references\s+public\.stores\s*\(id\)\s+on\s+delete\s+restrict/i, 'contacts.store_id must use ON DELETE RESTRICT.')
requireMatch(privateSecrets, /contact_id\s+bigint\s+primary\s+key[\s\S]*?references\s+public\.contacts\s*\(id\)\s+on\s+delete\s+restrict/i, 'contact_secrets.contact_id must be one-to-one with ON DELETE RESTRICT.')
for (const marker of ['CONTACT_DELETE_FORBIDDEN', 'CONTACT_IDENTITY_IMMUTABLE', 'CONTACT_SECRET_DELETE_FORBIDDEN', 'CONTACT_SECRET_IDENTITY_IMMUTABLE']) {
  requireMatch(migration, new RegExp(marker), `Missing required immutable/delete marker ${marker}.`)
}

for (const table of ['public.contacts', 'app_private.contact_secrets']) {
  const escaped = table.replace('.', '\\.')
  requireMatch(migration, new RegExp(`alter\\s+table\\s+${escaped}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${table} must enable RLS.`)
  requireMatch(migration, new RegExp(`alter\\s+table\\s+${escaped}\\s+force\\s+row\\s+level\\s+security`, 'i'), `${table} must force RLS.`)
  requireMatch(migration, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+${escaped}\\s+from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`, 'i'), `${table} must revoke every Data API role.`)
}
requireMatch(migration, /revoke\s+all\s+on\s+sequence\s+public\.contacts_id_seq\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i, 'contacts sequence must be revoked.')
requireMatch(migration, /grant\s+select\s+on\s+table\s+public\.contacts\s+to\s+authenticated,\s*service_role/i, 'Only structural SELECT may be granted on contacts.')
forbidMatch(migration, /grant\s+(?:all|insert|update|delete|truncate)[^;]*public\.contacts/i, 'contacts must have no direct write grant.')
forbidMatch(migration, /grant\s+[^;]*app_private\.contact_secrets/i, 'contact_secrets must have no direct grant.')
forbidMatch(migration, /create\s+policy[\s\S]{0,300}?on\s+app_private\.contact_secrets/i, 'contact_secrets must have no normal row policy.')
requireMatch(migration, /supabase_realtime[\s\S]{0,700}?drop\s+table\s+app_private\.contact_secrets/i, 'contact_secrets must be excluded from Realtime.')
forbidMatch(migration, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+app_private\.contact_secrets/i, 'contact_secrets must never enter Realtime.')

const functionBlocks = [...migration.matchAll(/create\s+or\s+replace\s+function[\s\S]*?\$\$;/gi)].map((match) => match[0])
const definerBlocks = functionBlocks.filter((block) => /security\s+definer/i.test(block))
if (definerBlocks.length === 0) failures.push('A private SECURITY DEFINER capability is required.')
for (const block of definerBlocks) requireMatch(block, /set\s+search_path\s*=\s*''/i, 'Every SECURITY DEFINER must set an empty search_path.')
forbidMatch(migration, /(?:raw_user_meta_data|user_metadata|app_metadata|auth\.jwt\s*\(\s*\)[\s\S]{0,160}(?:role|department))/i, 'Authorization must not trust JWT metadata.')
requireMatch(migration, /create\s+or\s+replace\s+function\s+public\.read_contact_secret\s*\(\s*p_contact_public_id\s+uuid,\s*p_reason\s+text\s+default\s+null,\s*p_correlation_id\s+uuid\s+default\s+null\s*\)/i, 'Public RPC signature must contain only public_id, reason, and correlation_id.')
requireMatch(migration, /revoke\s+execute\s+on\s+function\s+app_private\.read_contact_secret\s*\(uuid,\s*text,\s*uuid\)\s+from\s+public,\s*anon,\s*service_role/i, 'Private reader must revoke default, anon, and service_role execution.')
requireMatch(migration, /revoke\s+execute\s+on\s+function\s+public\.read_contact_secret\s*\(uuid,\s*text,\s*uuid\)\s+from\s+public,\s*anon,\s*service_role/i, 'Public wrapper must revoke default, anon, and service_role execution.')
requireMatch(migration, /grant\s+execute\s+on\s+function\s+public\.read_contact_secret\s*\(uuid,\s*text,\s*uuid\)\s+to\s+authenticated/i, 'Public wrapper execute must be authenticated-only.')
for (const marker of ['current_session_is_valid()', 'current_member_id()', "v_actor_role = 'super_admin'", "'NOT_CLAIMED'", "'REASON_REQUIRED'", "'REASON_INVALID'"]) {
  requireMatch(migration, new RegExp(marker.replace(/[()]/g, '\\$&'), 'i'), `Missing live authorization marker ${marker}.`)
}
forbidMatch(migration, /CONTACT_ACCESS_DENIED/, 'Denied responses must use only the eight frozen reason codes.')
requireMatch(migration, /write_audit_log[\s\S]{0,900}'denied'/i, 'Denied reads must be audited.')
requireMatch(migration, /write_audit_log[\s\S]{0,2400}'success'/i, 'Allowed reads must be audited.')
requireMatch(migration, /jsonb_build_object\s*\(\s*'type'\s*,[\s\S]{0,100}'value'/i, 'Authorized channels must use the frontend type/value contract.')
forbidMatch(migration, /jsonb_build_object\s*\(\s*'kind'\s*,[\s\S]{0,100}'value'/i, 'Authorized channels must not drift to kind/value.')
forbidMatch(migration, /create\s+table\s+(?:public|app_private)\.[a-z0-9_]*(?:claim|opportunit|assignment|ownership|lead)[a-z0-9_]*/i, 'WBS 2.2 must not create shadow authorization tables.')

const contactContract = read('apps/web/src/contact/contact-contract.ts')
const contactAdapter = read('apps/web/src/contact/contact-adapter.ts')
const contactErrors = read('apps/web/src/contact/contact-errors.ts')
const contactState = read('apps/web/src/contact/contact-state.ts')
const contactPanel = read('apps/web/src/contact/ContactSensitivePanel.tsx')
const contactPanelStyles = read('apps/web/src/contact/contact-sensitive-panel.css')
const contactPanelTests = read('apps/web/src/contact/ContactSensitivePanel.test.tsx')
const contactEvidenceHtml = read('apps/web/evidence/contact-mobile.html')
const contactEvidence = read('apps/web/src/evidence/contact-mobile.tsx')
const productionMain = read('apps/web/src/main.tsx')
const contactProductionFiles = listFiles('apps/web/src/contact', /\.(?:ts|tsx)$/).filter((name) => !name.includes('.test.'))
const denialArray = contactContract.match(/export\s+const\s+CONTACT_DENIAL_REASON_CODES\s*=\s*\[([\s\S]*?)\]\s+as\s+const/)
const frontendDenialCodes = denialArray ? [...denialArray[1].matchAll(/['"]([A-Z_]+)['"]/g)].map((match) => match[1]) : []
if (frontendDenialCodes.join('|') !== expectedDenialCodes.join('|')) {
  failures.push(`Frontend denial codes must be exactly: ${expectedDenialCodes.join(', ')}.`)
}
const migrationDenialCodes = new Set([
  ...[...migration.matchAll(/return\s+query\s+select\s+false\s*,\s*'([A-Z_]+)'/gi)].map((match) => match[1].toUpperCase()),
  ...[...migration.matchAll(/v_reason_code\s*:=\s*'([A-Z_]+)'/gi)].map((match) => match[1].toUpperCase()),
])
if ([...migrationDenialCodes].sort().join('|') !== [...expectedDenialCodes].sort().join('|')) {
  failures.push(`Migration denial codes must be exactly: ${expectedDenialCodes.join(', ')}.`)
}
requireMatch(migration, /'reason_code'\s*,\s*v_reason_code/, 'Denied response must project only the validated frozen reason code variable.')
for (const field of ['public_id', 'store_id', 'role_label', 'is_primary', 'status', 'version']) requireMatch(contactContract, new RegExp(`['"]${field}['"]`), `Frontend structural whitelist must include ${field}.`)
requireMatch(contactAdapter, /CONTACT_READ_RPC_NAME\s*=\s*['"]read_contact_secret['"]/, 'Frontend adapter must call the frozen read_contact_secret RPC.')
requireMatch(contactAdapter, /p_contact_public_id[\s\S]{0,160}p_reason/, 'Frontend RPC must send only the public id and reason contract.')
forbidMatch(contactAdapter, /\b(?:role_id|department_id|member_id|owner_id)\b/, 'Frontend adapter must not send authorization identity fields.')
for (const event of ['AUTH_CHANGED', 'PERMISSION_REVOKED', 'APP_RESUMED', 'NETWORK_OFFLINE', 'NETWORK_RESTORED']) requireMatch(contactState, new RegExp(`['"]${event}['"]`), `Sensitive memory must clear on ${event}.`)
requireMatch(contactState, /active_access_request_id/, 'Sensitive state must bind each response to an active request id.')
requireMatch(contactState, /state\.status\s*!==\s*['"]authorizing['"][\s\S]{0,160}state\.active_access_request_id\s*!==\s*event\.request_id/, 'Stale access responses must be ignored after revocation or request supersession.')
requireMatch(contactAdapter, /\[\.\.\.normalized\]\.length/, 'Access-reason length must count Unicode code points like PostgreSQL char_length.')
for (const marker of [
  '申请查看联系方式',
  '查看理由',
  '正在验证查看权限',
  '该联系人暂无可展示的身份或联系方式',
]) requireMatch(contactPanel, new RegExp(marker), `Contact mobile panel must render the frozen state: ${marker}.`)
requireMatch(contactErrors, /联系人信息暂时未能读取。/, 'Contact errors must retain the frozen stable failure copy.')
requireMatch(contactPanel, /state\.error\.message[\s\S]{0,180}state\.error\.recovery/, 'Contact panel must render only the normalized safe error and recovery copy.')
requireMatch(contactPanel, /ContactSensitivePanelView/, 'Contact UI must expose the reviewed view used by the mobile evidence fixture.')
requireMatch(contactPanel, /readSensitiveContact[\s\S]{0,300}contactViewMachine/, 'Contact UI must reuse the frozen adapter and sensitive-memory state machine.')
requireMatch(contactPanelStyles, /width:\s*min\(100%,\s*440px\)/, 'Contact panel must remain bounded by the mobile viewport.')
requireMatch(contactPanelStyles, /@media\s*\(max-width:\s*380px\)/, 'Contact panel must include the frozen 360px mobile layout rule.')
for (const scenario of ['locked', 'reason', 'loading', 'empty', 'error']) {
  requireMatch(contactEvidence, new RegExp(`['"]${scenario}['"]`), `Contact evidence fixture must support the ${scenario} scenario.`)
}
requireMatch(contactEvidenceHtml, /name="viewport"\s+content="width=device-width, initial-scale=1\.0"/, 'Contact evidence HTML must declare a mobile viewport.')
requireMatch(contactEvidence, /data-evidence-viewport="360x800"/, 'Contact evidence fixture must identify the reviewed 360x800 viewport.')
for (const marker of ['360px viewport', '查看理由', '正在验证查看权限', '暂无可展示', 'stable safe error']) {
  requireMatch(contactPanelTests, new RegExp(marker, 'i'), `Contact panel tests must cover ${marker}.`)
}
forbidMatch(productionMain, /contact-mobile|ContactSensitivePanel/, 'The WBS 2.2 evidence fixture and sensitive panel must not be wired into the production entry before the owning route is frozen.')
for (const file of contactProductionFiles) {
  const text = read(`apps/web/src/contact/${file}`)
  forbidMatch(text, /localStorage|sessionStorage|indexedDB|caches\.open|serviceWorker|captureException|analytics\.|console\.(?:log|debug|info|warn|error)/i, `Contact production code must not persist or emit sensitive data: ${file}.`)
}

requireMatch(contract, /不实现[\s\S]{0,120}(?:领取|商机|证件上传|OCR|AI|通知)/i, 'The WBS 2.2 contract must explicitly exclude later scope.')

if (failures.length) {
  console.error(`WBS 2.2 contact contract verification failed (${failures.length}).`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({
  status: 'PASS',
  migration_files: migrations.length,
  pg_tap_suites: expectedTests.length,
  planned_assertions: plannedAssertions,
  frontend_files_scanned: contactProductionFiles.length,
  unauthorized_sensitive_findings: 0,
  frontend_persistence_findings: 0,
}))
