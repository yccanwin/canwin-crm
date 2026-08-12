#!/usr/bin/env node
/** WBS 2.3 static contract gate. Built-ins only; run from repository root. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const failures = []
const MIGRATION_PATTERN = /^\d{14}_wbs_2_3_dynamic_portraits\.sql$/
const TEST_PLAN = new Map([
  ['0035_wbs_2_3_portrait_schema.sql', 70],
  ['0036_wbs_2_3_portrait_values.sql', 90],
  ['0037_wbs_2_3_portrait_rls.sql', 96],
])
const TABLES = [
  'public.portrait_field_definitions',
  'public.portrait_field_options',
  'public.store_portrait_values',
  'public.store_portrait_value_options',
  'public.store_derived_portrait_values',
  'app_private.store_derived_portrait_history',
]

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n')
}

function list(relativePath, pattern) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) return []
  return fs.readdirSync(absolutePath).filter((name) => pattern.test(name)).sort()
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message)
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message)
}

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}`
  const start = workflow.indexOf(marker)
  if (start < 0) {
    failures.push(`Missing Quality step: ${name}`)
    return ''
  }
  const next = workflow.indexOf('\n      - name: ', start + marker.length)
  return workflow.slice(start, next < 0 ? workflow.length : next)
}

function tableBody(migration, qualifiedName) {
  const escaped = qualifiedName.replace('.', '\\.')
  const match = migration.match(new RegExp(`create\\s+table\\s+${escaped}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'))
  if (!match) failures.push(`Migration must create ${qualifiedName}.`)
  return match?.[1] ?? ''
}

function planCount(sql, filename) {
  const matches = [...sql.matchAll(/select\s+plan\s*\(\s*(\d+)\s*\)\s*;/gi)]
  if (matches.length !== 1) {
    failures.push(`${filename} must contain exactly one literal select plan(...).`)
    return null
  }
  return Number(matches[0][1])
}

let packageJson = {}
try {
  packageJson = JSON.parse(read('package.json'))
} catch {
  failures.push('package.json must be valid JSON.')
}
const workflow = read('.github/workflows/quality.yml')
const runtime = read('scripts/verify-portrait-runtime.mjs')
const scale = read('scripts/verify-portrait-scale.mjs')
const geometry = read('scripts/verify-portrait-mobile-geometry.mjs')
const geometryEvidenceText = read('docs/wbs-2.3/mobile-geometry-evidence-2026-08-12.json')
let geometryEvidence = {}
try {
  geometryEvidence = JSON.parse(geometryEvidenceText)
} catch {
  failures.push('Portrait mobile geometry evidence must be valid JSON.')
}

const migrationFiles = list('supabase/migrations', /_wbs_2_3_.*\.sql$/)
if (migrationFiles.length !== 1 || !MIGRATION_PATTERN.test(migrationFiles[0] ?? '')) {
  failures.push('WBS 2.3 must use exactly one CLI migration named <14 digits>_wbs_2_3_dynamic_portraits.sql.')
}
const migration = migrationFiles.length === 1 ? read(`supabase/migrations/${migrationFiles[0]}`) : ''

const wbs23Tests = list('supabase/tests', /^003[5-7]_.*\.sql$/)
const expectedTests = [...TEST_PLAN.keys()]
if (JSON.stringify(wbs23Tests) !== JSON.stringify(expectedTests)) {
  failures.push(`WBS 2.3 pgTAP set must be exact: ${expectedTests.join(', ')}.`)
}
let totalPlan = 0
for (const [filename, expected] of TEST_PLAN) {
  const sql = read(`supabase/tests/${filename}`)
  const actual = planCount(sql, filename)
  if (actual !== null) {
    totalPlan += actual
    if (actual !== expected) failures.push(`${filename} plan must be exactly ${expected}; actual ${actual}.`)
  }
}
if (totalPlan !== 256) failures.push(`WBS 2.3 exact pgTAP plan total must be 256; actual ${totalPlan}.`)

for (const table of TABLES) {
  const body = tableBody(migration, table)
  requireMatch(migration, new RegExp(`alter\\s+table\\s+${table.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${table} must enable RLS.`)
  requireMatch(migration, new RegExp(`alter\\s+table\\s+${table.replace('.', '\\.')}\\s+force\\s+row\\s+level\\s+security`, 'i'), `${table} must FORCE RLS.`)
  requireMatch(body, /\bpublic_id\s+uuid\b/i, `${table} must expose a stable public_id.`)
  forbidMatch(body, /^\s*(?:full_name|phone|mobile|email|wechat|identity_(?:number|document|image)|id_card(?:_number|_image)?|license_(?:number|image)|ocr_(?:text|content)|document_(?:id|url|path|key|content)|storage_(?:bucket|path|key)|signed_url|file_(?:path|key)|note|follow_?up)\s+[a-z]/im, `${table} must not define contact, document, storage, note, or follow-up columns.`)
}

const definitions = tableBody(migration, 'public.portrait_field_definitions')
for (const column of ['field_key', 'value_type', 'source_kind', 'privacy_class', 'context_scope', 'allow_keyword_search', 'sort_order', 'status', 'version']) {
  requireMatch(definitions, new RegExp(`\\b${column}\\b`, 'i'), `portrait_field_definitions must define ${column}.`)
}
for (const valueType of ['text', 'single_select', 'multi_select', 'boolean', 'number']) {
  requireMatch(migration, new RegExp(`['"]${valueType}['"]`, 'i'), `Migration must lock portrait type ${valueType}.`)
}
for (const key of ['has_legal_person_id', 'has_business_license', 'documents_complete']) {
  requireMatch(migration, new RegExp(`['"]${key}['"]`, 'i'), `Migration must reserve derived field ${key}.`)
}
requireMatch(migration, /documents_complete[\s\S]{0,900}?store_department/i, 'documents_complete must use store_department context.')
requireMatch(migration, /has_legal_person_id[\s\S]{0,900}?store_global/i, 'has_legal_person_id must use store_global context.')
requireMatch(migration, /has_business_license[\s\S]{0,900}?store_global/i, 'has_business_license must use store_global context.')
forbidMatch(migration, /insert\s+into\s+public\.store_derived_portrait_values/i, 'WBS 2.3 must not seed current derived truth values.')
forbidMatch(migration, /insert\s+into\s+app_private\.store_derived_portrait_history/i, 'WBS 2.3 must not seed private derived history.')

requireMatch(migration, /create\s+extension\s+if\s+not\s+exists\s+pg_trgm(?![\s\S]{0,80}\bversion\b)/i, 'pg_trgm must be installed without an explicit version.')
requireMatch(migration, /using\s+gin\s*\([\s\S]{0,180}?gin_trgm_ops[\s\S]{0,180}?\)\s*where[\s\S]{0,260}?status\s*=\s*['"]active['"][\s\S]{0,260}?source_kind\s*=\s*['"]manual['"][\s\S]{0,260}?value_type\s*=\s*['"]text['"]/i, 'Active manual text values must have a value-table-only partial GIN trigram index.')
forbidMatch(migration, /where[\s\S]{0,500}?allow_keyword_search/i, 'A partial-index predicate must not reach across to definition allow_keyword_search.')
requireMatch(migration, /allow_keyword_search[\s\S]{0,500}?shared_non_sensitive/i, 'Keyword-search eligibility must be restricted to shared_non_sensitive definitions.')

for (const table of TABLES.slice(0, 5)) {
  const escaped = table.replace('.', '\\.')
  requireMatch(migration, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+${escaped}\\s+from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`, 'i'), `${table} must start from full ACL revocation including service_role.`)
  forbidMatch(migration, new RegExp(`grant\\s+select\\s+on\\s+table\\s+${escaped}\\s+to\\s+authenticated`, 'i'), `${table} must not expose raw authenticated SELECT after the exact wire RPC projection is frozen.`)
  forbidMatch(migration, new RegExp(`grant\\s+[^;]*(?:insert|update|delete|truncate|all)[^;]*${escaped}`, 'i'), `${table} must expose no direct write grant.`)
  forbidMatch(migration, new RegExp(`grant\\s+[^;]*${escaped}[^;]*service_role`, 'i'), `${table} must expose no service_role table privilege.`)
}
requireMatch(migration, /revoke\s+all\s+on\s+table\s+app_private\.store_derived_portrait_history\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i, 'Private derived history must have no client or service_role ACL.')
forbidMatch(migration, /alter\s+publication\s+supabase_realtime\s+add\s+table[\s\S]{0,300}?(?:portrait_field|store_portrait|store_derived_portrait)/i, 'Portrait tables must not be added to Realtime.')
for (const table of TABLES) {
  requireMatch(migration, new RegExp(`alter\\s+publication\\s+supabase_realtime\\s+drop\\s+table\\s+${table.replace('.', '\\.')}`, 'i'), `${table} must be explicitly absent from Realtime publication.`)
}
forbidMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.(?!read_portrait_catalog\b|read_store_derived_portraits\b)[a-z0-9_]*(?:write|set|update|compute|derive)[a-z0-9_]*portrait/i, 'WBS 2.3 must not expose a general portrait write/config/compute RPC.')

for (const [name, command] of [
  ['verify:portraits', 'node scripts/verify-portrait-contract.mjs'],
  ['verify:portraits:runtime', 'node scripts/verify-portrait-runtime.mjs'],
  ['verify:portraits:scale', 'node scripts/verify-portrait-scale.mjs'],
  ['verify:portraits:geometry', 'node scripts/verify-portrait-mobile-geometry.mjs'],
]) {
  if (packageJson.scripts?.[name] !== command) failures.push(`package.json must expose ${name}.`)
}
if (!/(?:^|&&\s*)npm\s+run\s+verify:portraits(?:\s*&&|\s*$)/.test(packageJson.scripts?.check ?? '')) failures.push('Aggregate check must run verify:portraits.')

for (const scenario of ['types', 'clear', 'unsupported', 'inactive-history', 'derived', 'department-switch', 'error']) {
  requireMatch(geometry, new RegExp(`['"]${scenario}['"]`), `Real-browser geometry verifier must include ${scenario}.`)
}
for (const marker of ['Emulation.setDeviceMetricsOverride', 'width: 360', 'height: 800', 'document_scroll_width', 'body_scroll_width', 'minimum_control_height']) {
  requireMatch(geometry, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Real-browser geometry verifier must lock ${marker}.`)
}
const geometryScenarios = geometryEvidence.results ?? []
if (geometryEvidence.summary?.all_passed !== true || geometryScenarios.length !== 7) failures.push('Portrait mobile geometry evidence must record seven passing real-browser scenarios.')
for (const scenario of geometryScenarios) {
  if (
    scenario.document_width !== 360
    || scenario.body_width !== 360
    || scenario.panel_left !== 20
    || scenario.panel_right !== 340
    || scenario.panel_width !== 320
    || scenario.horizontal_overflow !== 0
    || (scenario.minimum_control_height !== null && scenario.minimum_control_height < 44)
  ) failures.push(`Portrait mobile geometry drifted for ${scenario.scenario ?? 'unknown'}.`)
}
const geometryEvidenceSha256 = createHash('sha256').update(geometryEvidenceText).digest('hex')

const staticStep = workflowStep(workflow, 'Verify portrait model contract')
const portraitStep = workflowStep(workflow, 'Verify portrait runtime and performance')
requireMatch(staticStep, /^      - name: Verify portrait model contract\n        run: npm run verify:portraits\n?$/m, 'Portrait static CI step must run only verify:portraits.')
for (const pattern of [
  /set \+x/,
  /status_log="\$RUNNER_TEMP\/canwin-portrait-status\.log"/,
  /cleanup_portrait_status\(\)/,
  /rm -f -- "\$status_log"/,
  /trap cleanup_portrait_status EXIT/,
  /install -m 600 \/dev\/null "\$status_log"/,
  /status_json="\$\(npx supabase status -o json 2>"\$status_log"\)"/,
  /::add-mask::%s/,
  /npm run verify:portraits:runtime/,
  /npm run verify:portraits:scale/,
]) requireMatch(portraitStep, pattern, `Portrait runtime CI step is missing ${pattern}.`)
forbidMatch(portraitStep, /set -x|\b(?:cat|tail|head|less|tee)\b[^\n]*\$status_log|upload-artifact|GITHUB_(?:OUTPUT|ENV|STEP_SUMMARY)[^\n]*status_log/i, 'Portrait runtime CI must not replay, publish, or trace credential-bearing status data.')

const normalizedWorkflow = workflow.replace(/\\\n[\t ]*/g, ' ')
for (const [pattern, expected, label] of [
  [/\bsupabase[\t ]+start\b/g, 1, 'Supabase start'],
  [/\bsupabase[\t ]+status[\t ]+-o[\t ]+json\b/g, 3, 'protected Supabase status'],
  [/\bsupabase[\t ]+functions[\t ]+serve\b/g, 1, 'functions serve'],
]) {
  const actual = occurrences(normalizedWorkflow, pattern)
  if (actual !== expected) failures.push(`Quality must contain exactly ${expected} ${label} occurrence(s); actual ${actual}.`)
}
const authoredSteps = occurrences(workflow, /^      - name:/gm)
if (authoredSteps !== 23) failures.push(`Quality must contain 23 authored steps (27 GitHub job steps including generated setup/post/complete steps); actual ${authoredSteps}.`)
if (occurrences(portraitStep, /\bsupabase\s+status\s+-o\s+json\b/g) !== 1) failures.push('The third protected status must be bound only once inside the portrait runtime/performance step.')

for (const [source, checks] of [[runtime, [
  [/const\s+MINIMUM_ASSERTIONS\s*=\s*150\b/, 'Portrait runtime must lock the 150-assertion floor.'],
  [/const\s+EXPECTED_REAL_JWT_SESSIONS\s*=\s*7\b/, 'Portrait runtime must lock exactly seven real JWT sessions.'],
  [/delete\s+from\s+auth\.sessions/i, 'Portrait runtime must physically revoke auth.sessions before old-JWT reuse.'],
  [/SESSION_INVALID/, 'Portrait runtime must require the exact stale-session denial.'],
  [/stale_session_cases/, 'Portrait runtime must report stale-session cases separately.'],
  [/derived_stale_cases/, 'Portrait runtime must report legitimate derived freshness=stale separately.'],
  [/unauthorized_canary_hits/, 'Portrait runtime must report unauthorized canary hits.'],
  [/document_storage_canary_hits/, 'Portrait runtime must report document/storage canary hits.'],
  [/forbidden_portrait_key_hits/, 'Portrait runtime must report forbidden portrait key hits.'],
  [/audit_canary_hits/, 'Portrait runtime must report audit canary hits.'],
]], [scale, [
  [/const\s+STORE_COUNT\s*=\s*10_000\b/, 'Scale gate must lock 10,000 stores.'],
  [/const\s+ENABLED_FIELD_COUNT\s*=\s*50\b/, 'Scale gate must lock 50 enabled fields.'],
  [/const\s+MIN_VALUES_PER_STORE\s*=\s*10\b/, 'Scale gate must lock at least 10 values per store.'],
  [/const\s+CONNECTION_COUNT\s*=\s*20\b/, 'Scale gate must lock 20 independent concurrent connections.'],
  [/const\s+MIN_SAMPLES_PER_CLASS\s*=\s*200\b/, 'Scale gate must lock at least 200 samples per query class.'],
  [/const\s+MAX_P95_MS\s*=\s*800\b/, 'Scale gate must lock p95 <= 800 ms.'],
  [/create\s+table\s+\$\{schema\}\.store_portrait_values\s+\(like\s+public\.store_portrait_values\s+including\s+all\)/i, 'Scale fixture must import the actual migration table constraints and indexes with LIKE INCLUDING ALL.'],
  [/insert\s+into\s+\$\{schema\}\.store_portrait_values\s*\(\s*store_id,field_definition_id,source_kind,value_type,revision,status,text_value,single_select_option_id,boolean_value,number_value,created_by_member_id,updated_by_member_id\s*\)/i, 'Scale fixture must use an explicit column list and exclude the generated identity and search columns.'],
  [/perform\s+count\(\*\)[\s\S]{0,2400}?for\s+i\s+in\s+1\.\.\$\{SAMPLES_PER_WORKER\}\s+loop/i, 'Scale gate must run explicit untimed warmup queries before samples.'],
  [/scanEvidence\(canaries,\s*canaries\)/, 'Scale leak scanner must prove its canary-detection control before scanning evidence.'],
  [/migration_sha256/, 'Scale evidence must bind the actual migration hash.'],
  [/database_server_version/, 'Scale evidence must report the actual database environment version.'],
  [/field_definition_id=1\s+and\s+status='active'\s+and\s+store_id>500\s+order\s+by\s+store_id\s+limit\s+50/i, 'Stable-page scale proof must use the complete deterministic store_id keyset predicate and order.'],
  [/functional_errors/, 'Scale gate must report functional query errors.'],
  [/correctness_percent/, 'Scale gate must require 100% result and total correctness.'],
  [/intended_index_used/, 'Scale gate must prove the intended selective index is used.'],
  [/disk_spill_count/, 'Scale gate must prove zero disk spill.'],
  [/transport_errors/, 'Scale gate must separate transport failures from functional failures.'],
]]]) {
  for (const [pattern, message] of checks) requireMatch(source, pattern, message)
  forbidMatch(source, /console\.error\([^\n]*(?:\berror\s*:|\bdata\s*:|\btoken\s*:|\bsecret\s*:|\bjwt\s*:|\bemail\s*:|\bphone\s*:|\bdocument\s*:|\bstorage\s*:)/i, 'Failure output must not print raw error, data, token, secret, PII, document, or storage payloads.')
}
forbidMatch(scale, /\boffset\s+\d+/i, 'Stable-page scale proof must use keyset pagination and must not use OFFSET.')
forbidMatch(scale, /secret_pattern_counts\s*:\s*\[\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\]|pii_pattern_count\s*:\s*0|document_storage_canary_hits\s*:\s*0|audit_canary_hits\s*:\s*0/, 'Scale evidence must compute leak counters from executed scans rather than hard-code zero.')
const scaleIndexProbe = scale.slice(scale.indexOf('const planText'), scale.indexOf('evidenceFragments.push(planText)'))
const scaleEligibilityProbe = scale.slice(scale.indexOf('const eligibleKeywordResults'), scale.indexOf('const planText'))
requireMatch(scaleEligibilityProbe, /eligibleKeywordResults\s*!==\s*25/, 'Keyword eligibility probe must require the exact selective result count.')
for (const fragment of ["v.status='active'", "v.source_kind='manual'", "v.value_type='text'"]) {
  requireMatch(scaleEligibilityProbe, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Keyword eligibility count must retain ${fragment}.`)
}
for (const [probe, label, fieldPredicate] of [[scaleEligibilityProbe, 'eligibility count', 'v.field_definition_id=1'], [scaleIndexProbe, 'materialized plan', 'd.id=1']]) {
  requireMatch(probe, /join\s+\$\{schema\}\.portrait_field_definitions\s+d\s+on\s+d\.id=v\.field_definition_id/i, `Keyword ${label} must join the live definition catalog.`)
  for (const fragment of ["d.status='active'", "d.source_kind='manual'", "d.privacy_class='shared_non_sensitive'", 'd.allow_keyword_search', "d.value_type='text'", fieldPredicate, "text_search_value like '%portrait-399%'"]) {
    requireMatch(probe, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Keyword ${label} must retain ${fragment}.`)
  }
}
requireMatch(scaleIndexProbe, /explain\s*\(\s*analyze\s*,\s*buffers\s*,\s*format\s+json\s*\)[\s\S]*?with\s+keyword_hits\s+as\s+materialized\s*\([\s\S]*?status='active'[\s\S]*?source_kind='manual'[\s\S]*?value_type='text'[\s\S]*?text_search_value\s+like\s+'%portrait-399%'/i, 'Keyword index probe must materialize the partial-GIN candidate scan before the live definition eligibility join.')
forbidMatch(scaleIndexProbe, /\border\s+by\b|\blimit\s+\d+/i, 'Keyword index probe must not conflate the GIN proof with pagination ordering or limits.')
forbidMatch(scaleIndexProbe, /keyword_hits[\s\S]*?field_definition_id\s*=\s*1[\s\S]*?\)/i, 'The materialized keyword candidate scan must not be narrowed by a field id before the GIN probe.')
requireMatch(scale, /safePlanSummary\s*=\s*summarizePlan[\s\S]*?scanEvidence\(\[JSON\.stringify\(safePlanSummary\)\],\s*canaries\)[\s\S]*?WITHHELD_BY_SCANNER/, 'Scale failure diagnostics must summarize and rescan the plan before output.')
requireMatch(scale, /nodeCount\s*>\s*64[\s\S]*?scans\.length\s*<\s*16/, 'Scale plan diagnostics must cap total and scan-node output.')
requireMatch(scale, /\^\[a-z_\]\[a-z0-9_\]\{0,62\}\$[\s\S]*?\['gin','btree','gist','brin','hash','spgist'\][\s\S]*?checker_consistent\s*=\s*safePlanSummary\.target_seen\s*===\s*state\.index[\s\S]*?CHECKER_MISMATCH/, 'Scale plan diagnostics must sanitize index names/methods and detect checker disagreement.')
requireMatch(scale, /return\s*\{\s*classification,\s*checker_consistent:null,\s*target_seen:targetSeen,\s*node_count:Math\.min\(nodeCount,64\),\s*truncated,\s*scans\s*\}/, 'Scale plan diagnostics must keep an exact top-level safe key set.')
requireMatch(scale, /scans\.push\(\{\s*node_type:nodeType,\s*index_class:indexClass,\s*index_name:safeIndexName,\s*index_method:indexMethod,\s*plan_rows:safeNumber\(current\['Plan Rows'\]\),\s*actual_rows:safeNumber\(current\['Actual Rows'\]\),\s*actual_loops:safeNumber\(current\['Actual Loops'\]\),\s*rows_removed_by_filter:safeNumber\(current\['Rows Removed by Filter'\]\),?\s*\}\)/, 'Scale plan diagnostics must keep an exact nested scan-node safe key set.')
const scalePlanSummaryBuilder = scale.slice(scale.indexOf('function summarizePlan'), scale.indexOf('async function main'))
forbidMatch(scalePlanSummaryBuilder, /current\[['"](?:Filter|Index Cond|Recheck Cond|Output|Relation Name|Schema|Alias|Plans Removed|Rows Removed by Index Recheck)['"]\]/, 'Scale plan diagnostics must not copy raw plan conditions, output, relation, schema, alias, or recheck fields.')
forbidMatch(scale, /plan_summary\s*:\s*(?:planText|plan|evidenceFragments|migrationText|sourceBinding)/, 'Scale failure output must never expose a raw plan, SQL, migration, source binding, or evidence buffer.')

const portraitContract = read('apps/web/src/portrait/portrait-contract.ts')
const portraitState = read('apps/web/src/portrait/portrait-state.ts')
const portraitPanel = read('apps/web/src/portrait/PortraitEvidencePanel.tsx')
const portraitStyles = read('apps/web/src/portrait/portrait-evidence-panel.css')
const portraitEvidence = read('apps/web/src/evidence/portrait-mobile.tsx')
const portraitEvidenceHtml = read('apps/web/evidence/portrait-mobile.html')
const portraitWireGoldenText = read('apps/web/src/portrait/fixtures/portrait-wire-golden.json')
let portraitWireGolden = {}
try {
  portraitWireGolden = JSON.parse(portraitWireGoldenText)
} catch {
  failures.push('Portrait shared wire golden must be valid JSON.')
}
if (portraitWireGolden.fixture_version !== 1 || portraitWireGolden.synthetic_only !== true) failures.push('Portrait shared wire golden must be fixture v1 and synthetic-only.')
const goldenFields = portraitWireGolden.catalog_envelope?.fields ?? []
const wireFieldKeys = ['schema_version','public_id','field_key','label','description','value_type','source_kind','privacy_level','context_scope','status','sort_order','constraints','allow_keyword_search','allowed_filter_operators','capabilities','options'].sort()
for (const field of goldenFields) {
  if (Object.keys(field).sort().join('|') !== wireFieldKeys.join('|')) failures.push('Every golden catalog field must use the exact frozen wire keys.')
}
for (const [valueType, operators] of Object.entries({
  text:['equals','prefix'], single_select:['equals'], multi_select:['contains_any','contains_all'],
  number:['eq','gte','lte','between'],
})) {
  const field = goldenFields.find((item) => item.value_type === valueType)
  if (JSON.stringify(field?.allowed_filter_operators) !== JSON.stringify(operators)) failures.push(`Golden ${valueType} filter operators drifted.`)
}
if (!goldenFields.every((field) => field.privacy_level === 'shared_non_sensitive')) failures.push('Golden catalog must expose only shared_non_sensitive privacy_level.')
const goldenSha256 = createHash('sha256').update(portraitWireGoldenText).digest('hex')
requireMatch(migration, /create\s+or\s+replace\s+function\s+public\.read_portrait_catalog\s*\(\s*\)/i, 'Migration must expose the frozen read_portrait_catalog RPC.')
requireMatch(migration, /create\s+or\s+replace\s+function\s+public\.read_store_derived_portraits\s*\(/i, 'Migration must expose the frozen read_store_derived_portraits RPC.')
forbidMatch(migration, /\bget_portrait_catalog\b/i, 'Legacy get_portrait_catalog must not remain after the frozen RPC rename.')
for (const literal of ['privacy_level','constraints','capabilities','equals','prefix','contains_any','contains_all','is_true','is_false','is_unknown','eq','gte','lte','between']) {
  requireMatch(migration, new RegExp(`['"]${literal}['"]`), `Migration wire projection must include the golden literal ${literal}.`)
}
for (const marker of ['read_portrait_catalog', 'read_store_derived_portraits', 'portrait-wire-golden.json']) {
  requireMatch(runtime, new RegExp(marker), `Runtime must bind the shared wire contract marker ${marker}.`)
}
for (const marker of [
  'begin;', 'commit;', 'portrait_field_definitions_guard', 'portrait_field_definitions_touch',
  'delete from auth.sessions', 'cleanupVerification', 'reserved_restored',
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000003',
  'SOURCE_CHANGED', 'NOT_COMPUTED',
  "select('id,public_id,code')", 'departmentA.public_id', 'departmentB.public_id',
]) requireMatch(runtime, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Runtime cleanup/wire evidence must lock ${marker}.`)
const portraitTests = [
  read('apps/web/src/portrait/portrait-contract.test.ts'),
  read('apps/web/src/portrait/portrait-state.test.ts'),
  read('apps/web/src/portrait/PortraitEvidencePanel.test.tsx'),
].join('\n')
for (const marker of ['text', 'single_select', 'multi_select', 'boolean', 'number', 'unsupported', 'inactive-history']) {
  requireMatch(`${portraitContract}\n${portraitPanel}\n${portraitEvidence}`, new RegExp(marker.replace('-', '[-_]'), 'i'), `Portrait client must cover ${marker}.`)
}
for (const marker of ['is_true', 'is_false', 'is_unknown', 'fresh', 'unknown', 'stale']) {
  requireMatch(`${portraitContract}\n${portraitState}\n${portraitTests}`, new RegExp(`['"]${marker}['"]`, 'i'), `Portrait client must preserve derived semantic ${marker}.`)
}
for (const key of ['auth_user_public_id', 'member_public_id', 'primary_department_public_id', 'store_public_id', 'field_public_id', 'context_version']) {
  requireMatch(portraitState, new RegExp(`\\b${key}\\b`), `Portrait cache identity must include ${key}.`)
}
requireMatch(portraitState, /(?:clear|invalidate)[\s\S]{0,500}?(?:department|member|auth)/i, 'Portrait state must clear or invalidate cached context on member/department/auth changes.')
requireMatch(portraitStyles, /@media\s*\(max-width:\s*380px\)/, 'Portrait evidence panel must retain its 360px layout boundary.')
requireMatch(portraitEvidenceHtml, /name="viewport"\s+content="width=device-width, initial-scale=1\.0"/, 'Portrait evidence HTML must declare a mobile viewport.')
requireMatch(portraitEvidence, /360x800/, 'Portrait evidence fixture must identify the 360x800 review viewport.')
forbidMatch(read('apps/web/src/main.tsx'), /portrait-mobile|PortraitEvidencePanel/, 'Portrait evidence fixture must not be wired into production main.tsx.')
for (const source of [portraitContract, portraitState, portraitPanel]) {
  forbidMatch(source, /localStorage|sessionStorage|indexedDB|caches\.open|serviceWorker|captureException|analytics\.|console\.(?:log|debug|info|warn|error)/i, 'Portrait production code must not persist or emit portrait data.')
}

if (failures.length > 0) {
  console.error(`WBS 2.3 portrait contract verification failed (${new Set(failures).size}).`)
  for (const failure of new Set(failures)) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({
  status: 'PASS',
  migration_files: 1,
  pgTAP_files: TEST_PLAN.size,
  pgTAP_assertions: totalPlan,
  workflow_authored_steps: authoredSteps,
  github_reported_steps_expected: 27,
  protected_topology: { start: 1, status: 3, functions_serve: 1 },
  wire_golden_sha256: goldenSha256,
  mobile_geometry_evidence_sha256: geometryEvidenceSha256,
}))
