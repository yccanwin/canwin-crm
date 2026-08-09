# Branch, CI, and quality gates

Status: WBS 1.3 repository policy. Apply these controls before feature work is
merged. The repository administrator is responsible for matching the hosted
GitHub settings to this document.

## Branch model

- `main` is the default and protected integration branch.
- All planned work starts from `main` on a short-lived branch named
  `agent/<wbs-or-issue>-<short-description>`.
- Every change reaches `main` through a pull request. Direct pushes to `main`
  are prohibited.
- Direct pushes to `develop` are also prohibited if that branch is introduced;
  the initial workflow does not require a long-lived `develop` branch.
- Branches must use linear history. Merge commits are disabled; use squash or
  rebase according to the repository's selected merge method.
- Force pushes and protected-branch deletion are prohibited.

Automations and administrators follow the same merge path. Emergency exceptions
must be documented in an incident or change record, time-bounded, and reviewed
afterward; they do not create a standing bypass.

## Pull request requirements

Before merge, every pull request must:

1. use the repository PR template and link its WBS item or issue;
2. remain within the declared scope and contain no credentials or production
   data;
3. receive CODEOWNERS and stage-gate review when the current review phase
   requires it;
4. resolve every review conversation;
5. pass the required status check named exactly `quality`;
6. be up to date with `main` after the latest relevant change; and
7. preserve linear history.

Draft pull requests may run CI but cannot merge. A status from another workflow,
a manually reported result, an older commit, or a skipped/cancelled job does not
satisfy the `quality` requirement.

## Required `quality` status

Configure `quality` as a required status check in **strict** mode: GitHub's
"Require branches to be up to date before merging" option must be enabled. The
required context is the job name `quality` from `.github/workflows/quality.yml`.

The workflow runs without path filters for:

- pull requests targeting `main`;
- pushes to `main` and `agent/**`; and
- manual `workflow_dispatch` runs.

Its gates run in this order and must all succeed:

1. `npm ci`
2. `npm audit --audit-level=high`
3. `npm run verify:scaffold`
4. `npm run verify:env`
5. `npm run lint`
6. `npm run typecheck`
7. `npm run test`
8. `npm run build`

The workflow has read-only repository contents permission, pinned action commit
SHAs, a 15-minute timeout, and concurrency cancellation for superseded runs on
the same ref. CI may not weaken, conditionally skip, or mark a failed gate as
successful to unblock a pull request.

## Review policy by team phase

### Initial small-team phase

Required approving reviews are set to **0** while there is only one eligible
maintainer. This is a temporary availability setting, not permission to self-pass
quality or leave conversations unresolved. CODEOWNERS notification, the strict
`quality` status, resolved conversations, branch restrictions, and linear history
remain mandatory.

### Second reviewer onboarded

As soon as a second eligible reviewer is added, raise required approving reviews
to **1** and enable dismissal of stale approvals when new commits are pushed.
Require CODEOWNER review where the GitHub plan supports it. Record the settings
change in an issue so the initial exception cannot persist unnoticed.

### Third-party supervision phase

At each agreed supervision stage gate, the third-party supervisor rechecks:

- branch/ruleset enforcement and bypass access;
- the exact required `quality` context and strict/up-to-date setting;
- approval count, stale-approval dismissal, and conversation resolution;
- force-push, deletion, and linear-history settings; and
- representative merged PR evidence showing the controls actually blocked or
  passed changes as designed.

Findings require an owner, severity, remediation date, and follow-up evidence.
The supervisor's review supplements CI and peer review; it does not replace them.

## GitHub enforcement and plan fallback

Preferred enforcement is a repository ruleset targeting `main` with:

- pull requests required;
- required status check `quality` in strict/up-to-date mode;
- all review conversations resolved;
- the phase-appropriate approval count and stale-approval behavior;
- force pushes and branch deletion blocked; and
- linear history required.

If the repository's GitHub plan does not support a private-repository ruleset,
configure equivalent classic branch protection for `main`. Document which
mechanism is active and capture sanitized settings evidence.

If the plan supports neither rulesets nor equivalent branch protection, open an
ISS (GitHub Issue) marked as a release/merge blocker, assign the repository owner,
and record the unavailable controls and required plan/admin decision. Until the
control is available, the affected merge or release remains blocked. The gap may
not be silently accepted, represented as passing, or bypassed by relying only on
this document.

## Administrator verification checklist

- [ ] `main` is the default branch.
- [ ] PRs are required and direct pushes to `main`/`develop` are blocked.
- [ ] `quality` is required in strict/up-to-date mode.
- [ ] Review conversations must be resolved.
- [ ] Current approval count matches the team phase.
- [ ] Stale approvals are dismissed once the second reviewer exists.
- [ ] Force pushes and protected-branch deletion are blocked.
- [ ] Linear history is required.
- [ ] No administrator, automation, or ruleset bypass weakens the documented
      controls without a time-bounded recorded exception.
- [ ] Ruleset/branch-protection evidence has been recorded, or a blocking ISS is
      open when the GitHub plan cannot enforce the policy.
