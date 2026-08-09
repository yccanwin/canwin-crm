#!/usr/bin/env node
/**
 * WBS 1.1 scaffold acceptance check.
 *
 * Run from the repository root:
 *   node scripts/verify-scaffold.mjs
 *
 * This intentionally uses only Node.js built-ins so it remains usable before
 * package dependencies have been installed.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const checkedFiles = [];
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
// WBS 1.2 permits only committed .env examples, including mode-specific files
// such as .env.development.example. Other .env* files are local-only.
const allowedEnvExamples = /^\.env(?:\.[^.]+)*\.example$/i;

function relative(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function requireFile(file) {
  const target = path.join(root, file);
  checkedFiles.push(file);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    failures.push(`Missing required file: ${file}`);
  }
}

function requireDirectory(directory) {
  const target = path.join(root, directory);
  checkedFiles.push(`${directory}/`);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    failures.push(`Missing required directory: ${directory}/`);
  }
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return (
    normalized === '' ||
    /^(<[^>]+>|\$\{[^}]+\}|your[-_a-z0-9]*|example[-_a-z0-9]*|placeholder[-_a-z0-9]*|change[-_a-z0-9]*|replace[-_a-z0-9]*|xxx+|todo)$/i.test(normalized)
  );
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
    const fullPath = path.join(directory, entry.name);
    const relPath = relative(fullPath);

    if (/^\.env(?:\..+)?$/i.test(entry.name) && !allowedEnvExamples.test(entry.name)) {
      failures.push(`Real environment file must not be committed: ${relPath}`);
    }

    if (fs.statSync(fullPath).size > 512 * 1024) continue;
    let text;
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const assignment = /(?:^|\n)\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY)[A-Z0-9_]*)\s*=\s*([^\r\n#]+)/g;
    for (const match of text.matchAll(assignment)) {
      if (!isPlaceholder(match[2])) {
        failures.push(`Potential secret assignment (${match[1]}) in ${relPath}`);
      }
    }

    const literalSecretPatterns = [
      /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
      /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
      /\b(?:sbp|sb_secret)_[A-Za-z0-9_-]{20,}\b/,
    ];
    if (literalSecretPatterns.some((pattern) => pattern.test(text))) {
      failures.push(`Potential live API key token in ${relPath}`);
    }
  }
}

function verifyReadme() {
  const readmePath = path.join(root, 'README.md');
  if (!fs.existsSync(readmePath)) return;

  const readme = fs.readFileSync(readmePath, 'utf8');
  const hasInternalLicense = /(内部.{0,12}(许可|授权)|internal.{0,16}licen[cs]e|proprietary)/is.test(readme);
  const hasWindowsNpmStart = /npm\.cmd\s+(?:run\s+)?(?:dev|start)/i.test(readme) && /(Windows|PowerShell|执行策略)/i.test(readme);

  if (!hasInternalLicense) {
    failures.push('README must state the internal/proprietary license boundary.');
  }
  if (!hasWindowsNpmStart) {
    failures.push('README must document a Windows npm.cmd startup command.');
  }
}

function verifyGitignore() {
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  const ignoresEnvFiles = /^\s*\.env\*\s*$/m.test(gitignore);
  const permitsExamples = /^\s*!\.env(?:\.\*)?\.example\s*$/m.test(gitignore);
  const unsafeEnvExceptions = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^!\.env(?:\..*)?$/i.test(line) && !allowedEnvExamples.test(line.slice(1)));

  if (!ignoresEnvFiles) {
    failures.push('.gitignore must ignore real .env* files.');
  }
  if (!permitsExamples) {
    failures.push('.gitignore must permit a future *.example environment template.');
  }
  if (unsafeEnvExceptions.length > 0) {
    failures.push(`.gitignore must not re-include real environment files: ${unsafeEnvExceptions.join(', ')}`);
  }
}

for (const file of ['package.json', 'README.md', '.gitignore']) {
  requireFile(file);
}
requireDirectory('apps/web');
requireDirectory('supabase');
verifyReadme();
verifyGitignore();
scanDirectory(root);

if (failures.length > 0) {
  console.error('WBS 1.1 scaffold verification failed:');
  for (const failure of [...new Set(failures)]) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('WBS 1.1 scaffold verification passed.');
  console.log(`Checked: ${checkedFiles.join(', ')}`);
}
