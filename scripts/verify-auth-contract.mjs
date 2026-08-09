#!/usr/bin/env node
/**
 * WBS 1.5 static Auth, membership, and invitation contract verification.
 *
 * This check intentionally proves repository structure only. It does not
 * replace pgTAP, a real-JWT integration run, browser tests, or human review.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function relative(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}

function forbidMatch(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

function parseJson(relativePath) {
  const text = read(relativePath);
  try {
    return JSON.parse(text);
  } catch {
    failures.push(`${relativePath} is not valid JSON.`);
    return {};
  }
}

function tomlSection(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[[^\\]]+\\]\\s*$|(?![\\s\\S]))`, 'm').exec(text);
  return match?.[1] ?? '';
}

function listFiles(directory, predicate = () => true) {
  const target = path.join(root, directory);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return [];
  return fs.readdirSync(target).filter(predicate).sort();
}

function readSourceTree(directory) {
  const target = path.join(root, directory);
  if (!fs.existsSync(target)) {
    failures.push(`Missing required directory: ${directory}`);
    return '';
  }
  const chunks = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) visit(child);
      if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        chunks.push(`\n/* ${relative(child)} */\n${fs.readFileSync(child, 'utf8')}`);
      }
    }
  };
  visit(target);
  return chunks.join('\n');
}

const packageJson = parseJson('package.json');
const webPackageJson = parseJson('apps/web/package.json');
const lockJson = parseJson('package-lock.json');

const supabaseJsVersion = webPackageJson.dependencies?.['@supabase/supabase-js'];
if (!/^\d+\.\d+\.\d+$/.test(supabaseJsVersion ?? '')) {
  failures.push('@supabase/supabase-js must be an exact pinned dependency version.');
}
const lockedWorkspaceVersion = lockJson.packages?.['apps/web']?.dependencies?.['@supabase/supabase-js'];
if (supabaseJsVersion && lockedWorkspaceVersion !== supabaseJsVersion) {
  failures.push('package-lock.json must lock the web workspace Supabase JS declaration exactly.');
}
const installedSupabaseVersion = lockJson.packages?.['node_modules/@supabase/supabase-js']?.version;
if (supabaseJsVersion && installedSupabaseVersion !== supabaseJsVersion) {
  failures.push('package-lock.json must contain the exact installed @supabase/supabase-js version.');
}
if (packageJson.scripts?.['verify:auth'] !== 'node scripts/verify-auth-contract.mjs') {
  failures.push('package.json must define verify:auth as node scripts/verify-auth-contract.mjs.');
}
if (packageJson.scripts?.['verify:auth:runtime'] !== 'node scripts/verify-auth-runtime.mjs') {
  failures.push('package.json must define verify:auth:runtime as node scripts/verify-auth-runtime.mjs.');
}
if (!/(?:^|&&\s*)npm\s+run\s+verify:auth(?:\s*&&|\s*$)/.test(packageJson.scripts?.check ?? '')) {
  failures.push('The aggregate check script must invoke verify:auth.');
}

const config = read('supabase/config.toml');
const authConfig = tomlSection(config, 'auth');
const emailAuthConfig = tomlSection(config, 'auth.email');
requireMatch(authConfig, /^enable_signup\s*=\s*false\s*$/m, 'Public Auth signup must be disabled.');
requireMatch(emailAuthConfig, /^enable_signup\s*=\s*true\s*$/m, 'Email provider must remain enabled for invited-member password login.');
requireMatch(authConfig, /^enable_anonymous_sign_ins\s*=\s*false\s*$/m, 'Anonymous sign-in must remain disabled.');
requireMatch(authConfig, /^minimum_password_length\s*=\s*(?:[89]|[1-9]\d+)\s*$/m, 'Minimum password length must be at least 8.');
requireMatch(authConfig, /^site_url\s*=\s*"http:\/\/127\.0\.0\.1:4173"\s*$/m, 'Local Auth site_url must be fixed to http://127.0.0.1:4173.');

const redirectsMatch = /^additional_redirect_urls\s*=\s*\[([^\]]*)\]\s*$/m.exec(authConfig);
if (!redirectsMatch) {
  failures.push('Auth must define an explicit additional_redirect_urls allow-list.');
} else {
  const redirects = [...redirectsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (redirects.length === 0) failures.push('Auth redirect allow-list must not be empty.');
  for (const redirect of redirects) {
    if (redirect.includes('*') || redirect !== 'http://127.0.0.1:4173/invite/accept') {
      failures.push(`Auth redirect must be an exact local callback without wildcards: ${redirect}`);
    }
  }
}

const migrations = listFiles('supabase/migrations', (entry) => /^\d{14}_wbs_1_5_auth_members\.sql$/.test(entry));
if (migrations.length !== 1) {
  failures.push(`Expected exactly one WBS 1.5 Auth migration, found ${migrations.length}.`);
}
const migrationPath = migrations.length === 1 ? `supabase/migrations/${migrations[0]}` : '';
const migration = migrationPath ? read(migrationPath) : '';
if (migration.trim() === '') failures.push('The WBS 1.5 Auth migration must not be empty.');

const publicTables = ['departments', 'members', 'member_profiles', 'member_invitations'];
for (const table of publicTables) {
  requireMatch(migration, new RegExp(`\\bcreate\\s+table\\s+public\\.${table}\\b`, 'i'), `Migration must create public.${table}.`);
  requireMatch(migration, new RegExp(`\\balter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\b`, 'i'), `public.${table} must enable RLS.`);
  requireMatch(migration, new RegExp(`\\balter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security\\b`, 'i'), `public.${table} must force RLS.`);
  requireMatch(migration, new RegExp(`\\brevoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+[^;]*\\banon\\b`, 'i'), `public.${table} must explicitly revoke anon table privileges.`);
  requireMatch(migration, new RegExp(`\\brevoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+[^;]*\\bauthenticated\\b`, 'i'), `public.${table} must explicitly revoke authenticated table privileges before minimal grants.`);
}

requireMatch(migration, /\bprimary_department_id\b[\s\S]{0,160}\bnot\s+null\b/i, 'Members must require one non-null primary_department_id.');
requireMatch(migration, /\bauth_user_id\b[\s\S]{0,160}\bunique\b/i, 'Members must have a unique auth_user_id.');
requireMatch(migration, /\bauth_user_id\b[\s\S]{0,240}\breferences\s+auth\.users\s*\(\s*id\s*\)[\s\S]{0,80}\bon\s+delete\s+restrict\b/i, 'Member Auth identity must use ON DELETE RESTRICT.');
requireMatch(migration, /\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?app_private\b/i, 'Migration must create the non-exposed app_private schema.');
requireMatch(migration, /\bauth\.uid\s*\(\s*\)/i, 'Privileged database code must re-check auth.uid().');
forbidMatch(migration, /\b(?:raw_)?user_metadata\b/i, 'Migration must never use user_metadata for authorization.');
forbidMatch(migration, /\bauth\.role\s*\(/i, 'Migration must not use deprecated auth.role().');
forbidMatch(migration, /\bgrant\s+all(?:\s+privileges)?[\s\S]{0,180}\bto\s+(?:anon|authenticated)\b/i, 'Data API roles must never receive GRANT ALL.');
forbidMatch(migration, /\bgrant\s+(?:insert|update|delete|truncate|references|trigger)(?:\s*,\s*(?:insert|update|delete|truncate|references|trigger))*\s+on[\s\S]{0,160}\bto\s+authenticated\b/i, 'Authenticated users must not receive direct write grants on Auth tables.');

const updatePolicies = [...migration.matchAll(/\bcreate\s+policy\b[\s\S]*?;/gi)]
  .map((match) => match[0])
  .filter((statement) => /\bfor\s+update\b/i.test(statement));
for (const policy of updatePolicies) {
  if (!/\busing\s*\(/i.test(policy) || !/\bwith\s+check\s*\(/i.test(policy)) {
    failures.push('Every UPDATE policy must include both USING and WITH CHECK.');
  }
}
forbidMatch(migration, /\bcreate\s+policy\b[\s\S]*?\bfor\s+delete\b[\s\S]*?;/i, 'WBS 1.5 Auth tables must not expose DELETE policies.');

const viewStatements = [...migration.matchAll(/\bcreate(?:\s+or\s+replace)?\s+view\b[\s\S]*?;/gi)].map((match) => match[0]);
for (const view of viewStatements) {
  if (!/\bsecurity_invoker\s*=\s*true\b/i.test(view)) failures.push('Every exposed view must use security_invoker=true.');
}

const functionStarts = [...migration.matchAll(/\bcreate(?:\s+or\s+replace)?\s+function\s+([^\s(]+)\s*\(/gi)];
function hasExecuteRevocation(functionName, role) {
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const schemaWide = new RegExp(
    `\\brevoke\\s+(?:all(?:\\s+privileges)?|execute)\\s+on\\s+all\\s+functions\\s+in\\s+schema\\s+app_private\\s+from\\s+[^;]*\\b${escapedRole}\\b`,
    'i',
  );
  if (schemaWide.test(migration)) return true;

  const shortName = functionName.split('.').at(-1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const functionSpecific = new RegExp(
    `\\brevoke\\s+(?:all(?:\\s+privileges)?|execute)\\s+on\\s+function\\s+app_private\\.${shortName}\\s*\\([^;]*\\)\\s+from\\s+[^;]*\\b${escapedRole}\\b`,
    'i',
  );
  return functionSpecific.test(migration);
}

for (const [index, match] of functionStarts.entries()) {
  const block = migration.slice(match.index, functionStarts[index + 1]?.index ?? migration.length);
  if (!/\bsecurity\s+definer\b/i.test(block)) continue;
  const functionName = match[1].replaceAll('"', '').toLowerCase();
  if (!functionName.startsWith('app_private.')) {
    failures.push(`SECURITY DEFINER function must be in app_private: ${functionName}`);
  }
  if (!/\bset\s+search_path\s*(?:=|to)\s*''/i.test(block)) {
    failures.push(`SECURITY DEFINER function must set an empty search_path: ${functionName}`);
  }
  if (!hasExecuteRevocation(functionName, 'public')) {
    failures.push(`SECURITY DEFINER function must revoke PUBLIC execute: ${functionName}`);
  }
  if (!hasExecuteRevocation(functionName, 'anon')) {
    failures.push(`SECURITY DEFINER function must revoke anon execute: ${functionName}`);
  }
}
if (functionStarts.length === 0 || !/\bsecurity\s+definer\b/i.test(migration)) {
  failures.push('Migration must define reviewed privileged helpers in app_private.');
}

const edge = read('supabase/functions/invite-member/index.ts');
const edgeSources = readSourceTree('supabase/functions');
requireMatch(edge, /function\s+environmentValue\s*\(\s*name[^)]*\)[\s\S]{0,240}Deno\.env\.get\(name\)/, 'Invite Edge Function must use a reviewed environment helper.');
requireMatch(edge, /environmentValue\(['"]SUPABASE_URL['"]\)/, 'Invite Edge Function must read SUPABASE_URL through the environment helper.');
requireMatch(edge, /keyFromDictionary\(['"]SUPABASE_SECRET_KEYS['"]\s*,\s*['"]SUPABASE_SECRET_KEY['"]\)/, 'Invite Edge Function must prefer the 2026 secret-key dictionary and name only the local CLI fallback.');
requireMatch(edge, /keyFromDictionary\(['"]SUPABASE_PUBLISHABLE_KEYS['"]\s*,\s*['"]SUPABASE_PUBLISHABLE_KEY['"]\)/, 'Invite Edge Function must prefer the 2026 publishable-key dictionary and name only the local CLI fallback.');
requireMatch(edge, /if\s*\(\s*!\s*\[[^\]]*['"]127\.0\.0\.1['"][^\]]*['"]localhost['"][^\]]*\]\.includes\(supabaseUrl\.hostname\)\s*\)\s*\{[\s\S]{0,180}?throw[\s\S]{0,180}?\}\s*return\s+environmentValue\(localFallbackName\)/, 'Legacy single-key fallback must be unreachable for non-local Supabase URLs.');
requireMatch(edge, /return\s+\[['"]http:\/\/127\.0\.0\.1:4173['"]\]/, 'Local Edge origin fallback must be exactly http://127.0.0.1:4173.');
requireMatch(edge, /parsed\.map\(\(value\)\s*=>\s*new\s+URL\(value\)\.origin\)/, 'Configured Edge origins must be normalized as exact URL origins.');
requireMatch(edge, /from\s+['"]npm:@supabase\/supabase-js@\d+\.\d+\.\d+['"]/, 'Edge Supabase JS dependency must use an exact version.');
requireMatch(edge, /\.auth\.getUser\s*\(/, 'Invite Edge Function must validate the caller with Auth getUser().');
requireMatch(edge, /inviteUserByEmail\s*\(/, 'Invite Edge Function must use the server-side Admin invitation flow.');
requireMatch(edge, /\.rpc\s*\(\s*['"]complete_member_invitation_delivery['"]/, 'Invite Edge Function must persist the Auth delivery result through the controlled completion RPC.');
requireMatch(edge, /completion\.ok\s*!==\s*true/, 'Invite Edge Function must explicitly require a successful completion envelope.');
requireMatch(edge, /completion\.data\?\.status\s*!==\s*['"]sent['"]/, 'Successful Auth delivery must require the database completion status sent.');
requireMatch(edge, /completion\.data\?\.status\s*!==\s*['"]delivery_failed['"]/, 'Failed Auth delivery must require the database completion status delivery_failed.');
requireMatch(edge, /INVITATION_DELIVERY_STATE_FAILED/, 'Completion-envelope failure must use a stable safe error code.');
forbidMatch(edgeSources, /\bVITE_[A-Z0-9_]+\b/, 'Server-only invitation code must not consume frontend VITE_* variables.');
forbidMatch(edgeSources, /\b(?:sb_secret_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/, 'Invite Edge Function contains credential-like literal material.');
forbidMatch(edgeSources, /\b(?:raw_)?user_metadata\b/i, 'Invite Edge Function must not authorize from user_metadata.');

const frontend = readSourceTree('apps/web/src');
for (const [pattern, message] of [
  [/\bcreateClient\s*\(/, 'Frontend must create a publishable-key Supabase client.'],
  [/\.signInWithPassword\s*\(/, 'Frontend must implement independent password login.'],
  [/\.signOut\s*\(/, 'Frontend must implement logout.'],
  [/(?:\.onAuthStateChange\s*\(|\.getSession\s*\()/, 'Frontend must restore and observe Auth sessions.'],
  [/(?:return_to|returnTo)/, 'Frontend must implement the return-path contract.'],
  [/accept_my_invitation/, 'Frontend must invoke the controlled invitation-acceptance RPC.'],
]) requireMatch(frontend, pattern, message);
forbidMatch(frontend, /\b(?:SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY|sb_secret_|service_role)\b/i, 'Frontend source must not contain server-only Supabase credentials.');
forbidMatch(frontend, /\b(?:raw_)?user_metadata\b/i, 'Frontend must not infer authorization from user_metadata.');

const testContracts = [
  ['supabase/tests/0001_wbs_1_4_baseline.sql', ['plan(', 'finish()', 'rollback;']],
  ['supabase/tests/0010_wbs_1_5_auth_schema.sql', ['plan(', 'public.members', 'primary_department_id', 'relrowsecurity', 'relforcerowsecurity', 'anon', 'finish()', 'rollback;']],
  ['supabase/tests/0011_wbs_1_5_invitation_acceptance.sql', ['plan(', 'accept_my_invitation', 'expired', 'email', 'replay', 'finish()', 'rollback;']],
  ['supabase/tests/0012_wbs_1_5_roles_and_stale_jwt.sql', ['plan(', 'sales', 'department_manager', 'super_admin', 'disabled', 'jwt', 'finish()', 'rollback;']],
];
for (const [file, requiredTerms] of testContracts) {
  const test = read(file);
  for (const term of requiredTerms) {
    if (!test.toLowerCase().includes(term.toLowerCase())) failures.push(`${file} must cover: ${term}`);
  }
}

const databaseTests = listFiles('supabase/tests', (entry) => /^\d+_[a-z0-9_]+\.sql$/.test(entry));
let plannedDatabaseAssertions = 0;
for (const testFile of databaseTests) {
  const test = read(`supabase/tests/${testFile}`);
  const plan = /\bselect\s+plan\s*\(\s*(\d+)\s*\)/i.exec(test);
  if (!plan) {
    failures.push(`Database test must declare a finite pgTAP plan: supabase/tests/${testFile}`);
  } else {
    plannedDatabaseAssertions += Number.parseInt(plan[1], 10);
  }
}
if (plannedDatabaseAssertions < 54) {
  failures.push(`The full pgTAP suite must retain at least 54 planned assertions; found ${plannedDatabaseAssertions}.`);
}

const runtime = read('scripts/verify-auth-runtime.mjs');
for (const [pattern, message] of [
  [/CANWIN_TEST_API_URL/, 'Runtime Auth verifier must require an explicit API URL.'],
  [/(?:127\.0\.0\.1|localhost)/, 'Runtime Auth verifier must reject non-local Supabase targets.'],
  [/CANWIN_TEST_PUBLISHABLE_KEY/, 'Runtime Auth verifier must use the local publishable key.'],
  [/CANWIN_TEST_SECRET_KEY/, 'Runtime Auth verifier must use the local secret key.'],
  [/CANWIN_TEST_FUNCTION_URL/, 'Runtime Auth verifier must require the local invite Edge Function URL.'],
  [/\.auth\.signUp\s*\(/, 'Runtime Auth verifier must prove public signup is disabled.'],
  [/\.auth\.signInWithPassword\s*\(/, 'Runtime Auth verifier must obtain real password sessions.'],
  [/fetch\s*\(\s*functionUrl\b/, 'Runtime Auth verifier must call the live local invite Edge Function.'],
  [/edgeInvitationResponse\.status\s*===\s*201/, 'Runtime Auth verifier must assert the live Edge HTTP 201 response.'],
  [/edgeInvitation\?\.ok\s*===\s*true/, 'Runtime Auth verifier must assert the Edge success envelope.'],
  [/edgeInvitation\?\.data\?\.status\s*===\s*['"]sent['"]/, 'Runtime Auth verifier must assert the persisted Edge sent status.'],
  [/\.from\s*\(\s*['"]member_invitations['"]\s*\)[\s\S]{0,240}\.select\s*\(\s*['"]invited_auth_user_id['"]\s*\)[\s\S]{0,240}\.eq\s*\(\s*['"]id['"]\s*,\s*invitationId\s*\)/, 'Runtime Auth verifier must read the persisted Auth-user invitation binding.'],
  [/!invitationBinding\.data\?\.invited_auth_user_id/, 'Runtime Auth verifier must reject a missing invitation binding.'],
  [/accept_my_invitation/, 'Runtime Auth verifier must exercise invitation acceptance.'],
  [/MEMBERSHIP_DISABLED/, 'Runtime Auth verifier must prove stale-JWT denial after member disable.'],
  [/DEPARTMENT_INACTIVE/, 'Runtime Auth verifier must prove stale-JWT denial after department disable.'],
  [/\.auth\.signOut\s*\(/, 'Runtime Auth verifier must prove local logout.'],
  [/status:\s*['"]PASS['"]/, 'Runtime Auth verifier must emit a machine-readable PASS result after its assertions.'],
  [/assertions/, 'Runtime Auth verifier must emit its executed assertion count.'],
]) requireMatch(runtime, pattern, message);

const workflow = read('.github/workflows/quality.yml');
requireMatch(workflow, /^\s{2}quality:\s*$/m, 'The required GitHub job must remain named quality.');
requireMatch(workflow, /^\s*run:\s*npm\s+run\s+verify:auth\s*$/m, 'Quality must run the static Auth contract verifier.');
requireMatch(workflow, /^\s*run:\s*npx\s+supabase\s+start\s*$/m, 'Quality must start the complete local Supabase stack without service exclusions.');
requireMatch(workflow, /^\s*run:\s*npx\s+supabase\s+test\s+db\s+--local\s*$/m, 'Quality must run the entire local pgTAP suite without selecting one file.');
requireMatch(workflow, /\bnpx\s+supabase\s+status\s+-o\s+json\b/, 'Quality must obtain local Supabase runtime endpoints without hard-coded keys.');
for (const variable of ['CANWIN_TEST_API_URL', 'CANWIN_TEST_PUBLISHABLE_KEY', 'CANWIN_TEST_SECRET_KEY', 'CANWIN_TEST_FUNCTION_URL']) {
  if (!workflow.includes(variable)) failures.push(`Quality must provide ${variable} from local Supabase status.`);
}
requireMatch(workflow, /CANWIN_APP_ORIGINS=\["http:\/\/127\.0\.0\.1:4173"\]/, 'Quality must provide the exact local CRM origin to the Edge Function.');
requireMatch(workflow, /printf\s+['"]::add-mask::%s\\n['"]\s+['"]\$CANWIN_TEST_SECRET_KEY['"]/, 'Quality must mask the local secret key before any downstream command can log it.');
requireMatch(workflow, /printf\s+['"]SUPABASE_PUBLISHABLE_KEYS=%s\\n['"]\s+"\$\(jq\s+-cn\s+--arg\s+value\s+"\$CANWIN_TEST_PUBLISHABLE_KEY"\s+'\{primary:\$value\}'\)"/, 'Quality must bind the publishable-key dictionary to the local publishable key.');
requireMatch(workflow, /printf\s+['"]SUPABASE_SECRET_KEYS=%s\\n['"]\s+"\$\(jq\s+-cn\s+--arg\s+value\s+"\$CANWIN_TEST_SECRET_KEY"\s+'\{primary:\$value\}'\)"/, 'Quality must bind the secret-key dictionary to the local secret key.');
requireMatch(workflow, /\binstall\s+-m\s+600\s+\/dev\/null\s+['"]\$function_env['"]/, 'Quality must create the temporary Edge environment file with mode 0600 before writing it.');
requireMatch(workflow, /cleanup\s*\(\)\s*\{[\s\S]{0,320}\bkill\s+['"]\$edge_pid['"][\s\S]{0,160}\bwait\s+['"]\$edge_pid['"][\s\S]{0,160}\brm\s+-f\s+--\s+['"]\$function_env['"]\s+['"]\$edge_log['"][\s\S]{0,80}\}/, 'Quality cleanup must stop and wait for Edge, then remove both temporary files.');
requireMatch(workflow, /\btrap\s+cleanup\s+EXIT\b/, 'Quality must register cleanup for every shell exit path.');
requireMatch(workflow, /\bnpx\s+supabase\s+functions\s+serve\s+--no-verify-jwt\s+--env-file\s+['"]?\$function_env['"]?/, 'Quality must serve the real local invite Edge Function with its runtime-only environment file.');

const runtimeEnvironmentOrder = [
  'function_env="$RUNNER_TEMP/canwin-functions.env"',
  'edge_log="$RUNNER_TEMP/canwin-edge.log"',
  'edge_pid=""',
  'cleanup() {',
  'trap cleanup EXIT',
  'install -m 600 /dev/null "$function_env"',
  'CANWIN_APP_ORIGINS=["http://127.0.0.1:4173"]',
  'SUPABASE_PUBLISHABLE_KEYS=%s',
  'SUPABASE_SECRET_KEYS=%s',
  'npx supabase functions serve --no-verify-jwt --env-file "$function_env"',
];
let previousRuntimeEnvironmentIndex = -1;
for (const fragment of runtimeEnvironmentOrder) {
  const index = workflow.indexOf(fragment);
  if (index < 0 || index <= previousRuntimeEnvironmentIndex) {
    failures.push(`Quality runtime environment setup is missing or out of secure order: ${fragment}`);
    break;
  }
  previousRuntimeEnvironmentIndex = index;
}
requireMatch(workflow, /\bnpm\s+run\s+verify:auth:runtime\b/, 'Quality must run the real Auth/JWT runtime verifier.');
forbidMatch(workflow, /continue-on-error:\s*true[\s\S]{0,240}(?:verify:auth|supabase\s+test\s+db|verify:auth:runtime)/i, 'Auth, pgTAP, and runtime checks must be blocking quality gates.');

for (const file of [
  'docs/wbs-1.5/acceptance-evidence-template.md',
  'docs/wbs-1.5/third-party-review-package-template.md',
  'docs/wbs-1.5/role-tests-and-scope-boundaries.md',
  'supabase/tests/README.md',
]) read(file);

const acceptance = read('docs/wbs-1.5/acceptance-evidence-template.md');
for (const required of ['Status: Pending', 'Exact implementation SHA', 'Real-JWT', 'pgTAP', '54', '44', 'return_to', 'Known limitations', 'Agent 0']) {
  if (!acceptance.includes(required)) failures.push(`WBS 1.5 acceptance template must include: ${required}`);
}
forbidMatch(acceptance, /^Status:\s*(?:PASS|Passed|Complete)\s*$/mi, 'An unexecuted acceptance template must not claim completion.');

const supervisor = read('docs/wbs-1.5/third-party-review-package-template.md');
for (const required of ['Exact reviewed implementation SHA', 'Branch-tip Quality run', 'Requirement traceability', 'full pgTAP', 'Real-JWT runtime', 'completion envelope', 'P0/P1', 'PASS', 'FAIL', 'CONDITIONAL', 'Agent 0 independent verification']) {
  if (!supervisor.includes(required)) failures.push(`Third-party review template must include: ${required}`);
}

if (failures.length > 0) {
  console.error('WBS 1.5 static Auth contract verification failed:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('WBS 1.5 static Auth contract verification passed.');
  console.log('Runtime pgTAP, real-JWT, browser, CI, and human-review evidence remain separately required.');
}
