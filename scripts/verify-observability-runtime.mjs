#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const LOCAL_DB_CONTAINER = 'supabase_db_canwin-crm'
const CONCURRENT_WORKERS = 16
const MINIMUM_ASSERTIONS = 28
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const metricsAllowList = new Set([
  'schema_version',
  'generated_at',
  'window_seconds',
  'domain_events_total',
  'domain_events_in_window',
  'audit_denials_in_window',
  'outbox_pending_total',
  'outbox_dead_letter_total',
  'audit_log_total',
  'operational_errors_total',
  'operational_errors_in_window',
  'oldest_outbox_age_seconds',
])
const sensitiveKeyPattern = /phone|email|id_number|document_url|token|password|jwt|secret|payload|actor_member_id|idempotency_key/i
const secretValuePatterns = [
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\b(?:service_role_key|secret_key|publishable_key|anon_key|s3_access_key|s3_secret_key)\b\s*[:=]\s*["']?(?!\*{3,}|<redacted>|redacted|null\b)[A-Za-z0-9_.-]{10,}/i,
  /["']?(?:SUPABASE_)?SECRET_KEY["']?\s*:\s*["'](?!\*{3,}|<redacted>|redacted)[^"'\r\n]{8,}["']/i,
]
const piiValuePatterns = [
  /\b(?![A-Za-z0-9._%+-]+@example\.(?:com|test)\b)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /(?<!\d)1[3-9]\d{9}(?!\d)/,
  /(?<!\d)\d{17}[0-9Xx](?!\d)/,
  /https?:\/\/[^\s"']+\/(?:invite|document|storage)\/[^\s"']+/i,
]

let assertions = 0

function assert(condition, label) {
  if (!condition) throw new Error(`Observability runtime assertion failed: ${label}`)
  assertions += 1
}

function failSafely() {
  throw new Error('Observability runtime operation failed.')
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    failSafely()
  }
}

function readLocalStatus() {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(executable, ['--no-install', 'supabase', 'status', '-o', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    windowsHide: true,
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') failSafely()
  const status = parseJson(result.stdout)
  const apiUrl = status.API_URL
  const publishableKey = status.PUBLISHABLE_KEY
  const secretKey = status.SECRET_KEY
  if (typeof apiUrl !== 'string' || typeof publishableKey !== 'string' || typeof secretKey !== 'string') {
    failSafely()
  }
  const parsed = new URL(apiUrl)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) failSafely()
  if (!publishableKey.startsWith('sb_publishable_') || !secretKey.startsWith('sb_secret_')) failSafely()
  return { apiUrl, publishableKey, secretKey }
}

function runCommand(command, args, input = '') {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, 60_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 1024 * 1024) stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk
    })
    child.on('error', () => {
      clearTimeout(timeout)
      resolve({ code: -1, stdout: '', stderr: '', timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ code: timedOut ? -1 : (code ?? -1), stdout, stderr, timedOut })
    })
    child.stdin.end(input)
  })
}

async function runPsql(sql, { allowFailure = false } = {}) {
  const result = await runCommand('docker', [
    'exec', '-i', LOCAL_DB_CONTAINER,
    'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], sql)
  if (!allowFailure && result.code !== 0) failSafely()
  return result
}

async function psqlText(sql) {
  const result = await runPsql(sql)
  return result.stdout.trim()
}

async function psqlJson(sql) {
  const text = await psqlText(sql)
  return parseJson(text.split(/\r?\n/).filter(Boolean).at(-1) ?? '')
}

async function psqlNumber(sql) {
  const value = Number(await psqlText(sql))
  if (!Number.isFinite(value)) failSafely()
  return value
}

function safeEnvelope(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const serialized = JSON.stringify(value)
  if (/SQLSTATE|SQLERRM|constraint|stack|app_private|public\./i.test(serialized)) return false
  return secretValuePatterns.every((pattern) => !pattern.test(serialized))
    && piiValuePatterns.every((pattern) => !pattern.test(serialized))
}

function assertTraceEnvelope(value, label) {
  assert(safeEnvelope(value), `${label} is a safe envelope`)
  assert(uuidPattern.test(value.request_id ?? value.error?.request_id ?? ''), `${label} has a database request UUID`)
  const correlation = value.correlation_id ?? value.error?.correlation_id
  if (correlation !== undefined && correlation !== null) {
    assert(uuidPattern.test(correlation), `${label} has a safe correlation UUID`)
  }
}

function assertErrorEnvelope(value, expectedCode, label) {
  assert(value?.ok === false, `${label} returns an error envelope`)
  assert(value?.error?.code === expectedCode, `${label} returns ${expectedCode}`)
  assertTraceEnvelope(value, label)
}

function assertSuccessEnvelope(value, label) {
  assert(value?.ok === true, `${label} returns a success envelope`)
  assertTraceEnvelope(value, label)
  return value.data
}

async function createAuthUser(admin, label, runId, password) {
  const email = `${label}.${runId}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) failSafely()
  return { id: data.user.id, email }
}

async function signIn(apiUrl, publishableKey, email, password) {
  const client = createClient(apiUrl, publishableKey, clientOptions)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) failSafely()
  return { client, session: data.session }
}

function emitSql({
  eventType,
  schemaVersion,
  aggregateType,
  aggregateId,
  producer,
  idempotencyKey,
  payload = {},
  causationEventId = null,
  actorMemberId = null,
  correlationId = null,
}) {
  return `select app_private.emit_domain_event(
    ${sqlLiteral(eventType)},
    ${Number(schemaVersion)},
    ${sqlLiteral(aggregateType)},
    ${sqlLiteral(aggregateId)},
    ${sqlLiteral(producer)},
    ${sqlLiteral(idempotencyKey)}::uuid,
    ${sqlLiteral(JSON.stringify(payload))}::jsonb,
    ${causationEventId ? `${sqlLiteral(causationEventId)}::uuid` : 'null'},
    ${actorMemberId === null ? 'null' : Number(actorMemberId)},
    ${correlationId ? `${sqlLiteral(correlationId)}::uuid` : 'null'}
  )::text;`
}

async function prepareBarrier(runKey, expected) {
  await runPsql(`
    create schema if not exists canwin_runtime_test;
    create table if not exists canwin_runtime_test.barriers (
      run_key text primary key,
      expected integer not null,
      released boolean not null default false
    );
    create table if not exists canwin_runtime_test.ready_workers (
      run_key text not null,
      worker integer not null,
      primary key (run_key, worker)
    );
    delete from canwin_runtime_test.ready_workers where run_key = ${sqlLiteral(runKey)};
    delete from canwin_runtime_test.barriers where run_key = ${sqlLiteral(runKey)};
    insert into canwin_runtime_test.barriers(run_key, expected) values (${sqlLiteral(runKey)}, ${expected});
  `)
}

function barrierWorkerSql(runKey, worker, sql) {
  return `
    insert into canwin_runtime_test.ready_workers(run_key, worker)
    values (${sqlLiteral(runKey)}, ${worker});
    do $canwin_barrier$
    begin
      loop
        exit when exists (
          select 1 from canwin_runtime_test.barriers
          where run_key = ${sqlLiteral(runKey)} and released
        );
        perform pg_sleep(0.02);
      end loop;
    end
    $canwin_barrier$;
    ${sql}
  `
}

async function runSynchronized(runKey, statements) {
  await prepareBarrier(runKey, statements.length)
  const workers = statements.map((statement, index) => runPsql(barrierWorkerSql(runKey, index + 1, statement)))
  let ready = 0
  for (let attempt = 0; attempt < 120; attempt += 1) {
    ready = await psqlNumber(`select count(*) from canwin_runtime_test.ready_workers where run_key = ${sqlLiteral(runKey)};`)
    if (ready === statements.length) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (ready !== statements.length) {
    await runPsql(`update canwin_runtime_test.barriers set released = true where run_key = ${sqlLiteral(runKey)};`, { allowFailure: true })
    await Promise.allSettled(workers)
    assert(false, `${runKey} reached the synchronized barrier`)
  }
  assert(true, `${runKey} reached the synchronized barrier`)
  await runPsql(`update canwin_runtime_test.barriers set released = true where run_key = ${sqlLiteral(runKey)};`)
  const results = await Promise.allSettled(workers)
  assert(results.every((result) => result.status === 'fulfilled'), `${runKey} workers completed without raw failures`)
}

async function main() {
  const { apiUrl, publishableKey, secretKey } = readLocalStatus()
  assert(['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname), 'Supabase API is local-only')
  const dockerState = await runCommand('docker', ['inspect', '--format={{.State.Running}}', LOCAL_DB_CONTAINER])
  assert(dockerState.code === 0 && dockerState.stdout.trim() === 'true', 'fixed local database container is running')

  const admin = createClient(apiUrl, secretKey, clientOptions)
  const publicClient = createClient(apiUrl, publishableKey, clientOptions)
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const password = `Cw-${crypto.randomUUID()}-9a`

  const department = await admin.from('departments').insert({
    code: `obs-${runId}`.slice(0, 62),
    name: 'Synthetic Observability Department',
  }).select('id').single()
  if (department.error || !department.data?.id) failSafely()
  const superAdminUser = await createAuthUser(admin, 'obs-sa', runId, password)
  const managerUser = await createAuthUser(admin, 'obs-manager', runId, password)
  const salesUser = await createAuthUser(admin, 'obs-sales', runId, password)
  const members = await admin.from('members').insert([
    { auth_user_id: superAdminUser.id, primary_department_id: department.data.id, role: 'super_admin', status: 'active', accepted_at: new Date().toISOString() },
    { auth_user_id: managerUser.id, primary_department_id: department.data.id, role: 'department_manager', status: 'active', accepted_at: new Date().toISOString() },
    { auth_user_id: salesUser.id, primary_department_id: department.data.id, role: 'sales', status: 'active', accepted_at: new Date().toISOString() },
  ]).select('id,auth_user_id')
  if (members.error || members.data?.length !== 3) failSafely()
  const superAdminMember = members.data.find((member) => member.auth_user_id === superAdminUser.id)
  if (!superAdminMember) failSafely()
  assert(members.data.length === 3, 'synthetic authorization roles exist')

  const [superAdminLogin, managerLogin, salesLogin] = await Promise.all([
    signIn(apiUrl, publishableKey, superAdminUser.email, password),
    signIn(apiUrl, publishableKey, managerUser.email, password),
    signIn(apiUrl, publishableKey, salesUser.email, password),
  ])

  const anonymousMetrics = await publicClient.rpc('get_observability_snapshot')
  assert(Boolean(anonymousMetrics.error), 'anonymous cannot execute observability metrics')
  const managerMetrics = await managerLogin.client.rpc('get_observability_snapshot')
  if (managerMetrics.error) failSafely()
  assertErrorEnvelope(managerMetrics.data, 'FORBIDDEN', 'department manager metrics')
  const salesMetrics = await salesLogin.client.rpc('get_observability_snapshot')
  if (salesMetrics.error) failSafely()
  assertErrorEnvelope(salesMetrics.data, 'FORBIDDEN', 'sales metrics')

  for (const table of ['domain_event_definitions', 'audit_log', 'domain_events', 'event_outbox', 'operational_errors']) {
    const direct = await salesLogin.client.from(table).select('*').limit(1)
    assert(Boolean(direct.error), `sales direct read of ${table} is rejected by the Data API`)
  }
  for (const table of ['domain_event_definitions', 'audit_log', 'domain_events', 'event_outbox', 'operational_errors']) {
    const direct = await superAdminLogin.client.from(table).select('*').limit(1)
    assert(Boolean(direct.error), `super administrator direct read of ${table} is rejected by the Data API`)
  }

  const requestedCorrelation = crypto.randomUUID()
  const initialMetrics = await superAdminLogin.client.rpc('get_observability_snapshot', {
    p_window_seconds: 300,
    p_correlation_id: requestedCorrelation,
  })
  if (initialMetrics.error) failSafely()
  const initialData = assertSuccessEnvelope(initialMetrics.data, 'active super administrator metrics')
  assert((initialMetrics.data.correlation_id ?? initialMetrics.data.data?.correlation_id) === requestedCorrelation, 'metrics preserve a safe supplied correlation UUID')
  assert(Object.keys(initialData).every((key) => metricsAllowList.has(key)), 'metrics expose only the frozen aggregate allow-list')
  assert(Object.keys(initialData).every((key) => !sensitiveKeyPattern.test(key)), 'metrics expose no sensitive or row-level field names')
  assert(secretValuePatterns.every((pattern) => !pattern.test(JSON.stringify(initialMetrics.data))), 'metrics contain no secret-shaped values')
  assert(piiValuePatterns.every((pattern) => !pattern.test(JSON.stringify(initialMetrics.data))), 'metrics contain no PII-shaped values')

  const invalidWindow = await superAdminLogin.client.rpc('get_observability_snapshot', {
    p_window_seconds: 0,
    p_correlation_id: crypto.randomUUID(),
  })
  if (invalidWindow.error) failSafely()
  assertErrorEnvelope(invalidWindow.data, 'WINDOW_INVALID', 'invalid observability window')

  const definitionType = `test.synthetic.${crypto.randomUUID().replaceAll('-', '').toLowerCase()}`
  const payloadSchema = { type: 'object', properties: { probe: { type: 'string', maxLength: 64 } }, additionalProperties: false }
  const fingerprintExpression = `encode(extensions.digest(convert_to(payload_schema::text, 'UTF8'), 'sha256'), 'hex')`
  await runPsql(`
    with definition(payload_schema) as (values (${sqlLiteral(JSON.stringify(payloadSchema))}::jsonb))
    insert into public.domain_event_definitions(event_type, schema_version, payload_schema, schema_fingerprint)
    select ${sqlLiteral(definitionType)}, 1, payload_schema, ${fingerprintExpression}
    from definition;
  `)
  const fingerprintBound = await psqlNumber(`
    select count(*) from public.domain_event_definitions
    where event_type = ${sqlLiteral(definitionType)} and schema_version = 1
      and schema_fingerprint = encode(extensions.digest(convert_to(payload_schema::text, 'UTF8'), 'sha256'), 'hex');
  `)
  assert(fingerprintBound === 1, 'synthetic definition binds canonical payload schema SHA-256')

  const traceReuse = await psqlJson(`
    begin;
    select jsonb_build_object(
      'first', app_private.new_trace_context(null),
      'second', app_private.new_trace_context(null)
    )::text;
    rollback;
  `)
  assert(uuidPattern.test(traceReuse.first?.request_id ?? ''), 'database creates a request UUID')
  assert(traceReuse.first?.request_id === traceReuse.second?.request_id, 'request UUID is reused inside one transaction')
  assert(traceReuse.first?.correlation_id === traceReuse.first?.request_id, 'missing correlation defaults to request UUID')
  assert(traceReuse.second?.correlation_id === traceReuse.first?.correlation_id, 'correlation UUID is reused inside one transaction')

  const aggregateType = 'quality_probe'
  const uniqueAggregate = `continuous-${runId}`
  const uniqueStatements = Array.from({ length: CONCURRENT_WORKERS }, () => emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: uniqueAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'continuous' },
  }))
  await runSynchronized(`continuous-${runId}`, uniqueStatements)
  const continuous = await psqlJson(`
    select jsonb_build_object(
      'events', count(*),
      'sequences', jsonb_agg(aggregate_sequence order by aggregate_sequence),
      'outbox', (select count(*) from public.event_outbox o where o.event_id in (
        select e.event_id from public.domain_events e
        where e.aggregate_type = ${sqlLiteral(aggregateType)} and e.aggregate_id = ${sqlLiteral(uniqueAggregate)}
      ))
    )::text
    from public.domain_events
    where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(uniqueAggregate)};
  `)
  assert(Number(continuous.events) === CONCURRENT_WORKERS, '16 synchronized unique events commit')
  assert(JSON.stringify(continuous.sequences) === JSON.stringify(Array.from({ length: CONCURRENT_WORKERS }, (_, index) => index + 1)), 'same-aggregate sequences are exactly 1..16')
  assert(Number(continuous.outbox) === CONCURRENT_WORKERS, 'each concurrent event has exactly one outbox row')

  const sameKeyAggregate = `same-key-${runId}`
  const sameKey = crypto.randomUUID()
  await runSynchronized(`same-key-${runId}`, Array.from({ length: 8 }, () => emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: sameKeyAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: sameKey,
    payload: { probe: 'same-key' },
  })))
  const sameKeyCounts = await psqlJson(`
    select jsonb_build_object(
      'events', count(*),
      'outbox', (select count(*) from public.event_outbox o where o.event_id in (
        select e.event_id from public.domain_events e
        where e.aggregate_type = ${sqlLiteral(aggregateType)} and e.aggregate_id = ${sqlLiteral(sameKeyAggregate)}
      )),
      'max_sequence', max(aggregate_sequence)
    )::text
    from public.domain_events
    where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(sameKeyAggregate)};
  `)
  assert(Number(sameKeyCounts.events) === 1, 'same idempotency key commits at most one event')
  assert(Number(sameKeyCounts.outbox) === 1, 'same idempotency key commits at most one outbox row')
  assert(Number(sameKeyCounts.max_sequence) === 1, 'idempotent replay does not consume aggregate sequence')

  const aggregateA = `independent-a-${runId}`
  const aggregateB = `independent-b-${runId}`
  const independent = [aggregateA, aggregateB].flatMap((aggregateId) => Array.from({ length: 4 }, () => emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'independent' },
  })))
  await runSynchronized(`independent-${runId}`, independent)
  for (const aggregateId of [aggregateA, aggregateB]) {
    const sequences = await psqlJson(`
      select coalesce(jsonb_agg(aggregate_sequence order by aggregate_sequence), '[]'::jsonb)::text
      from public.domain_events where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(aggregateId)};
    `)
    assert(JSON.stringify(sequences) === JSON.stringify([1, 2, 3, 4]), `independent aggregate ${aggregateId.endsWith(`a-${runId}`) ? 'A' : 'B'} has sequence 1..4`)
  }

  const rootAggregate = `causation-root-${runId}`
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: rootAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'root' },
  }))
  const rootEvent = await psqlJson(`
    select jsonb_build_object('event_id', event_id, 'correlation_id', correlation_id)::text
    from public.domain_events where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(rootAggregate)};
  `)
  assert(uuidPattern.test(rootEvent.event_id ?? ''), 'root event has an event UUID')
  assert(uuidPattern.test(rootEvent.correlation_id ?? ''), 'root event has a correlation UUID')
  const childAggregate = `causation-child-${runId}`
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: childAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'child' },
    causationEventId: rootEvent.event_id,
    correlationId: rootEvent.correlation_id,
  }))
  const childTrace = await psqlJson(`
    select jsonb_build_object('causation_event_id', causation_event_id, 'correlation_id', correlation_id)::text
    from public.domain_events where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(childAggregate)};
  `)
  assert(childTrace.causation_event_id === rootEvent.event_id, 'child preserves causation event ID')
  assert(childTrace.correlation_id === rootEvent.correlation_id, 'child causation shares root correlation')

  const invalidCausationAggregate = `causation-invalid-${runId}`
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: invalidCausationAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'invalid-causation' },
    causationEventId: rootEvent.event_id,
    correlationId: crypto.randomUUID(),
  }), { allowFailure: true })
  assert(await psqlNumber(`select count(*) from public.domain_events where aggregate_id = ${sqlLiteral(invalidCausationAggregate)};`) === 0, 'mismatched causation correlation commits no event')

  const sensitiveAggregate = `sensitive-${runId}`
  const sensitiveAuditBefore = await psqlNumber('select count(*) from public.audit_log;')
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: sensitiveAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { phone: 'synthetic-sensitive-canary' },
  }), { allowFailure: true })
  const sensitiveSideEffects = await psqlJson(`
    select jsonb_build_object(
      'events', (select count(*) from public.domain_events where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(sensitiveAggregate)}),
      'outbox', (select count(*) from public.event_outbox o join public.domain_events e on e.event_id = o.event_id where e.aggregate_type = ${sqlLiteral(aggregateType)} and e.aggregate_id = ${sqlLiteral(sensitiveAggregate)}),
      'sequence_rows', (select count(*) from app_private.aggregate_event_sequences where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(sensitiveAggregate)}),
      'audit_delta', (select count(*) from public.audit_log) - ${sensitiveAuditBefore}
    )::text;
  `)
  assert(Number(sensitiveSideEffects.events) === 0, 'sensitive payload key commits no event')
  assert(Number(sensitiveSideEffects.outbox) === 0, 'sensitive payload key commits no outbox')
  assert(Number(sensitiveSideEffects.sequence_rows) === 0, 'sensitive payload key consumes no sequence')
  assert(Number(sensitiveSideEffects.audit_delta) === 0, 'sensitive payload key writes no audit payload evidence')

  const faultAggregate = `atomic-fault-${runId}`
  await runPsql(`
    create or replace function canwin_runtime_test.fail_target_outbox()
    returns trigger language plpgsql security invoker set search_path = '' as $fault$
    begin
      if exists (
        select 1 from public.domain_events e
        where e.event_id = new.event_id and e.aggregate_id = ${sqlLiteral(faultAggregate)}
      ) then
        raise exception using errcode = 'P0001', message = 'controlled local fault';
      end if;
      return new;
    end
    $fault$;
    create trigger canwin_runtime_fail_target_outbox
    before insert on public.event_outbox
    for each row execute function canwin_runtime_test.fail_target_outbox();
  `)
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: faultAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: crypto.randomUUID(),
    payload: { probe: 'fault' },
  }), { allowFailure: true })
  const faultCounts = await psqlJson(`
    select jsonb_build_object(
      'events', (select count(*) from public.domain_events where aggregate_id = ${sqlLiteral(faultAggregate)}),
      'outbox', (select count(*) from public.event_outbox o join public.domain_events e on e.event_id = o.event_id where e.aggregate_id = ${sqlLiteral(faultAggregate)}),
      'sequence_rows', (select count(*) from app_private.aggregate_event_sequences where aggregate_type = ${sqlLiteral(aggregateType)} and aggregate_id = ${sqlLiteral(faultAggregate)})
    )::text;
  `)
  assert(Number(faultCounts.events) === 0 && Number(faultCounts.outbox) === 0, 'outbox fault rolls back event and outbox atomically')
  assert(Number(faultCounts.sequence_rows) === 0, 'outbox fault leaves no aggregate sequence side effect')
  await runPsql('drop trigger canwin_runtime_fail_target_outbox on public.event_outbox;')

  const auditBeforeReplay = await psqlNumber('select count(*) from public.audit_log;')
  await runPsql(emitSql({
    eventType: definitionType,
    schemaVersion: 1,
    aggregateType,
    aggregateId: sameKeyAggregate,
    producer: 'wbs1.6-runtime',
    idempotencyKey: sameKey,
    payload: { probe: 'same-key' },
  }))
  const auditAfterReplay = await psqlNumber('select count(*) from public.audit_log;')
  assert(auditAfterReplay > auditBeforeReplay, 'idempotent replay writes safe audit evidence')

  const auditBeforeMetrics = await psqlNumber('select count(*) from public.audit_log;')
  const finalMetrics = await superAdminLogin.client.rpc('get_observability_snapshot', {
    p_window_seconds: 300,
    p_correlation_id: crypto.randomUUID(),
  })
  if (finalMetrics.error) failSafely()
  assertSuccessEnvelope(finalMetrics.data, 'post-event super administrator metrics')
  const auditAfterMetrics = await psqlNumber('select count(*) from public.audit_log;')
  assert(auditAfterMetrics > auditBeforeMetrics, 'metrics access writes safe audit evidence')

  const disable = await admin.from('members').update({
    status: 'disabled',
    disabled_at: new Date().toISOString(),
    disabled_by_member_id: superAdminMember.id,
    disabled_reason: 'Synthetic observability stale JWT check',
  }).eq('id', superAdminMember.id)
  if (disable.error) failSafely()
  const staleMetrics = await superAdminLogin.client.rpc('get_observability_snapshot')
  if (staleMetrics.error) failSafely()
  assertErrorEnvelope(staleMetrics.data, 'MEMBERSHIP_INACTIVE', 'disabled super administrator old JWT metrics')
  const staleDirect = await superAdminLogin.client.from('domain_events').select('event_id').limit(1)
  assert(Boolean(staleDirect.error), 'disabled super administrator old JWT is rejected from the event ledger')

  const restoreMember = await admin.from('members').update({
    status: 'active',
    disabled_at: null,
    disabled_by_member_id: null,
    disabled_reason: null,
  }).eq('id', superAdminMember.id)
  if (restoreMember.error) failSafely()
  const disableDepartment = await admin.from('departments').update({ status: 'inactive' }).eq('id', department.data.id)
  if (disableDepartment.error) failSafely()
  const inactiveDepartmentMetrics = await superAdminLogin.client.rpc('get_observability_snapshot')
  if (inactiveDepartmentMetrics.error) failSafely()
  assertErrorEnvelope(inactiveDepartmentMetrics.data, 'MEMBERSHIP_INACTIVE', 'inactive-department super administrator old JWT metrics')
  const inactiveDepartmentDirect = await superAdminLogin.client.from('audit_log').select('*').limit(1)
  assert(Boolean(inactiveDepartmentDirect.error), 'inactive-department old JWT is rejected from the audit ledger')

  await runPsql('drop schema if exists canwin_runtime_test cascade;', { allowFailure: true })
  assert(assertions >= MINIMUM_ASSERTIONS, `runtime records at least ${MINIMUM_ASSERTIONS} assertions`)

  const summary = {
    status: 'PASS',
    assertions,
    concurrency_workers: CONCURRENT_WORKERS,
    pg_runtime_scope: ['real JWT metrics matrix', 'direct table denial', 'atomic event/outbox', 'idempotency', 'aggregate sequence', 'causation', 'safe errors'],
    secret_pattern_counts: [0, 0, 0, 0],
    pii_pattern_count: 0,
  }
  const summaryText = JSON.stringify(summary)
  if (secretValuePatterns.some((pattern) => pattern.test(summaryText)) || piiValuePatterns.some((pattern) => pattern.test(summaryText))) {
    failSafely()
  }
  console.log(summaryText)
}

main().catch(async () => {
  await runPsql('drop schema if exists canwin_runtime_test cascade;', { allowFailure: true }).catch(() => undefined)
  console.error('Observability runtime verification failed; raw output withheld.')
  process.exit(1)
})
