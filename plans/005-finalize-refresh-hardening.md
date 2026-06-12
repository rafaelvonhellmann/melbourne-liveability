# Plan 005: Harden the data-refresh finalize step (no silent stale-prod)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- .github/workflows/data-refresh.yml`
> On mismatch with the excerpt below, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (CI-only change, but a bug here breaks the monthly refresh —
  the failure path must be tested via the extracted script, not by faith)
- **Depends on**: none
- **Category**: tests / ops
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

The refresh workflow's final step commits data, rebases, pushes, and
dispatches the Pages deploy — as inline shell in YAML. The rebase
(`git pull --rebase origin master`) can hit a conflict; with the current
multi-line `run:` block the step DOES fail on a non-zero exit (GitHub runs
bash with `-e` by default), but nothing distinguishes "conflict, repo left
mid-rebase" from any other failure, there is no retry for the common benign
case (master moved again between rebase and push), and the failure issue
gives no actionable cause. During the 2026-06-12 multi-bake day, pushes raced
real commits several times; the retry-less push is the weakest link in an
otherwise gate-heavy pipeline. Extracting the logic into a tested script
makes the failure modes explicit, retried where safe, and unit-tested.

## Current state

- `.github/workflows/data-refresh.yml` — excerpt (lines 143-167):

```yaml
      - name: Commit refreshed data
        id: commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/generated/*.json public/data/*
          if git diff --staged --quiet; then
            echo "No data changes - upstream unchanged."
            echo "pushed=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "chore(data): automated refresh $(date -u +%Y-%m-%d) [$REGION]"
            # Master may have moved during the multi-hour run; the data commit
            # touches only data/generated + public/data, so a rebase is safe.
            git pull --rebase origin master
            git push
            echo "pushed=true" >> "$GITHUB_OUTPUT"
          fi

      # GITHUB_TOKEN pushes do not fire on:push workflows, so kick the Pages
      # deploy explicitly (deploy-pages.yml has workflow_dispatch).
      - name: Trigger Pages redeploy
        if: steps.commit.outputs.pushed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh workflow run deploy-pages.yml --ref master
```

- The failure-issue step (lines 169-184) fires on `failure() || cancelled()`
  and links the run; it has no cause detail.
- Pipeline scripts run via `tsx` (see package.json `data:*` scripts) and the
  repo already mocks `child_process` in tests — no exemplar yet for execFile
  mocking; closest structural pattern: `tests/coverage-diff.test.ts`.

## Commands you will need

| Purpose   | Command                                              | Expected |
|-----------|------------------------------------------------------|----------|
| Typecheck | `rtk npm run typecheck`                              | exit 0   |
| Lint      | `rtk npm run lint`                                   | exit 0   |
| Tests     | `rtk npm run test`                                   | all pass |
| New file  | `rtk npx vitest run tests/finalize-refresh.test.ts`  | all pass |

## Scope

**In scope**:
- `scripts/finalize-refresh.ts` (create)
- `tests/finalize-refresh.test.ts` (create)
- `.github/workflows/data-refresh.yml` — replace the "Commit refreshed data"
  run-block body with a single `npx tsx scripts/finalize-refresh.ts` call
  (keep the step id/outputs contract: `pushed=true|false`), and append the
  script's last error line into the failure-issue body if easily available
  via a step output.
- `package.json` — optional `data:finalize` script entry.

**Out of scope**:
- The "Trigger Pages redeploy" step and the failure-issue step's structure.
- Workflow triggers, permissions, region inputs, every other step.
- Any git behavior change beyond: bounded retry + explicit error classes.

## Git workflow

- Branch: `advisor-005-finalize-refresh`
- Commit: `feat(ci): tested finalize-refresh script with bounded rebase/push retry`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Write `scripts/finalize-refresh.ts`

Implement with `execFileSync` (never shell-interpolated strings):
1. configure git user (same values as today);
2. `git add data/generated/*.json public/data/*` — use explicit
   `execFileSync("git", ["add", ...])` with glob expansion via fs (or
   `git add -- data/generated public/data` if staging dirs matches today's
   effect; verify with `git status --porcelain` that nothing outside those
   paths is staged — if anything else is staged, fail);
3. if staged diff empty → print + emit `pushed=false` to `$GITHUB_OUTPUT`
   (append to the file at `process.env.GITHUB_OUTPUT`; if unset — local run —
   print only) → exit 0;
4. commit with today's message format
   `chore(data): automated refresh YYYY-MM-DD [<REGION>]` (REGION from env,
   required — fail with a named error if missing);
5. retry loop (max 3): `git pull --rebase origin master` then `git push`;
   on push rejection, loop; on REBASE CONFLICT (detect: rebase exits
   non-zero), run `git rebase --abort`, then fail with error class
   `rebase_conflict` and a message naming the conflicting files
   (`git diff --name-only --diff-filter=U` captured BEFORE the abort);
6. on success emit `pushed=true`; on any failure print
   `finalize-refresh error [<class>]: <detail>` as the LAST line and exit 1.

**Verify**: `rtk npm run typecheck` → exit 0.

### Step 2: Unit tests with a mocked execFileSync

`tests/finalize-refresh.test.ts` — export the core as a function taking an
exec interface so tests inject a fake (do not mock node:child_process
globally). Cases:
- no staged changes → pushed=false, zero commit/push calls;
- happy path → add/commit/pull/push sequence, pushed=true;
- push rejected once then succeeds → exactly 2 pull+push rounds;
- push rejected 3 times → exit error class `push_rejected`;
- rebase conflict → `rebase --abort` called, error class `rebase_conflict`,
  conflicting files in message;
- missing REGION env → named failure before any git call;
- unexpected staged file (e.g. `lib/foo.ts`) → named failure before commit.

**Verify**: `rtk npx vitest run tests/finalize-refresh.test.ts` → all pass.

### Step 3: Swap the workflow step body

Replace the run-block body with:

```yaml
        run: npx tsx scripts/finalize-refresh.ts
```

keeping `id: commit` and the `pushed` output contract (the script writes to
`$GITHUB_OUTPUT`). Do not touch surrounding steps.

**Verify**: `rtk npx tsx scripts/finalize-refresh.ts` locally in a CLEAN
tree → prints "No data changes" + exits 0 (safe no-op). Then
`rtk npm run test` → all green. YAML sanity:
`rtk npx --yes yaml-lint .github/workflows/data-refresh.yml` if available,
else careful manual indent check against the excerpt.

## Test plan

As Step 2 — 7 cases, exec-interface injection, no real git calls in tests.

## Done criteria

- [ ] Workflow step body is the single script call; outputs contract intact
- [ ] Script exits 0 as a no-op on a clean tree (verified locally)
- [ ] 7+ unit tests pass; root gates exit 0
- [ ] No out-of-scope files modified
- [ ] `plans/README.md` row updated

## STOP conditions

- The workflow excerpt has drifted.
- The `$GITHUB_OUTPUT` mechanism can't be honored from the script (it can —
  it's a file append; if you find otherwise, report).
- You are tempted to widen scope to the failure-issue step's logic — don't;
  note the idea in the report instead.
- Local no-op verification stages or commits ANYTHING (tree wasn't clean —
  abort and report).

## Maintenance notes

- The error classes (`rebase_conflict`, `push_rejected`) are the hook for a
  smarter failure-issue body later — deferred deliberately.
- If the bake ever starts committing files outside data/generated +
  public/data, the staging guard here will fail loudly — that is intended;
  update the allowlist consciously.
- First real CI run after merge should be watched (dispatch a small region,
  e.g. canberra, and confirm pushed=true + deploy fires).
