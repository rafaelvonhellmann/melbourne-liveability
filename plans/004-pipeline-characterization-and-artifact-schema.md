# Plan 004: Characterization tests for apply steps + inter-step artifact validation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- scripts/apply-civic.ts scripts/apply-abs-approvals.ts scripts/apply-housing-stress.ts scripts/build.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the build orchestrator; validation must not
  false-positive on legitimate monthly data movement)
- **Depends on**: none (001/002 recommended first — same muscle, smaller)
- **Category**: tests
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

The data pipeline's ~30 fetch scripts and apply steps have zero unit tests.
The repo's defense layers (coverage gate, carry-forward) catch FIELD-COUNT
loss but not WRONG VALUES: a drifted join key in an apply step can silently
null a context field for a month before the repeat-carry tripwire fires, and
a fetch returning structurally-valid-but-wrong rows sails through. The
2026-06-12 contamination incident was exactly this class. This plan adds
(a) fixture-based characterization tests for three representative apply
steps, and (b) a cheap schema validator that runs between build steps and
fails loudly on structural damage.

## Current state

- `scripts/build.ts` — orchestrates the pipeline; runs steps via npm scripts.
- `scripts/apply-civic.ts` — representative apply step. Excerpt (lines 71-103):

```ts
async function main() {
  const placesPath = generatedOutPath("places.json");
  const { generatedAt, places } = JSON.parse(await readFile(placesPath, "utf8")) as {
    generatedAt: string;
    places: Place[];
  };
  ...
  let enriched = 0;
  for (const p of places) {
    const v = vol.get(p.sa2Code);
    if (v == null) continue;
    const community = { ...(p.context?.community ?? {}), volunteerPct: v };
    p.context = { ...(p.context ?? {}), community } as PlaceContext;
    enriched++;
  }
  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
```

Note: apply scripts PRESERVE `generatedAt` (do not re-stamp) and join by
`p.sa2Code`. The dangerous part is the join map (`vol`) construction in each
script's fetch/parse section, plus the merge semantics (must not clobber
sibling context fields).

- `scripts/apply-abs-approvals.ts`, `scripts/apply-housing-stress.ts` —
  same shape, different sources/fields.
- Soft mode: `APPLY_CIVIC_SOFT=1` makes a fetch failure a warn+skip
  (carry-forward keeps last month's values) — see apply-civic.ts:82-88.
- Tests live in `tests/`, vitest, node env default. Exemplar for
  fixture-based pipeline tests: `tests/coverage-diff.test.ts`.

## Commands you will need

| Purpose   | Command                                            | Expected |
|-----------|----------------------------------------------------|----------|
| Typecheck | `rtk npm run typecheck`                            | exit 0   |
| Lint      | `rtk npm run lint`                                 | exit 0   |
| Tests     | `rtk npm run test`                                 | all pass |
| New file  | `rtk npx vitest run tests/apply-steps.test.ts`     | all pass |

## Scope

**In scope**:
- `tests/apply-steps.test.ts` (create)
- `scripts/validate-artifacts.ts` (create)
- `scripts/apply-civic.ts`, `scripts/apply-abs-approvals.ts`,
  `scripts/apply-housing-stress.ts` — ONLY the minimal refactor of
  extracting each script's pure merge function (e.g.
  `export function applyVolunteering(places, vol): number`) so it is
  importable by tests. Behavior byte-identical.
- `scripts/build.ts` — add `npm run data:validate` invocations (see Step 4)
- `package.json` — add the `data:validate` script entry

**Out of scope**:
- The other ~27 fetch scripts (follow-up, not this plan).
- Any change to artifact shapes, file names, or melbourne byte-identity.
- The coverage-gate script (`verify-coverage-diff.ts`) — it is a separate
  layer and already tested.
- Network calls in tests — fixtures only.

## Git workflow

- Branch: `advisor-004-pipeline-characterization`
- Two commits: `test(pipeline): characterization tests for apply steps`,
  then `feat(pipeline): inter-step artifact validation (data:validate)`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Extract pure merge functions

In each of the three apply scripts, extract the `for (const p of places)`
merge loop into an exported pure function taking `(places, joinMap)` and
returning the enriched count. `main()` calls it. No behavior change.

**Verify**: `rtk npm run typecheck` → exit 0; `rtk npm run test` → existing
suite still green.

### Step 2: Characterization tests

Create `tests/apply-steps.test.ts` with fixture places (3-5 records,
realistic sa2Codes) per script:
- happy path: matching codes enriched, count correct, value lands at the
  exact context path (e.g. `context.community.volunteerPct`);
- non-matching code untouched — AND sibling context fields preserved
  (seed `context.community.someOther` and assert it survives the merge);
- empty join map → zero enriched, places unchanged (deep-equal);
- `generatedAt` passthrough is the caller's job — assert the pure function
  never reads/writes it (it only sees `places`).

**Verify**: `rtk npx vitest run tests/apply-steps.test.ts` → all pass.

### Step 3: Write the artifact validator

Create `scripts/validate-artifacts.ts`:
- reads `data/generated/places[.region].json` (region from the same
  `PIPELINE_REGION` mechanism the other scripts use — see
  `scripts/lib/pipeline-region.ts`),
- asserts: parses as JSON; has `generatedAt` (ISO string) and `places`
  (non-empty array); every place has `sa2Code`, `slug`, `name`, `centroid`
  ([lng,lat] numbers), `domains` object; for the first 10 places, every
  present domain has `domain`, `scored` boolean, `percentile`
  (number|null), `subIndicators` object;
- region sanity: place count within a hard floor (>= 20 — Darwin is ~30)
  and every `sa2Code` starts with the region's expected state digit(s)
  (read from the region registry: `lib/regions.ts` stateCode; for
  cross-border future regions, accept any of `states[]` if that field
  exists, else single stateCode);
- exits 1 with a named, specific error on any violation; prints one OK line
  otherwise.

Add to `package.json`: `"data:validate": "tsx scripts/validate-artifacts.ts"`.

**Verify**: `rtk npm run data:validate` against the committed melbourne
artifact → exits 0 and prints the OK line.

### Step 4: Wire into the build orchestrator

In `scripts/build.ts`, run `npm run data:validate` (same exec mechanism as
the other steps) at exactly two points: after the score step, and as the
final step. Do NOT add it after every apply (cost/noise); the final run
catches apply damage.

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ exit 0. Do NOT run a full bake.

## Test plan

`tests/apply-steps.test.ts` as in Step 2 (≥ 12 cases across 3 scripts).
Validator: add 3 unit tests in the same file using temp-dir fixture JSON
(valid → ok; missing sa2Code → exit/throw; empty places → throw), importing
the validator's exported check function (export it; keep the CLI shell thin).

## Done criteria

- [ ] Three apply scripts export pure merge functions; `main()` behavior unchanged
- [ ] `tests/apply-steps.test.ts` exists, ≥ 12 tests, all pass
- [ ] `rtk npm run data:validate` exits 0 on the committed artifacts
- [ ] `scripts/build.ts` calls validation after score + at end
- [ ] All root gates exit 0
- [ ] `plans/README.md` row updated

## STOP conditions

- Apply scripts' structure differs from the excerpt (drift).
- Extracting the merge function requires changing its observable behavior.
- The validator FAILS on a committed artifact — that means it found a real
  pre-existing problem: report the exact violation, do not loosen the check
  silently and do not "fix" the artifact.
- `build.ts`'s step mechanism can't accommodate a new step without
  restructuring (it should — it is a list of npm script invocations).

## Maintenance notes

- New apply steps should follow the extracted-pure-function pattern and get
  a characterization test — reviewers should block apply PRs without one.
- The validator's region sanity check must be extended when cross-border
  SUA regions (Gold Coast-Tweed) land — their sa2Codes legitimately span
  two state digits. See NATIONAL-ROLLOUT.md / task list W11.
- Follow-up (deferred): same treatment for the highest-risk fetch scripts
  (fetch-indicators.ts crime/income tables) — larger, separate plan.
