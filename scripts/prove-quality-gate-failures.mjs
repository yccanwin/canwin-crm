#!/usr/bin/env node
/**
 * WBS 1.3 reversible proof that each quality gate rejects a representative
 * fault and accepts the clean working tree afterwards. Run only after npm ci.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const npmCliPath = process.env.npm_execpath;
const evidenceDirectory = path.join(root, 'artifacts', 'verification', 'gate-1', 'wbs-1.3-quality-gates');
const manifestPath = path.join(evidenceDirectory, 'manifest.json');
const records = [];
const requiredScripts = ['verify:env', 'lint', 'typecheck', 'test', 'build'];
const liveKeyPatterns = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:sbp|sb_secret)_[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
];

function readGitSha() {
  const dotGit = path.join(root, '.git');
  try {
    let gitDirectory = dotGit;
    if (fs.statSync(dotGit).isFile()) {
      const pointer = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)\s*$/m);
      if (!pointer) return 'unavailable';
      gitDirectory = path.resolve(root, pointer[1]);
    }
    const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    const sha = ref ? fs.readFileSync(path.join(gitDirectory, ref[1]), 'utf8').trim() : head;
    return /^[0-9a-f]{7,64}$/i.test(sha) ? sha : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function sanitize(value) {
  let text = String(value ?? '').replaceAll(root, '<repo>');
  for (const pattern of liveKeyPatterns) {
    text = text.replace(pattern, '<redacted-key>');
  }
  text = text.replace(/((?:SECRET|TOKEN|PASSWORD|PRIVATE|API_?KEY)[A-Z0-9_]*)\s*=\s*[^\s\r\n]+/gi, '$1=<redacted>');
  return text.replace(/\r/g, '').slice(0, 2000);
}

function runNpm(script) {
  if (!npmCliPath) {
    return {
      exitCode: -1,
      signal: null,
      stdout: '',
      stderr: 'npm_execpath is unavailable; run this proof through npm.',
    };
  }

  // Invoke npm-cli.js with Node instead of spawning npm.cmd directly. The
  // latter is not an executable binary and can fail with EINVAL on Windows.
  const result = childProcess.spawnSync(process.execPath, [npmCliPath, 'run', script], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : -1,
    signal: result.signal ?? null,
    stdout: sanitize(result.stdout),
    stderr: sanitize(result.stderr || result.error?.message),
  };
}

function record(caseId, expected, actual) {
  // A spawn/precondition error is represented by -1 and must never count as a
  // successful rejection. Only a real child-process failure proves the gate.
  const pass = expected === 'non-zero' ? actual.exitCode > 0 : actual.exitCode === 0;
  records.push({
    case_id: caseId,
    WBS: '1.3',
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    git_sha: readGitSha(),
    expected,
    actual: {
      exit_code: actual.exitCode,
      signal: actual.signal,
    },
    pass,
    sanitized_evidence: {
      stdout: actual.stdout,
      stderr: actual.stderr,
    },
  });
  return pass;
}

function createFixture(relativePath, content) {
  const target = path.join(root, relativePath);
  const parent = path.dirname(target);
  const parentExisted = fs.existsSync(parent);
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
  return () => {
    fs.rmSync(target, { force: true });
    if (!parentExisted) {
      try {
        fs.rmdirSync(parent);
      } catch {
        // The directory may contain project files created by a concurrent tool.
      }
    }
  };
}

function proveFailure(caseId, script, fixturePath, fixtureContent) {
  let cleanup;
  try {
    cleanup = createFixture(fixturePath, fixtureContent);
    record(caseId, 'non-zero', runNpm(script));
  } catch (error) {
    record(caseId, 'non-zero', {
      exitCode: -1,
      signal: null,
      stdout: '',
      stderr: sanitize(error?.stack || error),
    });
  } finally {
    if (cleanup) cleanup();
  }
}

function writeManifest() {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const manifest = {
    WBS: '1.3',
    generated_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    git_sha: readGitSha(),
    records,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function hasInstalledDependencies() {
  return fs.existsSync(path.join(root, 'node_modules')) && fs.existsSync(path.join(root, 'package-lock.json'));
}

let allPassed = true;
try {
  if (!hasInstalledDependencies()) {
    throw new Error('Dependencies are not installed. Run npm ci before quality-gate failure proof.');
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const script of requiredScripts) {
    if (typeof packageJson.scripts?.[script] !== 'string') {
      throw new Error(`Missing package script: ${script}`);
    }
  }

  const suffix = `${process.pid}-${Date.now()}`;
  proveFailure('secret-rejects-nonexample-env', 'verify:env', `.env.quality-gate-${suffix}`, 'QUALITY_GATE_PROOF=not_a_secret\n');
  proveFailure('lint-rejects-parse-error', 'lint', `apps/web/src/__quality_gate_lint_${suffix}.ts`, 'const = ;\n');
  proveFailure('type-rejects-invalid-assignment', 'typecheck', `apps/web/src/__quality_gate_type_${suffix}.ts`, 'const qualityGateType: string = 42;\nexport {};\n');
  proveFailure('test-rejects-failing-fixture', 'test', `apps/web/test/__quality_gate_test_${suffix}.test.js`, "throw new Error('QUALITY_GATE_TEST_PROOF');\n");
  proveFailure('build-rejects-type-error', 'build', `apps/web/src/__quality_gate_build_${suffix}.ts`, 'const qualityGateBuild: string = 42;\nexport {};\n');

  for (const script of requiredScripts) {
    record(`${script}-clean-pass`, 'zero', runNpm(script));
  }
} catch (error) {
  allPassed = false;
  record('proof-precondition', 'zero', {
    exitCode: -1,
    signal: null,
    stdout: '',
    stderr: sanitize(error?.stack || error),
  });
} finally {
  writeManifest();
}

if (!records.every((recordItem) => recordItem.pass)) {
  allPassed = false;
}
if (!allPassed) {
  console.error(`WBS 1.3 quality-gate failure proof failed; see ${path.relative(root, manifestPath)}.`);
  process.exitCode = 1;
} else {
  console.log(`WBS 1.3 quality-gate failure proof passed; manifest: ${path.relative(root, manifestPath)}.`);
}
