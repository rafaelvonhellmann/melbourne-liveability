# Plan 001: Add hand-computed golden scoring tests for a non-VIC region (Canberra)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`. Prefix shell commands with `rtk ` (repo convention;
> harmless token-saving wrapper — if `rtk` is unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- tests/score-places.test.ts tests/scoring-golden.test.ts scripts/lib/score-places.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

On 2026-06-12 a production incident shipped `scored: true` + Victorian source
ids on the safety/hazards domains of every non-Victorian capital. The fix
added shape tests (`tests/score-places.test.ts`: unscored stubs + a sourceId
tripwire), but the repo's golden-VALUE tests — hand-computed numbers that fail
on any drive-by scoring change — still cover Melbourne only
(`tests/scoring-golden.test.ts`). A wrong percentile for Canberra's ACT-crime
path would pass every existing test. This plan adds hand-computed golden
values for the non-VIC code path so region-specific scoring regressions fail
loudly in CI.

## Current state

- `tests/scoring-golden.test.ts` — golden-value tests for `lib/scoring.ts`
  (percentileRank, computeWeightedScore, rankPlaces). All fixtures are
  Melbourne-shaped. Header comment (lines 7-13) states the golden philosophy:
  "Every expectation here is a hand-computed number."
- `tests/score-places.test.ts` — added 2026-06-12. Has per-capital
  unscored-stub tests, a `vcsa`/`vic-` sourceId tripwire, a Canberra
  ACT-adapter shape test, and a Melbourne byte-identity pin. It does NOT
  assert any hand-computed percentile values for Canberra.
- `scripts/lib/score-places.ts` — pure scoring assembly
  `scorePlaces(raw, region, periodById)` extracted 2026-06-12 (commit
  2790714). This is the function under test.
- `scripts/lib/crime-adapters.ts` — per-state crime adapter registry; the
  `canberra` entry uses sourceId `act-policing-crime-statistics`.

Excerpt — the golden suite's fixture builder you should model after
(`tests/scoring-golden.test.ts:26-41`):

```ts
/** Build a Place whose domain percentiles are exactly `pcts` (null = missing). */
function makePlace(
  slug: string,
  pcts: Partial<Record<DomainId, number | null>>,
  extra: Partial<Place> = {}
): Place {
```

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `rtk npm run typecheck`                   | exit 0              |
| Lint      | `rtk npm run lint`                        | exit 0              |
| Tests     | `rtk npm run test`                        | all pass            |
| One file  | `rtk npx vitest run tests/score-places.test.ts` | all pass      |

## Scope

**In scope** (the only files you should modify/create):
- `tests/score-places.test.ts` (extend) OR a new `tests/score-places-golden.test.ts`

**Out of scope** (do NOT touch):
- `scripts/lib/score-places.ts`, `scripts/lib/crime-adapters.ts`,
  `lib/scoring.ts` — this plan adds tests only; if a test exposes a real
  scoring bug, that is a STOP condition, not a fix-it-here.
- `tests/scoring-golden.test.ts` — Melbourne goldens stay untouched.

## Git workflow

- Branch: `advisor/001-canberra-golden`
- One commit, conventional style, e.g.
  `test(score): hand-computed golden values for the canberra (non-VIC) path`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Read the existing harness

Read `tests/score-places.test.ts` fully. Identify how it builds the raw-input
fixture for `scorePlaces` (the canberra ACT-adapter test is the closest
model). Identify the exact input shape (raw indicator rows, region object,
periodById map).

**Verify**: you can name the fixture-builder function and the canberra region
object used. (`rtk grep -n "canberra" tests/score-places.test.ts` shows the test.)

### Step 2: Build a 5-place Canberra fixture with hand-computable numbers

Create a fixture of exactly 5 places with crime rates chosen so percentiles
are trivial to hand-compute (e.g. property-crime raw rates 100/200/300/400/500
→ within-region percentile ranks 10/30/50/70/90 under the repo's
percentileRank convention — read `lib/scoring.ts:percentileRank` and compute
by hand against its actual formula, do not guess; write the derivation in a
comment above the test).

### Step 3: Assert hand-computed golden values

Add tests asserting, for the fixture:
1. `safety.subIndicators.propertyCrime.percentile` equals your hand-computed
   value for each of the 5 places (exact numbers, `toBeCloseTo` with 10
   decimal places).
2. `safety.subIndicators.propertyCrime.sourceId === "act-policing-crime-statistics"`.
3. `hazards.scored === false` and `hazards.percentile === null` for all 5.
4. A sixth place with NO crime row gets `safety` handled per the current
   shape (read the existing unscored-stub test and match its expectations).

**Verify**: `rtk npx vitest run tests/score-places.test.ts` → all pass,
including your N new tests (count them in the output).

### Step 4: Full gates

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ all exit 0.

## Test plan

This plan IS tests. New cases: 5 hand-computed percentile assertions, source
id pin, hazards-unscored pin, missing-crime-row case. Pattern:
`tests/score-places.test.ts` (existing canberra test) + golden philosophy from
`tests/scoring-golden.test.ts:7-13`.

## Done criteria

- [ ] `rtk npm run typecheck` exits 0
- [ ] `rtk npm run test` exits 0; new golden tests exist and pass
- [ ] At least 5 exact-value percentile assertions for the canberra path
- [ ] No files outside the in-scope list modified (`rtk git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `scorePlaces`'s signature or the canberra adapter sourceId differs from
  this plan's description (codebase drifted).
- Your hand-computed percentile disagrees with the function's output after
  double-checking the derivation — that is potentially a REAL scoring bug;
  report the discrepancy with both numbers, change nothing.
- The fix appears to require modifying any out-of-scope file.

## Maintenance notes

- When Tier-B lands real hazards adapters for non-VIC states, the
  `hazards.scored === false` pin here must be updated deliberately in the
  same PR — that is the test doing its job.
- Reviewer should re-derive at least one percentile by hand.
