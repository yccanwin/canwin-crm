#!/usr/bin/env node
/**
 * WBS 1.3 static quality-gate configuration check. Run from repository root.
 * This parser deliberately uses Node.js built-ins only.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const workflowPath = '.github/workflows/quality.yml';
const requiredScripts = ['verify:env', 'lint', 'typecheck', 'test', 'build'];
const requiredGateCommands = [
  ['secret', 'verify:env'],
  ['lint', 'lint'],
  ['type', 'typecheck'],
  ['test', 'test'],
  ['build', 'build'],
];

function requireText(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function parsePackageScripts() {
  const packageText = requireText('package.json');
  if (packageText === '') return;

  let packageJson;
  try {
    packageJson = JSON.parse(packageText);
  } catch {
    failures.push('package.json is not valid JSON.');
    return;
  }
  const scripts = packageJson.scripts;
  if (!scripts || typeof scripts !== 'object') {
    failures.push('package.json must define scripts.');
    return;
  }
  for (const script of requiredScripts) {
    if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
      failures.push(`Missing required package script: ${script}`);
    }
  }
  if (typeof scripts.check !== 'string') {
    failures.push('Missing aggregate package script: check');
  } else {
    for (const script of requiredScripts) {
      if (!new RegExp(`(?:npm(?:\\.cmd)?\\s+run\\s+)${script.replace(':', '\\:')}(?:\\s|$)`, 'i').test(scripts.check)) {
        failures.push(`package script check must invoke ${script}`);
      }
    }
  }
}

function verifyWorkflow() {
  const workflow = requireText(workflowPath);
  if (workflow === '') return;

  if (!/^\s{2}quality\s*:\s*(?:#.*)?$/m.test(workflow)) {
    failures.push('Quality workflow must define jobs.quality.');
  }
  if (!/^\s*contents\s*:\s*read\s*$/mi.test(workflow)) {
    failures.push('Quality workflow must explicitly set contents: read permissions.');
  }
  if (/^\s*[A-Za-z-]+\s*:\s*(?:write|admin)\s*$/mi.test(workflow)) {
    failures.push('Quality workflow permissions must be read-only.');
  }
  if (/^\s*paths(?:-ignore)?\s*:/mi.test(workflow)) {
    failures.push('Quality workflow must not use paths or paths-ignore filters.');
  }

  const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/gm)];
  if (actionReferences.length === 0) {
    failures.push('Quality workflow must use pinned GitHub Actions.');
  }
  for (const match of actionReferences) {
    const [action, ref] = match[1].split('@');
    if (!action || !ref || !/^[0-9a-f]{40}$/i.test(ref)) {
      failures.push(`Action must be pinned to a full commit SHA: ${match[1]}`);
    }
  }

  if (!/^\s*run:\s*npm(?:\.cmd)?\s+ci(?:\s|$)/mi.test(workflow)) {
    failures.push('Quality workflow must run npm ci.');
  }
  if (!/^\s*run:\s*npm(?:\.cmd)?\s+audit(?:\s|$)/mi.test(workflow)) {
    failures.push('Quality workflow must run npm audit.');
  }
  for (const [gate, script] of requiredGateCommands) {
    const escaped = script.replace(':', '\\:');
    if (!new RegExp(`^\\s*run:\\s*npm(?:\\.cmd)?\\s+run\\s+${escaped}(?:\\s|$)`, 'mi').test(workflow)) {
      failures.push(`Quality workflow must run the ${gate} gate (npm run ${script}).`);
    }
  }
}

function verifyRepositoryPolicyFiles() {
  const prTemplate = requireText('.github/pull_request_template.md');
  if (prTemplate !== '') {
    if (!/(测试|test)/i.test(prTemplate) || !/(安全|security|secret)/i.test(prTemplate)) {
      failures.push('Pull-request template must include testing and security declarations.');
    }
  }

  const codeowners = requireText('.github/CODEOWNERS');
  if (codeowners !== '') {
    const ownerRule = codeowners
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^\*\s+@[^\s]+/.test(line));
    if (!ownerRule) {
      failures.push('CODEOWNERS must define a default owner rule.');
    }
  }

  const branchPolicy = requireText('docs/branch-ci-quality-gates.md');
  if (branchPolicy !== '') {
    const hasMainAndDevelop = /\bmain\b/i.test(branchPolicy) && /\bdevelop\b/i.test(branchPolicy);
    const hasReviewRule = /(pull request|PR|评审|审核)/i.test(branchPolicy);
    const hasQualityRule = /(quality|质量门|质量检查)/i.test(branchPolicy);
    if (!hasMainAndDevelop || !hasReviewRule || !hasQualityRule) {
      failures.push('Branch/CI policy must cover main, develop, reviewed pull requests, and quality gates.');
    }
  }
}

parsePackageScripts();
verifyWorkflow();
verifyRepositoryPolicyFiles();

if (failures.length > 0) {
  console.error('WBS 1.3 quality configuration verification failed:');
  for (const failure of [...new Set(failures)]) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('WBS 1.3 quality configuration verification passed.');
}
