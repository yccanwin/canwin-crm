#!/usr/bin/env node
/**
 * WBS 1.2 environment-boundary acceptance check.
 * Uses Node.js built-ins only; run from the repository root:
 *   node scripts/verify-env-boundary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const ignoredDirectories = new Set(['.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules']);
const frontendModes = ['development', 'test', 'production'];
const allowedFrontendVariables = new Set([
  'VITE_APP_ENV',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]);
const exampleEnvironmentFile = /^\.env(?:\.[^.]+)*\.example$/i;
const environmentFile = /^\.env(?:\..+)?$/i;
const liveKeyPatterns = [
  ['OpenAI-style API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub personal access token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ['Supabase secret key', /\b(?:sbp|sb_secret)_[A-Za-z0-9_-]{20,}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['JWT-like secret', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];

function relative(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function requireFile(file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    failures.push(`Missing required environment template: ${file}`);
  }
  return target;
}

function normalizeValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function isObviousPlaceholder(value) {
  const normalized = normalizeValue(value).toLowerCase();
  return /^(?:__set_[a-z0-9_]+__|<[^>]+>|\$\{[^}]+\}|your[-_a-z0-9]*|example[-_a-z0-9]*|placeholder[-_a-z0-9]*|replace[-_a-z0-9]*|change[-_a-z0-9]*|xxx+|todo)$/i.test(normalized);
}

function parseEnvironmentFile(file) {
  const values = new Map();
  if (!fs.existsSync(file)) return values;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [index, sourceLine] of lines.entries()) {
    const line = sourceLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const match = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      failures.push(`Invalid environment assignment in ${relative(file)}:${index + 1}`);
      continue;
    }
    if (values.has(match[1])) {
      failures.push(`Duplicate variable ${match[1]} in ${relative(file)}`);
      continue;
    }
    values.set(match[1], match[2]);
  }
  return values;
}

function verifyFrontendTemplate(mode) {
  const file = requireFile(`apps/web/.env.${mode}.example`);
  const values = parseEnvironmentFile(file);
  const foundVariables = [...values.keys()];

  for (const variable of foundVariables) {
    if (!allowedFrontendVariables.has(variable)) {
      failures.push(`Forbidden frontend variable ${variable} in ${relative(file)}`);
    }
    if (/^VITE_.*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN)/i.test(variable)) {
      failures.push(`Sensitive VITE_* variable is forbidden: ${variable} in ${relative(file)}`);
    }
  }
  for (const variable of allowedFrontendVariables) {
    if (!values.has(variable)) {
      failures.push(`Missing frontend variable ${variable} in ${relative(file)}`);
    }
  }
  if (foundVariables.length !== allowedFrontendVariables.size) {
    failures.push(`Frontend template must contain exactly three variables: ${relative(file)}`);
  }
  if (values.has('VITE_APP_ENV') && normalizeValue(values.get('VITE_APP_ENV')) !== mode) {
    failures.push(`VITE_APP_ENV must equal ${mode} in ${relative(file)}`);
  }
}

function verifyServerTemplate() {
  const file = requireFile('supabase/functions/.env.example');
  const values = parseEnvironmentFile(file);

  for (const [name, value] of values) {
    if (/(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN|API_?KEY)/i.test(name) && !isObviousPlaceholder(value)) {
      failures.push(`Sensitive server value must be an obvious placeholder: ${name} in ${relative(file)}`);
    }
  }
}

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        scanDirectory(path.join(directory, entry.name));
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const file = path.join(directory, entry.name);
    const relPath = relative(file);
    if (environmentFile.test(entry.name) && !exampleEnvironmentFile.test(entry.name)) {
      failures.push(`Committed non-example environment file is forbidden: ${relPath}`);
    }
    if (fs.statSync(file).size > 512 * 1024) continue;

    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const sensitiveViteVariable = /(?:^|\n)\s*(VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN)[A-Z0-9_]*)\s*=/i.exec(text);
    if (sensitiveViteVariable) {
      failures.push(`Sensitive VITE_* variable is forbidden: ${sensitiveViteVariable[1]} in ${relPath}`);
    }
    for (const [label, pattern] of liveKeyPatterns) {
      if (pattern.test(text)) {
        failures.push(`Potential ${label} found in ${relPath}`);
      }
    }
  }
}

for (const mode of frontendModes) {
  verifyFrontendTemplate(mode);
}
verifyServerTemplate();
scanDirectory(root);

if (failures.length > 0) {
  console.error('WBS 1.2 environment-boundary verification failed:');
  for (const failure of [...new Set(failures)]) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('WBS 1.2 environment-boundary verification passed.');
}
