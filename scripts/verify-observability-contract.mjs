#!/usr/bin/env node
/**
 * WBS 1.6 static RLS, audit, event/outbox, tracing, and observability contract.
 *
 * This verifier proves repository structure only. It does not replace the
 * full pgTAP run, the local real-JWT/concurrency runtime, or independent
 * review of exact-SHA CI evidence.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n')
}

function parseJson(relativePath) {
  const text = read(relativePath)
  try {
    return JSON.parse(text)
  } catch {
    failures.push(`${relativePath} is not valid JSON.`)
    return {}
  }
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message)
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message)
}

function listFiles(directory, predicate = () => true) {
  const target = path.join(root, directory)
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return []
  return fs.readdirSync(target).filter(predicate).sort()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function functionBlock(sql, qualifiedName) {
  const escaped = escapeRegExp(qualifiedName)
  const startMatch = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escaped}\\s*\\(`,
    'i',
  ).exec(sql)
  if (!startMatch) {
    failures.push(`Missing required function: ${qualifiedName}`)
    return ''
  }
  const start = startMatch.index
  const next = /create\s+or\s+replace\s+function\s+/ig
  next.lastIndex = start + startMatch[0].length
  const nextMatch = next.exec(sql)
  return sql.slice(start, nextMatch?.index ?? sql.length)
}

function workflowStep(text, name) {
  const marker = `      - name: ${name}\n`
  const start = text.indexOf(marker)
  if (start < 0) {
    failures.push(`Missing required Quality step: ${name}`)
    return ''
  }
  const next = text.indexOf('\n      - name: ', start + marker.length)
  return text.slice(start, next < 0 ? text.length : next).trimEnd()
}

function planCount(sql, relativePath) {
  const matches = [...sql.matchAll(/\bselect\s+plan\s*\(\s*(\d+)\s*\)/gi)]
  if (matches.length !== 1) {
    failures.push(`${relativePath} must contain exactly one literal pgTAP plan.`)
    return 0
  }
  return Number(matches[0][1])
}

const packageJson = parseJson('package.json')
const workflow = read('.github/workflows/quality.yml')
const runtime = read('scripts/verify-observability-runtime.mjs')
const authAdapter = read('apps/web/src/auth/auth-adapter.ts')
const authAdapterTests = read('apps/web/src/auth/auth-adapter.test.ts')
const authErrors = read('apps/web/src/auth/auth-errors.ts')
const authErrorTests = read('apps/web/src/auth/auth-errors.test.ts')
const authTypes = read('apps/web/src/auth/auth-types.ts')
const contractDoc = read('docs/wbs-1.6/contract-and-scope.md')
const acceptanceTemplate = read('docs/wbs-1.6/acceptance-evidence-template.md')
const supervisorTemplate = read('docs/wbs-1.6/third-party-review-package-template.md')

if (packageJson.scripts?.['verify:observability'] !== 'node scripts/verify-observability-contract.mjs') {
  failures.push('package.json must expose the WBS 1.6 static verifier.')
}
if (packageJson.scripts?.['verify:observability:runtime'] !== 'node scripts/verify-observability-runtime.mjs') {
  failures.push('package.json must expose the WBS 1.6 runtime verifier.')
}
if (!/(?:^|&&\s*)npm\s+run\s+verify:observability(?:\s*&&|\s*$)/.test(packageJson.scripts?.check ?? '')) {
  failures.push('The aggregate check script must invoke verify:observability.')
}

const staticStep = workflowStep(workflow, 'Verify observability contract')
requireMatch(staticStep, /^\s*run:\s*npm run verify:observability\s*$/m, 'Quality must run the static WBS 1.6 verifier.')
const authRuntimeStep = workflowStep(workflow, 'Verify real Auth sessions')
const observabilityRuntimeStep = workflowStep(workflow, 'Verify audit, event, and observability runtime')
requireMatch(
  observabilityRuntimeStep,
  /^\s*run:\s*npm run verify:observability:runtime\s*$/m,
  'Quality must run the WBS 1.6 runtime as a simple independent step.',
)
const authRuntimePosition = workflow.indexOf('      - name: Verify real Auth sessions\n')
const observabilityRuntimePosition = workflow.indexOf('      - name: Verify audit, event, and observability runtime\n')
if (authRuntimePosition < 0 || observabilityRuntimePosition <= authRuntimePosition) {
  failures.push('The WBS 1.6 runtime must run after the existing real Auth runtime step.')
}
forbidMatch(
  observabilityRuntimeStep,
  /supabase\s+status|SUPABASE_(?:SECRET|PUBLISHABLE)|CANWIN_TEST_(?:SECRET|PUBLISHABLE)|docker\s+exec/i,
  'The WBS 1.6 workflow step must not duplicate sensitive shell setup; the Node runtime captures local status in memory.',
)
if (authRuntimeStep === '') failures.push('The existing Auth runtime step must remain present and independently fingerprinted.')

const migrations = listFiles('supabase/migrations', (entry) => /^\d{14}_wbs_1_6_observability_foundation\.sql$/.test(entry))
if (migrations.length !== 1) {
  failures.push(`Expected exactly one WBS 1.6 migration, found ${migrations.length}.`)
}
const migrationPath = migrations.length === 1 ? `supabase/migrations/${migrations[0]}` : ''
const migration = migrationPath ? read(migrationPath) : ''
if (migration.trim() === '') failures.push('The WBS 1.6 migration must not be empty.')

const expectedTests = [
  '0020_wbs_1_6_schema_rls_append_only.sql',
  '0021_wbs_1_6_event_outbox_atomicity.sql',
  '0022_wbs_1_6_trace_error_metrics.sql',
]
const actualWbs16Tests = listFiles('supabase/tests', (entry) => /^002\d_wbs_1_6_.*\.sql$/.test(entry))
if (actualWbs16Tests.join('|') !== expectedTests.join('|')) {
  failures.push(`WBS 1.6 must contain exactly the three frozen pgTAP files: ${expectedTests.join(', ')}.`)
}
const wbs16TestTexts = Object.fromEntries(
  expectedTests.map((file) => [file, read(`supabase/tests/${file}`)]),
)
let wbs16Assertions = 0
for (const file of expectedTests) wbs16Assertions += planCount(wbs16TestTexts[file], `supabase/tests/${file}`)
if (wbs16Assertions < 72) failures.push(`WBS 1.6 pgTAP must plan at least 72 assertions; found ${wbs16Assertions}.`)
let totalAssertions = 0
for (const file of listFiles('supabase/tests', (entry) => entry.endsWith('.sql'))) {
  totalAssertions += planCount(read(`supabase/tests/${file}`), `supabase/tests/${file}`)
}
if (totalAssertions < 126) failures.push(`The full pgTAP suite must plan at least 126 assertions; found ${totalAssertions}.`)

const schemaTests = wbs16TestTexts['0020_wbs_1_6_schema_rls_append_only.sql']
for (const [pattern, message] of [
  [/rowsecurity|row_security|relforcerowsecurity/i, 'Schema pgTAP must prove RLS and FORCE RLS.'],
  [/service_role[\s\S]{0,240}(?:no|cannot|<>\s*'SELECT'|0::bigint)/i, 'Schema pgTAP must prove the service_role write/default-deny boundary.'],
  [/append[_ -]?only|rejects?\s+(?:UPDATE|DELETE)/i, 'Schema pgTAP must exercise append-only mutation denial.'],
  [/security\s+definer[\s\S]{0,500}security\s+invoker|prosecdef/i, 'Schema pgTAP must prove the private-definer/public-invoker metrics boundary.'],
  [/domain_events_causation|event_outbox_event_envelope/i, 'Schema pgTAP must prove causation and outbox composite database constraints.'],
  [/create\s+table\s+public\.wbs_1_6_ctas_probe\s+as[\s\S]{0,700}relrowsecurity[\s\S]{0,700}relforcerowsecurity/i, 'Schema pgTAP must prove CREATE TABLE AS receives automatic RLS and FORCE RLS.'],
  [/select[\s\S]{0,80}\sinto\s+public\.wbs_1_6_select_into_probe[\s\S]{0,700}relrowsecurity[\s\S]{0,700}relforcerowsecurity/i, 'Schema pgTAP must prove SELECT INTO receives automatic RLS and FORCE RLS.'],
]) requireMatch(schemaTests, pattern, message)

const eventTests = wbs16TestTexts['0021_wbs_1_6_event_outbox_atomicity.sql']
for (const [pattern, message] of [
  [/idempotent[\s\S]{0,240}(?:replay|original event)/i, 'Event pgTAP must prove idempotent replay.'],
  [/aggregate_sequence[\s\S]{0,240}(?:1|sequence)/i, 'Event pgTAP must prove per-aggregate sequence allocation.'],
  [/causation[\s\S]{0,240}correlation/i, 'Event pgTAP must prove causation/correlation consistency.'],
  [/sensitive_(?:object|array)|nested sensitive/i, 'Event pgTAP must include recursive normalized sensitive-key canaries.'],
  [/rollback[\s\S]{0,600}(?:domain_events|event)[\s\S]{0,600}(?:event_outbox|outbox)[\s\S]{0,600}(?:aggregate_event_sequences|sequence)/i, 'Event pgTAP must prove atomic rollback across event, outbox, and sequence state.'],
]) requireMatch(eventTests, pattern, message)

const traceTests = wbs16TestTexts['0022_wbs_1_6_trace_error_metrics.sql']
for (const [pattern, message] of [
  [/request_id[\s\S]{0,300}correlation_id|correlation_id[\s\S]{0,300}request_id/i, 'Trace pgTAP must prove request/correlation behavior.'],
  [/safe_(?:params|data|context)[\s\S]{0,260}sensitive/i, 'Trace pgTAP must prove safe-error sensitive-key rejection.'],
  [/super_admin[\s\S]{0,320}(?:metrics|observability)/i, 'Metrics pgTAP must prove the active super_admin success path.'],
  [/MEMBERSHIP_INACTIVE/i, 'Metrics pgTAP must prove inactive member/department denial.'],
  [/FORBIDDEN/i, 'Metrics pgTAP must prove fail-closed role denial.'],
  [/user_metadata[\s\S]{0,300}(?:FORBIDDEN|stale|forged)/i, 'Metrics pgTAP must prove stale or forged JWT metadata cannot authorize.'],
  [/mixed_email_value[\s\S]{0,500}example\.test/i, 'Trace pgTAP must reject mixed strings containing both non-example and example.test addresses.'],
]) requireMatch(traceTests, pattern, message)

const publicTables = [
  'domain_event_definitions',
  'audit_log',
  'domain_events',
  'event_outbox',
  'operational_errors',
]
for (const table of publicTables) {
  requireMatch(migration, new RegExp(`\\bcreate\\s+table\\s+public\\.${table}\\b`, 'i'), `Migration must create public.${table}.`)
  requireMatch(migration, new RegExp(`\\balter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\b`, 'i'), `public.${table} must enable RLS.`)
  requireMatch(migration, new RegExp(`\\balter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security\\b`, 'i'), `public.${table} must force RLS.`)
  for (const role of ['public', 'anon', 'authenticated']) {
    requireMatch(
      migration,
      new RegExp(`\\brevoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+[^;]*\\b${role}\\b`, 'i'),
      `public.${table} must explicitly revoke ${role}.`,
    )
  }
  requireMatch(
    migration,
    new RegExp(`\\bgrant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+service_role\\b`, 'i'),
    `service_role must receive only explicit SELECT on public.${table}.`,
  )
  forbidMatch(
    migration,
    new RegExp(`\\bgrant\\s+(?:all(?:\\s+privileges)?|[^;]*(?:insert|update|delete|truncate|references|trigger)[^;]*)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+service_role\\b`, 'i'),
    `service_role must not receive write privileges on public.${table}.`,
  )
  forbidMatch(
    migration,
    new RegExp(`\\bcreate\\s+policy\\b[\\s\\S]{0,320}?\\bon\\s+public\\.${table}\\b`, 'i'),
    `public.${table} must not expose a permissive or role-targeted row policy.`,
  )
}

requireMatch(migration, /\bcreate\s+table\s+app_private\.aggregate_event_sequences\b/i, 'Migration must create app_private.aggregate_event_sequences.')
for (const mode of ['enable', 'force']) {
  requireMatch(
    migration,
    new RegExp(`\\balter\\s+table\\s+app_private\\.aggregate_event_sequences\\s+${mode}\\s+row\\s+level\\s+security\\b`, 'i'),
    `app_private.aggregate_event_sequences must ${mode.toUpperCase()} RLS.`,
  )
}
forbidMatch(migration, /\bgrant\s+[^;]*\bon\s+(?:all\s+sequences|sequence\s+[^;]+)\s+to\s+service_role\b/i, 'WBS 1.6 must not grant a new sequence to service_role.')

for (const table of ['domain_event_definitions', 'audit_log', 'domain_events', 'operational_errors']) {
  requireMatch(
    migration,
    new RegExp(`create\\s+trigger[\\s\\S]{0,240}?before\\s+(?:update\\s+or\\s+delete|delete\\s+or\\s+update)[\\s\\S]{0,80}?truncate[\\s\\S]{0,80}?on\\s+public\\.${table}\\b`, 'i'),
    `public.${table} must reject UPDATE, DELETE, and TRUNCATE as an append-only ledger.`,
  )
}
requireMatch(
  migration,
  /create\s+trigger\s+event_outbox_protect_rows[\s\S]{0,160}?before\s+update\s+or\s+delete[\s\S]{0,80}?on\s+public\.event_outbox\b/i,
  'public.event_outbox must protect the event envelope from UPDATE and reject DELETE.',
)
requireMatch(
  migration,
  /create\s+trigger\s+event_outbox_protect_truncate[\s\S]{0,120}?before\s+truncate[\s\S]{0,80}?on\s+public\.event_outbox\b/i,
  'public.event_outbox must reject TRUNCATE separately from future controlled state transitions.',
)
const outboxProtectionBlock = functionBlock(migration, 'app_private.protect_event_outbox')
requireMatch(outboxProtectionBlock, /tg_op\s+in\s*\(\s*'DELETE'\s*,\s*'TRUNCATE'\s*\)/i, 'Outbox protection must reject DELETE and TRUNCATE.')
requireMatch(outboxProtectionBlock, /event outbox envelope is immutable/i, 'Outbox protection must keep the immutable event envelope fixed.')

for (const token of [
  'event_id', 'event_type', 'schema_version', 'aggregate_type', 'aggregate_id',
  'aggregate_sequence', 'producer', 'idempotency_key', 'request_id',
  'correlation_id', 'causation_event_id', 'payload', 'payload_schema',
  'schema_fingerprint',
]) {
  requireMatch(migration, new RegExp(`\\b${token}\\b`, 'i'), `Migration must define ${token}.`)
}
requireMatch(
  migration,
  /unique\s*\(\s*aggregate_type\s*,\s*aggregate_id\s*,\s*aggregate_sequence\s*\)/i,
  'Domain events must have a unique per-aggregate sequence.',
)
requireMatch(
  migration,
  /unique\s*\(\s*producer\s*,\s*idempotency_key\s*\)/i,
  'Domain events must have a stable producer/idempotency unique key.',
)
requireMatch(
  migration,
  /foreign\s+key\s*\(\s*event_id\s*,\s*event_type\s*,\s*schema_version\s*,\s*correlation_id\s*\)[\s\S]{0,160}?references\s+public\.domain_events\s*\(\s*event_id\s*,\s*event_type\s*,\s*schema_version\s*,\s*correlation_id\s*\)/i,
  'event_outbox must use a composite FK binding event identity, schema, and correlation.',
)
requireMatch(
  migration,
  /create\s+index\s+event_outbox_envelope_lookup_idx\s+on\s+public\.event_outbox\s*\(\s*event_type\s*,\s*schema_version\s*,\s*correlation_id\s*\)/i,
  'Every non-event-id column in the composite outbox envelope FK must be indexed for the full regression contract.',
)
requireMatch(
  migration,
  /schema_fingerprint[\s\S]{0,600}?(?:sha256|sha-256|digest\s*\([^,]+,\s*'sha256')/i,
  'Definition schema_fingerprint must be validated from canonical payload_schema SHA-256.',
)
const safeJsonBlock = functionBlock(migration, 'app_private.assert_safe_json')
for (const alternatives of [
  ['phone'], ['email'], ['id_number', 'idnumber'], ['document_url', 'documenturl'],
  ['token'], ['password'], ['jwt'], ['secret'],
]) {
  requireMatch(
    safeJsonBlock,
    new RegExp(`\\b(?:${alternatives.join('|')})\\b`, 'i'),
    `Sensitive payload guard must cover ${alternatives[0]} after key normalization.`,
  )
}
requireMatch(safeJsonBlock, /jsonb_(?:object_keys|each)|jsonb_path_(?:query|exists)|\?\|/i, 'Sensitive payload protection must recursively inspect JSON keys, not only string values.')
requireMatch(safeJsonBlock, /regexp_matches[\s\S]{0,420}email_match\[1\][\s\S]{0,120}@example\\\.test\$/i, 'Sensitive value protection must inspect every email match and allow only addresses ending in example.test.')

const traceBlock = functionBlock(migration, 'app_private.new_trace_context')
requireMatch(traceBlock, /p_correlation_id\s+uuid\s+default\s+null/i, 'new_trace_context must expose only optional correlation input.')
requireMatch(traceBlock, /set_config\s*\([^)]*(?:request_id|correlation_id)[^)]*,\s*true\s*\)/i, 'new_trace_context must store tracing in transaction-local GUCs.')
requireMatch(traceBlock, /current_setting\s*\([^)]*(?:request_id|correlation_id)[^)]*,\s*true\s*\)/i, 'new_trace_context must reuse transaction-local tracing.')
requireMatch(traceBlock, /correlation_id[\s\S]{0,240}request_id|request_id[\s\S]{0,240}correlation_id/i, 'Correlation must default to the database-generated request ID.')

const emitBlock = functionBlock(migration, 'app_private.emit_domain_event')
for (const signature of [
  /p_event_type\s+text/i,
  /p_schema_version\s+integer/i,
  /p_aggregate_type\s+text/i,
  /p_aggregate_id\s+text/i,
  /p_producer\s+text/i,
  /p_idempotency_key\s+uuid/i,
  /p_payload\s+jsonb\s+default\s+'\{\}'::jsonb/i,
  /p_causation_event_id\s+uuid\s+default\s+null/i,
  /p_actor_member_id\s+bigint\s+default\s+null/i,
  /p_correlation_id\s+uuid\s+default\s+null/i,
]) requireMatch(emitBlock, signature, 'emit_domain_event must match the frozen WBS 1.6 signature.')
requireMatch(emitBlock, /for\s+update|on\s+conflict/i, 'emit_domain_event must serialize or atomically arbitrate aggregate/idempotency writes.')
requireMatch(emitBlock, /event_outbox/i, 'emit_domain_event must write the outbox in the same transaction.')
requireMatch(emitBlock, /causation_event_id[\s\S]{0,900}correlation_id/i, 'emit_domain_event must enforce causation/correlation consistency.')
requireMatch(emitBlock, /write_audit_log/i, 'Successful and idempotent event paths must write safe audit evidence.')

for (const helper of ['new_trace_context', 'write_audit_log', 'record_operational_error', 'emit_domain_event']) {
  const block = functionBlock(migration, `app_private.${helper}`)
  requireMatch(block, /set\s+search_path\s*=\s*''/i, `app_private.${helper} must fix an empty search_path.`)
  forbidMatch(
    migration,
    new RegExp(`grant\\s+(?:all(?:\\s+privileges)?|execute)\\s+on\\s+function\\s+app_private\\.${helper}\\s*\\([^;]*?\\)\\s+to\\s+(?:[^;]*\\b)?(?:public|anon|authenticated|service_role)\\b`, 'i'),
    `app_private.${helper} must not be executable by public, anon, authenticated, or service_role.`,
  )
}

const privateMetrics = functionBlock(migration, 'app_private.get_observability_snapshot')
requireMatch(privateMetrics, /security\s+definer/i, 'Private observability metrics must be SECURITY DEFINER.')
requireMatch(privateMetrics, /set\s+search_path\s*=\s*''/i, 'Private observability metrics must fix an empty search_path.')
requireMatch(privateMetrics, /current_member_id\s*\(/i, 'Private metrics must resolve the live active member and department through the authoritative helper.')
requireMatch(privateMetrics, /(?:role|v_role)[\s\S]{0,80}(?:=|<>|!=)\s*'super_admin'/i, 'Private metrics must explicitly gate super_admin, including fail-closed negative comparison.')
requireMatch(privateMetrics, /FORBIDDEN/i, 'Private metrics must return the stable FORBIDDEN branch for non-super-administrators.')
requireMatch(privateMetrics, /write_audit_log/i, 'Metrics access must write safe audit evidence.')
for (const key of [
  'schema_version', 'generated_at', 'window_seconds', 'domain_events_total',
  'domain_events_in_window', 'audit_log_total', 'audit_denials_in_window',
  'operational_errors_total', 'operational_errors_in_window',
  'outbox_pending_total', 'outbox_dead_letter_total', 'oldest_outbox_age_seconds',
]) requireMatch(privateMetrics, new RegExp(`['\"]${key}['\"]`, 'i'), `Metrics allow-list must include ${key}.`)
forbidMatch(privateMetrics, /['\"](?:payload|actor_id|actor_member_id|recipient_id|idempotency_key|email|phone|document_url)['\"]/i, 'Metrics must not expose row identifiers or sensitive payload fields.')

const publicMetrics = functionBlock(migration, 'public.get_observability_snapshot')
requireMatch(publicMetrics, /p_window_seconds\s+integer\s+default\s+300/i, 'Public metrics wrapper must default to a 300-second window.')
requireMatch(publicMetrics, /p_correlation_id\s+uuid\s+default\s+null/i, 'Public metrics wrapper must accept an optional correlation UUID.')
requireMatch(publicMetrics, /security\s+invoker/i, 'Public metrics wrapper must be SECURITY INVOKER.')
requireMatch(publicMetrics, /set\s+search_path\s*=\s*''/i, 'Public metrics wrapper must fix an empty search_path.')
requireMatch(publicMetrics, /app_private\.get_observability_snapshot/i, 'Public metrics wrapper must delegate to the private SECURITY DEFINER implementation.')
for (const role of ['public', 'anon', 'service_role']) {
  requireMatch(
    migration,
    new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+app_private\\.get_observability_snapshot\\s*\\([^;]*\\)\\s+from\\s+[^;]*\\b${role}\\b`, 'i'),
    `Private metrics must revoke ${role} execution.`,
  )
}
requireMatch(migration, /grant\s+execute\s+on\s+function\s+app_private\.get_observability_snapshot\s*\([^;]*\)\s+to\s+authenticated/i, 'Authenticated must be able to traverse the private metrics implementation through the invoker wrapper.')
requireMatch(migration, /grant\s+execute\s+on\s+function\s+public\.get_observability_snapshot\s*\([^;]*\)\s+to\s+authenticated/i, 'Only authenticated must receive public metrics wrapper execution.')
for (const role of ['public', 'anon', 'service_role']) {
  requireMatch(
    migration,
    new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.get_observability_snapshot\\s*\\([^;]*\\)\\s+from\\s+[^;]*\\b${role}\\b`, 'i'),
    `Public metrics wrapper must revoke ${role} execution.`,
  )
}

for (const match of migration.matchAll(/create\s+or\s+replace\s+function\s+public\.[\s\S]*?(?=create\s+or\s+replace\s+function|$)/gi)) {
  forbidMatch(match[0], /security\s+definer/i, 'No public-schema function may be SECURITY DEFINER.')
}
forbidMatch(migration, /(?:raw_)?user_metadata|auth\.jwt\s*\([^)]*\)[\s\S]{0,120}(?:role|department)/i, 'WBS 1.6 authorization must not trust user metadata or stale role claims.')
requireMatch(migration, /command\.command_tag\s+in\s*\(\s*'CREATE TABLE'\s*,\s*'CREATE TABLE AS'\s*,\s*'SELECT INTO'\s*\)/i, 'The secure-public-table trigger function must cover CREATE TABLE, CREATE TABLE AS, and SELECT INTO.')
requireMatch(migration, /when\s+tag\s+in\s*\(\s*'CREATE TABLE'\s*,\s*'CREATE TABLE AS'\s*,\s*'SELECT INTO'\s*\)/i, 'The DDL event trigger must fire for CREATE TABLE, CREATE TABLE AS, and SELECT INTO.')

requireMatch(authTypes, /correlation_id\?:\s*string\s*\|\s*null/, 'Frontend safe errors must support an optional correlation_id.')
requireMatch(authAdapter, /FunctionsHttpError/, 'Frontend adapter must recognize FunctionsHttpError.')
requireMatch(authAdapter, /error\.context[\s\S]{0,180}context\.json\s*\(/, 'Frontend adapter must parse the safe Edge error envelope from FunctionsHttpError.context.json().')
requireMatch(authAdapter, /correlation_id/, 'Frontend adapter must preserve a safe correlation_id.')
requireMatch(authAdapter, /unexpectedEnvelopeError\s*\(\)/, 'Frontend adapter must fail closed for non-JSON or malformed envelopes.')
requireMatch(authErrors, /traceIdPattern[\s\S]{0,220}safeTraceId/, 'Frontend must validate trace identifiers as safe UUIDs.')
requireMatch(authAdapterTests, /FunctionsHttpError\s+context/i, 'Frontend tests must cover a stable FunctionsHttpError context envelope.')
requireMatch(authAdapterTests, /invalid\s+trace\s+identifiers/i, 'Frontend tests must drop invalid request/correlation identifiers.')
requireMatch(authAdapterTests, /non-JSON\s+FunctionsHttpError/i, 'Frontend tests must fail closed for a non-JSON Edge error body.')
requireMatch(authErrorTests, /preserves\s+validated\s+trace\s+identifiers/i, 'Frontend error tests must preserve valid request/correlation UUIDs.')
requireMatch(authErrorTests, /control-character/i, 'Frontend error tests must reject control-character trace identifiers.')

requireMatch(runtime, /spawnSync\s*\(/, 'Runtime must capture Supabase status with spawnSync.')
requireMatch(runtime, /--no-install[\s\S]{0,120}supabase[\s\S]{0,120}status[\s\S]{0,120}-o[\s\S]{0,120}json/i, 'Runtime must obtain locked local Supabase status as JSON in memory without network installation.')
requireMatch(runtime, /stdio\s*:\s*\[\s*['"]ignore['"]\s*,\s*['"]pipe['"]\s*,\s*['"]pipe['"]\s*\]/i, 'Runtime must pipe local status output in memory instead of inheriting it.')
forbidMatch(runtime, /stdio\s*:\s*['\"]inherit['\"]|console\.(?:log|error)\s*\([^)]*(?:status|secret|jwt|payload|stderr|stdout)/i, 'Runtime must not inherit or print raw status, credentials, JWTs, payloads, stdout, or stderr.')
requireMatch(runtime, /supabase_db_canwin-crm/, 'Runtime must pin the local Docker database container name.')
requireMatch(runtime, /127\.0\.0\.1|localhost/, 'Runtime must enforce local-only API hosts.')
requireMatch(runtime, /SYNC_WORKERS\s*=\s*16|CONCURRENT_WORKERS\s*=\s*16/, 'Runtime must use a 16-worker synchronized aggregate test.')
requireMatch(runtime, /assertions\s*<\s*28|MINIMUM_ASSERTIONS\s*=\s*28/, 'Runtime must enforce at least 28 assertions.')
requireMatch(
  runtime,
  /`test\.synthetic\.e\$\{crypto\.randomUUID\(\)\.replaceAll\(\s*['"]-['"]\s*,\s*['"]{2}\s*\)\.toLowerCase\(\)\}`/,
  'Runtime synthetic event type must give the random segment a fixed alphabetic prefix required by the database constraint.',
)
requireMatch(runtime, /schema_fingerprint[\s\S]{0,240}(?:sha256|digest)/i, 'Runtime synthetic definition must bind the canonical payload schema SHA-256 fingerprint.')
requireMatch(runtime, /raw_log_mode_0600|secretPatternCounts|sensitive/i, 'Runtime must include a safe secret/PII boundary assertion.')
const frozenSafeStages = Array.from({ length: 16 }, (_, index) => `RT16-${String(index).padStart(2, '0')}`)
const declaredStageBlock = /const SAFE_STAGE_CODES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(runtime)?.[1] ?? ''
const declaredSafeStages = [...declaredStageBlock.matchAll(/['\"](RT16-\d{2})['\"]/g)].map((match) => match[1])
if (declaredSafeStages.join('|') !== frozenSafeStages.join('|')) {
  failures.push('Runtime must freeze the exact RT16-00 through RT16-15 diagnostic stage allow-list in order.')
}
const assignedSafeStages = [...runtime.matchAll(/setSafeStage\(\s*['\"](RT16-\d{2})['\"]\s*\)/g)].map((match) => match[1])
if (assignedSafeStages.join('|') !== frozenSafeStages.slice(1).join('|')) {
  failures.push('Runtime must assign each RT16-01 through RT16-15 stage exactly once and in execution order.')
}
requireMatch(runtime, /const SAFE_STAGE_CODE_SET = new Set\(SAFE_STAGE_CODES\)/, 'Runtime must derive stage validation only from the frozen allow-list.')
requireMatch(runtime, /function setSafeStage\(nextStage\)\s*\{\s*if \(!SAFE_STAGE_CODE_SET\.has\(nextStage\)\) failSafely\(\)\s*safeStage = nextStage\s*\}/, 'Runtime stage setter must reject every non-allow-listed value before assignment.')
const stageAssignments = [...runtime.matchAll(/\bsafeStage\s*=/g)]
if (stageAssignments.length !== 2) failures.push('Runtime safeStage may be assigned only at initialization and inside the validated setter.')
const consoleCalls = [...runtime.matchAll(/console\.(?:log|error)\s*\([^\n]*\)/g)].map((match) => match[0])
const expectedConsoleCalls = [
  'console.log(summaryText)',
  'console.error(`Observability runtime verification failed [${safeStage}]; raw output withheld.`)',
]
if (consoleCalls.join('|') !== expectedConsoleCalls.join('|')) {
  failures.push('Runtime console output must remain limited to the sanitized success summary and allow-listed failure stage code.')
}
forbidMatch(runtime, /console\.(?:log|error)\s*\([^\n]*(?:error|message|cause|stack|stdout|stderr|apiUrl|publishableKey|secretKey|jwt|payload|runId|aggregateId)/i, 'Runtime must never print errors, raw process output, URLs, credentials, JWTs, payloads, or identifiers.')
for (const [pattern, message] of [
  [/auth\.admin\.createUser[\s\S]{0,1000}signInWithPassword/i, 'Runtime must obtain real local Auth JWT sessions.'],
  [/\['domain_event_definitions',\s*'audit_log',\s*'domain_events',\s*'event_outbox',\s*'operational_errors'\][\s\S]{0,360}select\s*\(/i, 'Runtime must prove direct-table denial across every public observability table.'],
  [/salesLogin[\s\S]{0,500}assert\(Boolean\(direct\.error\)[\s\S]{0,650}superAdminLogin[\s\S]{0,500}assert\(Boolean\(direct\.error\)/i, 'Runtime must require explicit Data API rejection for both sales and active super-administrator direct-table reads.'],
  [/status:\s*'disabled'[\s\S]{0,500}MEMBERSHIP_INACTIVE[\s\S]{0,500}(?:domain_events|audit_log)/i, 'Runtime must prove a disabled member old JWT loses metrics and ledger access.'],
  [/departments[\s\S]{0,160}status:\s*'inactive'[\s\S]{0,500}MEMBERSHIP_INACTIVE[\s\S]{0,500}(?:domain_events|audit_log)/i, 'Runtime must prove an inactive department old JWT loses metrics and ledger access.'],
  [/ready_workers[\s\S]{0,900}released[\s\S]{0,900}Promise\.allSettled/i, 'Runtime must synchronize and safely release concurrent workers.'],
  [/CONCURRENT_WORKERS[\s\S]{0,2400}sequence[s]?[\s\S]{0,300}(?:1\.\.16|index\s*\+\s*1)/i, 'Runtime must prove 16 same-aggregate events receive a continuous sequence.'],
  [/sameKeyCounts[\s\S]{0,1000}events[\s\S]{0,300}===\s*1[\s\S]{0,600}outbox[\s\S]{0,300}===\s*1/i, 'Runtime must prove concurrent same-key idempotency commits at most one event and outbox row.'],
  [/aggregateA[\s\S]{0,1800}aggregateB[\s\S]{0,1800}\[1,\s*2,\s*3,\s*4\]/i, 'Runtime must prove independent aggregates maintain independent sequences.'],
  [/fail_target_outbox[\s\S]{0,2200}faultCounts[\s\S]{0,800}events[\s\S]{0,200}===\s*0[\s\S]{0,500}sequence_rows[\s\S]{0,200}===\s*0/i, 'Runtime must inject an outbox fault and prove zero event/outbox/sequence side effects.'],
  [/sensitiveSideEffects[\s\S]{0,1200}events[\s\S]{0,160}===\s*0[\s\S]{0,500}outbox[\s\S]{0,160}===\s*0[\s\S]{0,500}sequence_rows[\s\S]{0,160}===\s*0[\s\S]{0,500}audit_delta[\s\S]{0,160}===\s*0/i, 'Runtime must prove a sensitive payload commits no event, outbox, sequence, or audit side effect.'],
]) requireMatch(runtime, pattern, message)
forbidMatch(runtime, /direct\.error\)\s*\|\||direct\.data\?\.length\s*===\s*0/i, 'Runtime direct-table denial must not accept an empty successful result as authorization evidence.')
forbidMatch(migration, /canwin_runtime_test|test\.synthetic\./i, 'Production migration must not contain runtime-only schemas, RPCs, or synthetic event definitions.')

for (const doc of [contractDoc, acceptanceTemplate, supervisorTemplate]) {
  requireMatch(doc, /Defined|Pending/, 'WBS 1.6 documents must distinguish unexecuted Defined/Pending evidence.')
  requireMatch(doc, /72/, 'WBS 1.6 documents must preserve the new pgTAP assertion floor of 72.')
  requireMatch(doc, /126/, 'WBS 1.6 documents must preserve the full pgTAP assertion floor of 126.')
  requireMatch(doc, /58/, 'WBS 1.6 documents must preserve the current frontend regression floor of 58.')
  forbidMatch(doc, /(?:Supervisor|Agent 0)[^\n]{0,100}:?\s*\*\*PASS\*\*/i, 'Templates must not pre-record Supervisor or Agent 0 PASS.')
}

if (failures.length > 0) {
  console.error('WBS 1.6 observability contract verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({
  status: 'PASS',
  migration: migrationPath,
  wbs16_pgtap_assertions: wbs16Assertions,
  full_pgtap_assertions: totalAssertions,
  runtime_minimum_assertions: 28,
  frontend_minimum_tests: 58,
}))
