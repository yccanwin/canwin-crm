#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const candidates = process.platform === 'win32'
  ? [
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')
        : null,
    ]
  : ['bash'];
const bash = candidates.filter(Boolean).find((candidate) => candidate === 'bash' || fs.existsSync(candidate));

if (!bash) {
  console.error('Credential-suppression probe requires Bash.');
  process.exit(1);
}

const sentinel = `credential_probe_${randomUUID().replaceAll('-', '')}`;
const probe = String.raw`
set -euo pipefail
probe_dir="$(mktemp -d)"
cleanup_probe_dir() { rmdir "$probe_dir" 2>/dev/null || true; }
trap cleanup_probe_dir EXIT

run_start_failure() (
  set +x
  start_log="$probe_dir/start.log"
  cleanup_supabase_start() {
    rm -f -- "$start_log"
  }
  trap cleanup_supabase_start EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  install -m 600 /dev/null "$start_log"
  raw_log_mode="$(stat -c '%a' "$start_log")"
  if [[ "$CANWIN_REQUIRE_POSIX_MODE" == '1' ]]; then
    [[ "$raw_log_mode" == '600' ]] || exit 20
  fi
  if sh -c 'printf "%s\n" "$CANWIN_PROBE_SENTINEL"; exit 19' >"$start_log" 2>&1; then
    printf '%s\n' 'Unexpected success.'
  else
    start_status=$?
    printf 'Local Supabase startup failed (exit %s); raw output withheld because it may contain temporary credentials.\n' "$start_status" >&2
    exit "$start_status"
  fi
)

set +e
safe_output="$(run_start_failure 2>&1)"
safe_status=$?
set -e

expected_output='Local Supabase startup failed (exit 19); raw output withheld because it may contain temporary credentials.'
[[ "$safe_status" -eq 19 ]]
[[ "$safe_output" == "$expected_output" ]]
[[ "$safe_output" != *"$CANWIN_PROBE_SENTINEL"* ]]
[[ ! -e "$probe_dir/start.log" ]]
if [[ "$CANWIN_REQUIRE_POSIX_MODE" == '1' ]]; then
  raw_log_mode_0600=true
  mode_verification='posix-verified'
else
  raw_log_mode_0600=null
  mode_verification='not-applicable-windows'
fi
printf '{"status":"PASS","case":"controlled-start-failure","exit":19,"secret_exposed":false,"raw_log_mode_0600":%s,"mode_verification":"%s","raw_log_removed":true}\n' \
  "$raw_log_mode_0600" "$mode_verification"
`;

const result = spawnSync(bash, ['-s'], {
  input: probe,
  encoding: 'utf8',
  env: {
    ...process.env,
    CANWIN_PROBE_SENTINEL: sentinel,
    CANWIN_REQUIRE_POSIX_MODE: process.platform === 'win32' ? '0' : '1',
  },
  windowsHide: true,
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const sanitizedOutput = output.replaceAll(sentinel, '[REDACTED]').trim();

if (result.error || result.status !== 0) {
  console.error(`Credential-suppression probe failed${sanitizedOutput ? `: ${sanitizedOutput}` : '.'}`);
  process.exit(1);
}
if (output.includes(sentinel)) {
  console.error('Credential-suppression probe exposed its sentinel.');
  process.exit(1);
}

let evidence;
try {
  evidence = JSON.parse(result.stdout.trim());
} catch {
  console.error('Credential-suppression probe did not emit valid JSON evidence.');
  process.exit(1);
}
const modeEvidenceValid = process.platform === 'win32'
  ? evidence.raw_log_mode_0600 === null && evidence.mode_verification === 'not-applicable-windows'
  : evidence.raw_log_mode_0600 === true && evidence.mode_verification === 'posix-verified';
if (evidence.status !== 'PASS'
  || evidence.exit !== 19
  || evidence.secret_exposed !== false
  || !modeEvidenceValid
  || evidence.raw_log_removed !== true) {
  console.error('Credential-suppression probe emitted an invalid result.');
  process.exit(1);
}

console.log(JSON.stringify(evidence));
