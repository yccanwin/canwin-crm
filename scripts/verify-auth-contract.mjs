#!/usr/bin/env node
/**
 * WBS 1.5 static Auth, membership, and invitation contract verification.
 *
 * This check intentionally proves repository structure only. It does not
 * replace pgTAP, a real-JWT integration run, browser tests, or human review.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function workflowStep(text, name) {
  const marker = `      - name: ${name}\n`;
  const start = text.indexOf(marker);
  if (start < 0) {
    failures.push(`Missing required Quality step: ${name}`);
    return '';
  }
  const next = text.indexOf('\n      - name: ', start + marker.length);
  return text.slice(start, next < 0 ? text.length : next).trimEnd();
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

if (packageJson.scripts?.['verify:ci-credential-suppression'] !== 'node scripts/verify-ci-credential-suppression.mjs') {
  failures.push('package.json must expose the credential-suppression failure-path verifier.');
}

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

const mobileEvidenceHtml = read('apps/web/evidence/auth-mobile.html');
const mobileEvidenceSource = read('apps/web/src/evidence/auth-mobile.tsx');
const productionMain = read('apps/web/src/main.tsx');
requireMatch(mobileEvidenceHtml, /<script\s+type=["']module["']\s+src=["']\/src\/evidence\/auth-mobile\.tsx["']><\/script>/, 'Mobile Auth evidence HTML must load the reviewed evidence entrypoint.');
for (const [pattern, message] of [
  [/import\s+\{\s*AuthContext[^}]*\}\s+from\s+['"]\.\.\/auth\/auth-context['"]/, 'Mobile Auth evidence must reuse the production AuthContext.'],
  [/import\s+\{\s*LoginPage\s*\}\s+from\s+['"]\.\.\/pages\/LoginPage['"]/, 'Mobile Auth evidence must reuse the production LoginPage.'],
  [/import\s+\{\s*InviteAcceptPage\s*\}\s+from\s+['"]\.\.\/pages\/InviteAcceptPage['"]/, 'Mobile Auth evidence must reuse the production InviteAcceptPage.'],
  [/import\s+\{\s*HomePage\s*\}\s+from\s+['"]\.\.\/pages\/HomePage['"]/, 'Mobile Auth evidence must reuse the production HomePage.'],
  [/type\s+Scenario\s*=\s*['"]login['"]\s*\|\s*['"]invite['"]\s*\|\s*['"]home['"]/, 'Mobile Auth evidence must support exactly the login, invite, and home scenarios.'],
  [/<AuthContext\.Provider\s+value=\{value\}>/, 'Mobile Auth evidence must provide its synthetic state through the production AuthContext.'],
  [/<LoginPage\s*\/>/, 'Mobile Auth evidence must render the production LoginPage.'],
  [/<InviteAcceptPage\s*\/>/, 'Mobile Auth evidence must render the production InviteAcceptPage.'],
  [/<HomePage\s*\/>/, 'Mobile Auth evidence must render the production HomePage.'],
]) requireMatch(mobileEvidenceSource, pattern, message);

const evidenceUuidLiterals = [...mobileEvidenceSource.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi)]
  .map((match) => match[0]);
if (evidenceUuidLiterals.length === 0) {
  failures.push('Mobile Auth evidence must declare reviewed synthetic UUID fixtures.');
}
for (const uuid of evidenceUuidLiterals) {
  if (!/^00000000-0000-4000-8000-000000000\d{3}$/i.test(uuid)) {
    failures.push(`Mobile Auth evidence contains a UUID outside the reviewed synthetic namespace: ${uuid}`);
  }
}
forbidMatch(productionMain, /(?:evidence\/auth-mobile|AuthMobileEvidence)/, 'Production main.tsx must not import the mobile Auth evidence fixture.');

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
const normalizedWorkflow = workflow.replace(/\r\n/g, '\n');
const startStep = workflowStep(normalizedWorkflow, 'Start local Supabase');
const runtimeStep = workflowStep(normalizedWorkflow, 'Verify real Auth sessions');
for (const [name, step, expectedHash] of [
  ['Start local Supabase', startStep, '2cc6007269bf5526f99d2a78aca03752053a3237c94c40967dbf83a3f256bf9a'],
  ['Verify real Auth sessions', runtimeStep, 'f2579e55e6050339a1379066f1fce77f53c798699a227e23fb69adccee4325d6'],
]) {
  const actualHash = createHash('sha256').update(step, 'utf8').digest('hex');
  if (actualHash !== expectedHash) {
    failures.push(`${name} changed from its reviewed credential-safe form; perform a fresh security review before updating its fingerprint.`);
  }
}
requireMatch(workflow, /^\s{2}quality:\s*$/m, 'The required GitHub job must remain named quality.');
requireMatch(workflow, /^\s*run:\s*npm\s+run\s+verify:auth\s*$/m, 'Quality must run the static Auth contract verifier.');
requireMatch(workflow, /^\s*run:\s*npm\s+run\s+verify:ci-credential-suppression\s*$/m, 'Quality must prove the credential-safe failure path before starting Supabase.');
forbidMatch(workflow, /^\s*run:\s*npx\s+supabase\s+start\s*$/m, 'Quality must not stream local Supabase credentials to the public Actions log.');
requireMatch(workflow, /start_log="\$RUNNER_TEMP\/canwin-supabase-start\.log"/, 'Quality must keep raw Supabase startup output in RUNNER_TEMP.');
requireMatch(workflow, /cleanup_supabase_start\s*\(\)\s*\{[\s\S]{0,120}\brm\s+-f\s+--\s+"\$start_log"[\s\S]{0,40}\}/, 'Quality must delete the raw Supabase startup log on every exit path.');
requireMatch(workflow, /\btrap\s+cleanup_supabase_start\s+EXIT\b/, 'Quality must register Supabase startup-log cleanup before starting the stack.');
requireMatch(workflow, /\binstall\s+-m\s+600\s+\/dev\/null\s+"\$start_log"/, 'Quality must create the Supabase startup log with mode 0600 before writing it.');
requireMatch(startStep, /^\s{10}if npx supabase start >"\$start_log" 2>&1; then$/m, 'Quality must redirect all Supabase startup output away from the public Actions log.');
requireMatch(workflow, /start_status=\$\?[\s\S]{0,240}\bexit\s+"\$start_status"/, 'Quality must preserve and return the Supabase startup failure status.');
requireMatch(workflow, /^\s*run:\s*npx\s+supabase\s+test\s+db\s+--local\s*$/m, 'Quality must run the entire local pgTAP suite without selecting one file.');
requireMatch(runtimeStep, /^\s{10}if ! status_json="\$\(npx supabase status -o json 2>"\$status_log"\)"; then$/m, 'Quality must capture Supabase status while withholding credential-bearing stderr.');
for (const variable of ['CANWIN_TEST_API_URL', 'CANWIN_TEST_PUBLISHABLE_KEY', 'CANWIN_TEST_SECRET_KEY', 'CANWIN_TEST_FUNCTION_URL']) {
  if (!workflow.includes(variable)) failures.push(`Quality must provide ${variable} from local Supabase status.`);
}
requireMatch(workflow, /CANWIN_APP_ORIGINS=\["http:\/\/127\.0\.0\.1:4173"\]/, 'Quality must provide the exact local CRM origin to the Edge Function.');
requireMatch(workflow, /printf\s+['"]::add-mask::%s\\n['"]\s+['"]\$CANWIN_TEST_SECRET_KEY['"]/, 'Quality must mask the local secret key before any downstream command can log it.');
requireMatch(workflow, /printf\s+['"]SUPABASE_PUBLISHABLE_KEYS=%s\\n['"]\s+"\$\(jq\s+-cn\s+--arg\s+value\s+"\$CANWIN_TEST_PUBLISHABLE_KEY"\s+'\{primary:\$value\}'\)"/, 'Quality must bind the publishable-key dictionary to the local publishable key.');
requireMatch(workflow, /printf\s+['"]SUPABASE_SECRET_KEYS=%s\\n['"]\s+"\$\(jq\s+-cn\s+--arg\s+value\s+"\$CANWIN_TEST_SECRET_KEY"\s+'\{primary:\$value\}'\)"/, 'Quality must bind the secret-key dictionary to the local secret key.');
requireMatch(workflow, /\binstall\s+-m\s+600\s+\/dev\/null\s+['"]\$status_log['"]/, 'Quality must create the temporary Supabase status log with mode 0600 before writing it.');
requireMatch(workflow, /\binstall\s+-m\s+600\s+\/dev\/null\s+['"]\$function_env['"]/, 'Quality must create the temporary Edge environment file with mode 0600 before writing it.');
requireMatch(workflow, /\binstall\s+-m\s+600\s+\/dev\/null\s+['"]\$edge_log['"]/, 'Quality must create the temporary Edge log with mode 0600 before writing it.');
requireMatch(workflow, /cleanup\s*\(\)\s*\{[\s\S]{0,320}\bkill\s+['"]\$edge_pid['"][\s\S]{0,160}\bwait\s+['"]\$edge_pid['"][\s\S]{0,160}\brm\s+-f\s+--\s+['"]\$status_log['"]\s+['"]\$function_env['"]\s+['"]\$edge_log['"][\s\S]{0,80}\}/, 'Quality cleanup must stop and wait for Edge, then remove all credential-bearing temporary files.');
requireMatch(workflow, /\btrap\s+cleanup\s+EXIT\b/, 'Quality must register cleanup for every shell exit path.');
requireMatch(runtimeStep, /^\s{10}npx supabase functions serve --no-verify-jwt --env-file "\$function_env" >"\$edge_log" 2>&1 &$/m, 'Quality must serve Edge with all raw output redirected to its protected log.');
forbidMatch(normalizedWorkflow, /^\s*(?:set\s+-x|set\s+-o\s+xtrace|bash\s+-x)\b/m, 'Quality must never enable shell tracing around temporary credentials.');
forbidMatch(normalizedWorkflow, /uses:\s*actions\/upload-artifact(?:@|\s|$)/i, 'Quality must not upload raw runtime logs or temporary credential files as artifacts.');

const normalizedShellCommands = normalizedWorkflow.replace(/\\\n[\t ]*/g, ' ');
for (const [pattern, label] of [
  [/\bsupabase[\t ]+start\b/g, 'supabase start'],
  [/\bsupabase[\t ]+status[\t ]+-o[\t ]+json\b/g, 'supabase status -o json'],
  [/\bsupabase[\t ]+functions[\t ]+serve\b/g, 'supabase functions serve'],
]) {
  const actual = [...normalizedShellCommands.matchAll(pattern)].length;
  if (actual !== 1) failures.push(`Quality must contain exactly one protected occurrence of: ${label}`);
}

for (const filename of [
  'canwin-supabase-start.log',
  'canwin-supabase-status.log',
  'canwin-functions.env',
  'canwin-edge.log',
]) {
  if (countOccurrences(normalizedWorkflow, filename) !== 1) {
    failures.push(`Quality must reference the protected temporary file exactly once by literal name: ${filename}`);
  }
}

const allowedSensitiveReferenceLines = new Set([
  'start_log="$RUNNER_TEMP/canwin-supabase-start.log"',
  'rm -f -- "$start_log"',
  'install -m 600 /dev/null "$start_log"',
  'if npx supabase start >"$start_log" 2>&1; then',
  'status_log="$RUNNER_TEMP/canwin-supabase-status.log"',
  'function_env="$RUNNER_TEMP/canwin-functions.env"',
  'edge_log="$RUNNER_TEMP/canwin-edge.log"',
  'rm -f -- "$status_log" "$function_env" "$edge_log"',
  'install -m 600 /dev/null "$status_log"',
  'install -m 600 /dev/null "$function_env"',
  'install -m 600 /dev/null "$edge_log"',
  'if ! status_json="$(npx supabase status -o json 2>"$status_log")"; then',
  'export CANWIN_TEST_API_URL="$(jq -r \'.API_URL\' <<<"$status_json")"',
  'export CANWIN_TEST_PUBLISHABLE_KEY="$(jq -r \'.PUBLISHABLE_KEY\' <<<"$status_json")"',
  'if ! read -r CANWIN_TEST_SECRET_KEY < <(jq -er \'.SECRET_KEY\' <<<"$status_json" 2>>"$status_log"); then',
  'printf \'::add-mask::%s\\n\' "$CANWIN_TEST_SECRET_KEY"',
  'export CANWIN_TEST_FUNCTION_URL="${CANWIN_TEST_API_URL}/functions/v1/invite-member"',
  'printf \'SUPABASE_PUBLISHABLE_KEYS=%s\\n\' "$(jq -cn --arg value "$CANWIN_TEST_PUBLISHABLE_KEY" \'{primary:$value}\')"',
  'printf \'SUPABASE_SECRET_KEYS=%s\\n\' "$(jq -cn --arg value "$CANWIN_TEST_SECRET_KEY" \'{primary:$value}\')"',
  '} >"$function_env"',
  'npx supabase functions serve --no-verify-jwt --env-file "$function_env" >"$edge_log" 2>&1 &',
]);
const sensitiveShellVariables = [
  'start_log',
  'status_log',
  'function_env',
  'edge_log',
  'RUNNER_TEMP',
  'status_json',
  'CANWIN_TEST_API_URL',
  'CANWIN_TEST_PUBLISHABLE_KEY',
  'CANWIN_TEST_SECRET_KEY',
];
const sensitiveReference = new RegExp(
  `\\$(?:\\{(?:${sensitiveShellVariables.join('|')})\\}|(?:${sensitiveShellVariables.join('|')})\\b)`,
);
for (const line of normalizedWorkflow.split('\n')) {
  const trimmed = line.trim();
  if (sensitiveReference.test(trimmed) && !allowedSensitiveReferenceLines.has(trimmed)) {
    failures.push(`Quality contains a non-allowlisted sensitive value or temporary-file reference: ${trimmed}`);
  }
}

const supabaseStartupOrder = [
  'set +x',
  'start_log="$RUNNER_TEMP/canwin-supabase-start.log"',
  'cleanup_supabase_start() {',
  'trap cleanup_supabase_start EXIT',
  "trap 'exit 130' INT",
  "trap 'exit 143' TERM",
  'install -m 600 /dev/null "$start_log"',
  'npx supabase start >"$start_log" 2>&1',
];
let previousSupabaseStartupIndex = -1;
for (const fragment of supabaseStartupOrder) {
  const index = startStep.indexOf(fragment);
  if (index < 0 || index <= previousSupabaseStartupIndex) {
    failures.push(`Quality Supabase startup is missing or out of secure order: ${fragment}`);
    break;
  }
  previousSupabaseStartupIndex = index;
}

const runtimeEnvironmentOrder = [
  'set +x',
  'status_log="$RUNNER_TEMP/canwin-supabase-status.log"',
  'function_env="$RUNNER_TEMP/canwin-functions.env"',
  'edge_log="$RUNNER_TEMP/canwin-edge.log"',
  'edge_pid=""',
  'cleanup() {',
  'trap cleanup EXIT',
  "trap 'exit 130' INT",
  "trap 'exit 143' TERM",
  'install -m 600 /dev/null "$status_log"',
  'install -m 600 /dev/null "$function_env"',
  'install -m 600 /dev/null "$edge_log"',
  'npx supabase status -o json 2>"$status_log"',
  '::add-mask::%s\\n',
  'CANWIN_APP_ORIGINS=["http://127.0.0.1:4173"]',
  'SUPABASE_PUBLISHABLE_KEYS=%s',
  'SUPABASE_SECRET_KEYS=%s',
  'npx supabase functions serve --no-verify-jwt --env-file "$function_env"',
];
let previousRuntimeEnvironmentIndex = -1;
for (const fragment of runtimeEnvironmentOrder) {
  const index = runtimeStep.indexOf(fragment);
  if (index < 0 || index <= previousRuntimeEnvironmentIndex) {
    failures.push(`Quality runtime environment setup is missing or out of secure order: ${fragment}`);
    break;
  }
  previousRuntimeEnvironmentIndex = index;
}
requireMatch(workflow, /\bnpm\s+run\s+verify:auth:runtime\b/, 'Quality must run the real Auth/JWT runtime verifier.');
forbidMatch(workflow, /continue-on-error:\s*true[\s\S]{0,240}(?:verify:auth|supabase\s+test\s+db|verify:auth:runtime)/i, 'Auth, pgTAP, and runtime checks must be blocking quality gates.');

const credentialSuppressionProbe = read('scripts/verify-ci-credential-suppression.mjs');
for (const [pattern, message] of [
  [/spawnSync\s*\(\s*bash\s*,\s*\[\s*['"]-s['"]\s*\]/, 'Credential-suppression probe must pass its script to Bash through stdin.'],
  [/randomUUID\s*\(\s*\)/, 'Credential-suppression probe must generate a fresh synthetic secret sentinel at runtime.'],
  [/CANWIN_PROBE_SENTINEL/, 'Credential-suppression probe must pass its synthetic secret sentinel only through the child environment.'],
  [/exit 19/, 'Credential-suppression probe must exercise a non-zero child exit.'],
  [/install -m 600 \/dev\/null "\$start_log"/, 'Credential-suppression probe must create the raw log with requested mode 0600.'],
  [/raw_log_mode="\$\(stat -c '%a' "\$start_log"\)"/, 'Credential-suppression probe must read the raw log actual mode.'],
  [/if \[\[ "\$CANWIN_REQUIRE_POSIX_MODE" == '1' \]\]; then/, 'Credential-suppression probe must enforce actual POSIX mode on Linux CI.'],
  [/\[\[ "\$raw_log_mode" == '600' \]\] \|\| exit 20/, 'Credential-suppression probe must fail unless the raw log actual mode is exactly 0600.'],
  [/raw_log_mode_0600=true[\s\S]{0,120}mode_verification='posix-verified'/,
    'Credential-suppression probe must emit positive mode evidence only after strict POSIX verification.'],
  [/raw_log_mode_0600=null[\s\S]{0,120}mode_verification='not-applicable-windows'/,
    'Credential-suppression probe must not claim POSIX mode verification on Windows.'],
  [/>"\$start_log" 2>&1/, 'Credential-suppression probe must redirect both child output streams.'],
  [/expected_output='Local Supabase startup failed \(exit 19\); raw output withheld because it may contain temporary credentials\.'/,
    'Credential-suppression probe must define the reviewed fixed safe failure message.'],
  [/\[\[ "\$safe_output" == "\$expected_output" \]\]/, 'Credential-suppression probe must require exact fixed safe output.'],
  [/safe_output[^\n]*!=[^\n]*CANWIN_PROBE_SENTINEL/, 'Credential-suppression probe must reject sentinel exposure.'],
  [/! -e "\$probe_dir\/start\.log"/, 'Credential-suppression probe must prove raw-log cleanup.'],
  [/secret_exposed[^\n]*false/, 'Credential-suppression probe must emit machine-readable non-exposure evidence.'],
  [/raw_log_mode_0600[^\n]*true/, 'Credential-suppression probe must emit machine-readable 0600 mode evidence.'],
  [/raw_log_removed[^\n]*true/, 'Credential-suppression probe must emit machine-readable cleanup evidence.'],
  [/CANWIN_REQUIRE_POSIX_MODE:\s*process\.platform === 'win32' \? '0' : '1'/,
    'Credential-suppression probe must require POSIX mode verification on Linux and mark Windows as not applicable.'],
  [/evidence\.raw_log_mode_0600 === null[^\n]*mode_verification === 'not-applicable-windows'/,
    'Credential-suppression probe must validate explicit Windows non-applicability without claiming 0600.'],
  [/evidence\.raw_log_mode_0600 === true[^\n]*mode_verification === 'posix-verified'/,
    'Credential-suppression probe must validate strict positive 0600 evidence on Linux CI.'],
]) requireMatch(credentialSuppressionProbe, pattern, message);

for (const file of [
  'docs/wbs-1.5/acceptance-evidence-template.md',
  'docs/wbs-1.5/third-party-review-package-template.md',
  'docs/wbs-1.5/role-tests-and-scope-boundaries.md',
  'supabase/tests/README.md',
]) read(file);

const acceptance = read('docs/wbs-1.5/acceptance-evidence-template.md');
for (const required of ['Status: Pending', 'Exact implementation SHA', 'Real-JWT', 'pgTAP', '54', '44', '51', 'return_to', 'auth-mobile.html', 'Known limitations', 'Agent 0']) {
  if (!acceptance.includes(required)) failures.push(`WBS 1.5 acceptance template must include: ${required}`);
}
forbidMatch(acceptance, /^Status:\s*(?:PASS|Passed|Complete)\s*$/mi, 'An unexecuted acceptance template must not claim completion.');

const roleScope = read('docs/wbs-1.5/role-tests-and-scope-boundaries.md');
for (const required of ['51', 'apps/web/evidence/auth-mobile.html', 'login', 'invite', 'home', 'synthetic UUID', 'main.tsx']) {
  if (!roleScope.includes(required)) failures.push(`WBS 1.5 role/scope contract must include: ${required}`);
}

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
