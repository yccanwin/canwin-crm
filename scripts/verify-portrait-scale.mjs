#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'

const LOCAL_DB_CONTAINER = 'supabase_db_canwin-crm'
const STORE_COUNT = 10_000
const ENABLED_FIELD_COUNT = 50
const MIN_VALUES_PER_STORE = 10
const CONNECTION_COUNT = 20
const MIN_SAMPLES_PER_CLASS = 200
const MAX_P95_MS = 800
const QUERY_CLASSES = ['single', 'multi', 'boolean', 'number', 'combined_and', 'stable_page', 'derived_three_state']
const SAMPLES_PER_WORKER = Math.ceil(MIN_SAMPLES_PER_CLASS / CONNECTION_COUNT)
const MIGRATION_PATH = 'supabase/migrations/20260811170803_wbs_2_3_dynamic_portraits.sql'
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

let safeStage = 'PF23-00'
let functionalErrors = 0
let transportErrors = 0
let diskSpillCount = 0
let intendedIndexUsed = false
function fail() { throw new Error('PORTRAIT_SCALE_FAILED') }
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'` }
function scanEvidence(fragments, canaries) {
  const text = fragments.join('\n')
  return {
    secret_pattern_counts: secretPatterns.map((pattern) => (text.match(pattern) ?? []).length),
    pii_pattern_count: piiPatterns.reduce((sum, pattern) => sum + (text.match(pattern) ?? []).length, 0),
    document_storage_canary_hits: canaries.filter((canary) => text.includes(canary)).length,
    forbidden_portrait_key_hits: (text.match(/\b(?:full_name|phone|mobile|email|wechat|identity_number|id_card_number|license_number|ocr_text|document_id|document_path|storage_key|storage_path|signed_url|file_path)\b/gi) ?? []).length,
  }
}

function runPsql(sql, timeout = 240_000) {
  const result = spawnSync('docker', [
    'exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres',
  ], { input: sql, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, timeout, windowsHide: true })
  if (result.status !== 0 || typeof result.stdout !== 'string') fail()
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? ''
}
function runPsqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres',
    ], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] })
    const timer = setTimeout(() => child.kill(), 240_000)
    child.once('error', () => { clearTimeout(timer); reject(new Error('TRANSPORT')) })
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('TRANSPORT')) })
    child.stdin.end(sql)
  })
}
function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY
}
function inspectPlan(node, state) {
  if (!node || typeof node !== 'object') return
  if (String(node['Index Name'] ?? '') === state.targetIndex) state.index = true
  state.spill += Number(node['Temp Read Blocks'] ?? 0) + Number(node['Temp Written Blocks'] ?? 0)
  for (const child of node.Plans ?? []) inspectPlan(child, state)
}

async function main() {
  const schema = `wbs23_scale_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  const migrationText = fs.readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
  const migrationSha256 = createHash('sha256').update(migrationText).digest('hex')
  for (const fragment of [
    'create table public.portrait_field_definitions',
    'create table public.store_portrait_values',
    'create table public.store_portrait_value_options',
    'create table public.store_derived_portrait_values',
    'create index store_portrait_values_text_trgm_idx',
    'using gin (text_search_value extensions.gin_trgm_ops)',
  ]) if (!migrationText.toLowerCase().includes(fragment)) fail()
  const canaries = [
    `DOCUMENT_CANARY_${randomUUID().replaceAll('-', '')}`,
    `STORAGE_CANARY_${randomUUID().replaceAll('-', '')}`,
    `sb_secret_CI_CANARY_${randomUUID().replaceAll('-', '')}`,
    `pii-canary-${randomUUID()}@invalid.example`,
  ]
  const scannerControl = scanEvidence(canaries, canaries)
  if (scannerControl.document_storage_canary_hits !== canaries.length
    || !scannerControl.secret_pattern_counts.some((count) => count > 0)
    || scannerControl.pii_pattern_count < 1) fail()
  const evidenceFragments = []
  try {
    safeStage = 'PF23-01'
    const sourceBinding = JSON.parse(runPsql(`
      select json_build_object(
        'server_version',current_setting('server_version'),
        'source_columns',(select count(*) from information_schema.columns where table_schema='public' and table_name='store_portrait_values'),
        'source_constraints',(select count(*) from pg_constraint where conrelid='public.store_portrait_values'::regclass),
        'source_indexdef',(select indexdef from pg_indexes where schemaname='public' and tablename='store_portrait_values' and indexname='store_portrait_values_text_trgm_idx')
      )::text;
    `))
    if (typeof sourceBinding.source_indexdef !== 'string'
      || !sourceBinding.source_indexdef.includes('text_search_value')
      || !sourceBinding.source_indexdef.includes('gin_trgm_ops')) fail()
    evidenceFragments.push(JSON.stringify(sourceBinding))
    runPsql(`
      create schema ${schema};
      create table ${schema}.stores(id bigint primary key);
      create table ${schema}.portrait_field_definitions (like public.portrait_field_definitions including all);
      create table ${schema}.store_portrait_values (like public.store_portrait_values including all);
      create table ${schema}.store_portrait_value_options (like public.store_portrait_value_options including all);
      create table ${schema}.store_derived_portrait_values (like public.store_derived_portrait_values including all);
      create unlogged table ${schema}.samples(
        connection_id integer not null, query_class text not null, sample_number integer not null,
        duration_ms double precision not null, correct boolean not null, functional_error boolean not null default false
      );
      create table ${schema}.leak_control(canary text primary key);
      insert into ${schema}.leak_control values ${canaries.map((canary) => `(${sqlLiteral(canary)})`).join(',')};
      insert into ${schema}.stores select generate_series(1,${STORE_COUNT});
      insert into ${schema}.portrait_field_definitions
        (field_key,label,value_type,source_kind,context_scope,status,is_read_only,allow_keyword_search,sort_order,created_by_member_id,updated_by_member_id)
      select 'bench_field_'||lpad(id::text,2,'0'),'Synthetic field '||id,
        (array['text','single_select','multi_select','boolean','number'])[((id-1)%5)+1],
        'manual','store_global','active',false,id=1,id,1,1
      from generate_series(1,${ENABLED_FIELD_COUNT}) id;
      insert into ${schema}.store_portrait_values
        (store_id,field_definition_id,source_kind,value_type,revision,status,text_value,single_select_option_id,boolean_value,number_value,created_by_member_id,updated_by_member_id)
      select store_id,field_id,'manual',d.value_type,1,'active',
        case when d.value_type='text' then 'portrait-'||(store_id%400)::text end,
        case when d.value_type='single_select' then (store_id%20)::integer end,
        case when d.value_type='boolean' then store_id%2=0 end,
        case when d.value_type='number' then (store_id%1000)::numeric end,1,1
      from generate_series(1,${STORE_COUNT}) store_id
      cross join generate_series(1,${MIN_VALUES_PER_STORE}) field_id
      join ${schema}.portrait_field_definitions d on d.id=field_id;
      insert into ${schema}.store_portrait_value_options(value_id,option_id,created_by_member_id)
      select id,(store_id%25)::integer,1 from ${schema}.store_portrait_values where field_definition_id=3;
      insert into ${schema}.store_derived_portrait_values
        (store_id,field_definition_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
      select store_id,51,1,
        case store_id%4 when 0 then 'fresh' when 1 then 'fresh' when 2 then 'unknown' else 'stale' end,
        case store_id%4 when 0 then true when 1 then false else null end,
        case when store_id%4=2 then null else 'calc-1' end,
        case when store_id%4=2 then null else 'source-1' end,
        case when store_id%4=2 then null else now()-interval '1 minute' end,
        case when store_id%4=2 then null when store_id%4 in(0,1) then now()-interval '2 minutes' else now() end,
        case store_id%4 when 0 then 'COMPUTED' when 1 then 'COMPUTED' when 2 then 'NOT_COMPUTED' else 'SOURCE_CHANGED' end,
        'system:scale','system:scale'
      from generate_series(1,${STORE_COUNT}) store_id;
      analyze ${schema}.portrait_field_definitions;
      analyze ${schema}.store_portrait_values;
      analyze ${schema}.store_portrait_value_options;
      analyze ${schema}.store_derived_portrait_values;
    `)
    const controlCanaryCount = Number(runPsql(`select count(*) from ${schema}.leak_control;`))
    if (controlCanaryCount !== canaries.length) fail()
    const intendedIndexName = runPsql(`select indexname from pg_indexes where schemaname=${sqlLiteral(schema)} and tablename='store_portrait_values' and indexdef like '%USING gin%' and indexdef like '%text_search_value%';`)
    if (!intendedIndexName) fail()

    safeStage = 'PF23-02'
    const workers = []
    for (let connectionId = 1; connectionId <= CONNECTION_COUNT; connectionId += 1) {
      workers.push(runPsqlAsync(`
        do $worker$
        declare i integer; started_at timestamptz; actual_count bigint;
        begin
          perform count(*) from ${schema}.store_portrait_values where field_definition_id=2 and status='active' and single_select_option_id=7;
          perform count(*) from ${schema}.store_portrait_value_options where option_id=7;
          perform count(*) from ${schema}.store_portrait_values where field_definition_id=4 and status='active' and boolean_value=false;
          perform count(*) from ${schema}.store_portrait_values where field_definition_id=5 and status='active' and number_value between 100 and 199;
          perform count(*) from ${schema}.store_portrait_values n join ${schema}.store_portrait_values b using(store_id)
            where n.field_definition_id=5 and n.status='active' and n.number_value between 100 and 199
              and b.field_definition_id=4 and b.status='active' and b.boolean_value=false;
          perform store_id from ${schema}.store_portrait_values where field_definition_id=1 and status='active' and store_id>500 order by store_id limit 50;
          perform count(*) from ${schema}.store_derived_portrait_values
            where field_definition_id=51 and ((freshness='fresh' and boolean_value=false) or freshness in('unknown','stale'));
          for i in 1..${SAMPLES_PER_WORKER} loop
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_portrait_values where field_definition_id=2 and status='active' and single_select_option_id=7;
            insert into ${schema}.samples values(${connectionId},'single',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=500,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_portrait_value_options where option_id=7;
            insert into ${schema}.samples values(${connectionId},'multi',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=400,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_portrait_values where field_definition_id=4 and status='active' and boolean_value=false;
            insert into ${schema}.samples values(${connectionId},'boolean',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=5000,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_portrait_values where field_definition_id=5 and status='active' and number_value between 100 and 199;
            insert into ${schema}.samples values(${connectionId},'number',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=1000,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_portrait_values n join ${schema}.store_portrait_values b using(store_id)
              where n.field_definition_id=5 and n.status='active' and n.number_value between 100 and 199
                and b.field_definition_id=4 and b.status='active' and b.boolean_value=false;
            insert into ${schema}.samples values(${connectionId},'combined_and',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=500,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from (select store_id from ${schema}.store_portrait_values where field_definition_id=1 and status='active' and store_id>500 order by store_id limit 50) page;
            insert into ${schema}.samples values(${connectionId},'stable_page',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=50,false);
            started_at:=clock_timestamp();
            select count(*) into actual_count from ${schema}.store_derived_portrait_values
              where field_definition_id=51 and ((freshness='fresh' and boolean_value=false) or freshness in('unknown','stale'));
            insert into ${schema}.samples values(${connectionId},'derived_three_state',i,extract(epoch from clock_timestamp()-started_at)*1000,actual_count=7500,false);
          end loop;
        exception when others then
          insert into ${schema}.samples values(${connectionId},'worker',0,0,false,true);
        end $worker$;
      `))
    }
    const settled = await Promise.allSettled(workers)
    transportErrors = settled.filter((item) => item.status === 'rejected').length
    if (transportErrors !== 0) fail()

    safeStage = 'PF23-03'
    const groupsText = runPsql(`
      select coalesce(json_agg(json_build_object('query_class',query_class,'samples',samples,'functional_errors',functional_errors,'incorrect',incorrect,'durations',durations) order by query_class),'[]'::json)::text
      from (
        select query_class,count(*) filter(where not functional_error) samples,
          count(*) filter(where functional_error) functional_errors,count(*) filter(where not correct) incorrect,
          json_agg(duration_ms order by duration_ms) filter(where not functional_error) durations
        from ${schema}.samples group by query_class
      ) grouped;
    `)
    evidenceFragments.push(groupsText)
    const groups = JSON.parse(groupsText)
    functionalErrors = groups.reduce((sum, group) => sum + Number(group.functional_errors), 0)
    const incorrect = groups.reduce((sum, group) => sum + Number(group.incorrect), 0)
    if (functionalErrors !== 0 || incorrect !== 0) fail()
    const sampleCounts = {}
    const p95ByClass = {}
    for (const queryClass of QUERY_CLASSES) {
      const group = groups.find((item) => item.query_class === queryClass)
      sampleCounts[queryClass] = Number(group?.samples ?? 0)
      p95ByClass[queryClass] = p95(group?.durations ?? [])
      if (sampleCounts[queryClass] < MIN_SAMPLES_PER_CLASS || p95ByClass[queryClass] > MAX_P95_MS) fail()
    }

    safeStage = 'PF23-04'
    const planText = runPsql(`
      explain(analyze,buffers,format json)
      select v.store_id from ${schema}.store_portrait_values v
      join ${schema}.portrait_field_definitions d on d.id=v.field_definition_id
      where d.status='active' and d.source_kind='manual' and d.privacy_class='shared_non_sensitive'
        and d.allow_keyword_search and d.value_type='text'
        and v.field_definition_id=1 and v.status='active' and v.source_kind='manual' and v.value_type='text'
        and v.text_search_value like '%portrait-399%'
      order by v.store_id limit 50;
    `)
    evidenceFragments.push(planText)
    const plan = JSON.parse(planText)
    const state = { index: false, spill: 0, targetIndex: intendedIndexName }
    inspectPlan(plan?.[0]?.Plan, state)
    intendedIndexUsed = state.index
    diskSpillCount = state.spill
    if (!intendedIndexUsed || diskSpillCount !== 0) fail()

    const auditCanaryHits = Number(runPsql(`select count(*) from public.audit_log where ${canaries.map((canary) => `safe_data::text like ${sqlLiteral(`%${canary}%`)}`).join(' or ')};`))
    if (auditCanaryHits !== 0) fail()
    let leakScan = scanEvidence(evidenceFragments, canaries)
    if (leakScan.secret_pattern_counts.some((count) => count !== 0)
      || leakScan.pii_pattern_count !== 0
      || leakScan.document_storage_canary_hits !== 0
      || leakScan.forbidden_portrait_key_hits !== 0) fail()
    const summary = {
      status:'PASS', stores:STORE_COUNT, enabled_fields:ENABLED_FIELD_COUNT,
      minimum_values_per_store:MIN_VALUES_PER_STORE, concurrent_connections:CONNECTION_COUNT,
      warmup_queries_per_class_per_connection:1,
      samples_per_class:sampleCounts, p95_ms_by_class:p95ByClass, maximum_p95_ms:MAX_P95_MS,
      functional_errors:functionalErrors, transport_errors:transportErrors, correctness_percent:100,
      intended_index_used:intendedIndexUsed, disk_spill_count:diskSpillCount,
      fixture_binding:'LIKE_PUBLIC_TABLES_INCLUDING_ALL', migration_sha256:migrationSha256,
      source_index_sha256:createHash('sha256').update(sourceBinding.source_indexdef).digest('hex'),
      database_server_version:sourceBinding.server_version,
      leak_scanner_self_test:true,
      ...leakScan, audit_canary_hits:auditCanaryHits,
    }
    const output = JSON.stringify(summary)
    leakScan = scanEvidence([...evidenceFragments, output], canaries)
    if (leakScan.secret_pattern_counts.some((count) => count !== 0)
      || leakScan.pii_pattern_count !== 0
      || leakScan.document_storage_canary_hits !== 0
      || leakScan.forbidden_portrait_key_hits !== 0) fail()
    console.log(output)
  } finally {
    try { runPsql(`drop schema if exists ${schema} cascade;`, 60_000) } catch { /* safe failure stays counter-only */ }
  }
}

main().catch(() => {
  console.error(JSON.stringify({ status:'FAIL', stage:safeStage, functional_errors:functionalErrors,
    transport_errors:transportErrors, intended_index_used:intendedIndexUsed, disk_spill_count:diskSpillCount }))
  process.exit(1)
})
