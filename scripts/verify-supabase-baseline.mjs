#!/usr/bin/env node
/** WBS 1.4 static Supabase lifecycle verification. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

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

const packageText = read('package.json');
const lockText = read('package-lock.json');
let packageJson = {};
try {
  packageJson = JSON.parse(packageText);
} catch {
  failures.push('package.json is not valid JSON.');
}

const cliVersion = packageJson.devDependencies?.supabase;
if (!/^\d+\.\d+\.\d+$/.test(cliVersion ?? '')) {
  failures.push('Supabase CLI must be an exact pinned devDependency version.');
}
if (cliVersion && !lockText.includes(`\"supabase\": \"${cliVersion}\"`)) {
  failures.push('package-lock.json must lock the declared Supabase CLI version.');
}
if (packageJson.scripts?.['verify:supabase'] !== 'node scripts/verify-supabase-baseline.mjs') {
  failures.push('package.json must define verify:supabase.');
}
if (!/(?:^|&&\s*)npm\s+run\s+verify:supabase(?:\s*&&|\s*$)/.test(packageJson.scripts?.check ?? '')) {
  failures.push('The aggregate check script must invoke verify:supabase.');
}

const config = read('supabase/config.toml');
requireMatch(config, /^project_id\s*=\s*\"canwin-crm\"\s*$/m, 'config.toml must use project_id canwin-crm.');
requireMatch(config, /^auto_expose_new_tables\s*=\s*false\s*$/m, 'New public objects must not be auto-exposed.');
requireMatch(config, /^major_version\s*=\s*17\s*$/m, 'Local Postgres major version must be 17.');
requireMatch(config, /\[db\.migrations\][\s\S]*?^enabled\s*=\s*true\s*$/m, 'Migrations must be enabled.');
requireMatch(config, /\[db\.seed\][\s\S]*?^enabled\s*=\s*true\s*$/m, 'Seeding must be enabled after migrations.');
requireMatch(config, /^sql_paths\s*=\s*\[\"\.\/seed\.sql\"\]\s*$/m, 'Seed path must be ./seed.sql.');

const seed = read('supabase/seed.sql');
const seedWithoutComments = seed.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
if (/\b(create|alter|drop|truncate|grant|revoke)\b/i.test(seedWithoutComments)) {
  failures.push('seed.sql must contain data only, never DDL or grants.');
}
if (/(sb_secret_|service_role|postgres(?:ql)?:\/\/|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/i.test(seed)) {
  failures.push('seed.sql contains forbidden credential-like material.');
}

const migrationsDir = path.join(root, 'supabase/migrations');
if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
  failures.push('Missing supabase/migrations directory.');
} else {
  const entries = fs.readdirSync(migrationsDir).sort();
  const allowedSupport = new Set(['.gitkeep', 'README.md']);
  const sqlFiles = entries.filter((entry) => entry.endsWith('.sql'));
  for (const entry of entries) {
    if (!allowedSupport.has(entry) && !/^\d{14}_[a-z0-9_]+\.sql$/.test(entry)) {
      failures.push(`Invalid migration directory entry: ${entry}`);
    }
  }
  const timestamps = sqlFiles.map((entry) => entry.slice(0, 14));
  if (new Set(timestamps).size !== timestamps.length) failures.push('Migration timestamps must be unique.');
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] <= timestamps[index - 1]) failures.push('Migration timestamps must be strictly increasing.');
  }
}

for (const relativePath of [
  'docs/supabase-environments-and-migrations.md',
  'docs/wbs-1.4/acceptance-evidence-template.md',
  'supabase/migrations/README.md',
  'supabase/tests/README.md',
]) read(relativePath);

const policy = read('docs/supabase-environments-and-migrations.md');
for (const required of ['canwin-crm-dev', 'canwin-crm-test', 'canwin-crm-prod', 'migration new', 'db reset --local', 'forward migration', 'APR-MIG-###']) {
  if (!policy.includes(required)) failures.push(`Supabase lifecycle policy must include: ${required}`);
}

const acceptanceTemplate = read('docs/wbs-1.4/acceptance-evidence-template.md');
for (const required of [
  'Dev migration list',
  'Test migration list',
  'Prod migration list',
  'Hosted PostgreSQL version consistency',
  'Application-schema drift result',
  'Security advisor result',
  'Performance advisor result',
]) {
  if (!acceptanceTemplate.includes(required)) {
    failures.push(`WBS 1.4 acceptance template must include: ${required}`);
  }
}

const workflow = read('.github/workflows/quality.yml');
requireMatch(workflow, /^\s*run:\s*npm\s+run\s+verify:supabase\s*$/m, 'Quality workflow must run verify:supabase.');

const ignore = `${read('.gitignore')}\n${read('supabase/.gitignore')}`;
for (const ignored of ['supabase/.temp/', 'supabase/.branches/']) {
  if (!ignore.includes(ignored) && !ignore.includes(ignored.replace('supabase/', ''))) {
    failures.push(`Git ignore rules must cover ${ignored}`);
  }
}

if (failures.length > 0) {
  console.error('WBS 1.4 Supabase baseline verification failed:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`WBS 1.4 Supabase baseline verification passed (CLI ${cliVersion}).`);
}
