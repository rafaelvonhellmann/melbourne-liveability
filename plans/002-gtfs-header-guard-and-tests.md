# Plan 002: Make GTFS CSV header drift fail loudly (and test the parser)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`. Prefix shell commands with `rtk ` (repo convention;
> if unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- scripts/precompute-gtfs.ts`
> On any change, compare the "Current state" excerpt against live code; on a
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

`scripts/precompute-gtfs.ts` streams GTFS CSVs for all 8 capital-city transit
feeds. Column positions are resolved with `header.indexOf(...)`, which returns
`-1` when a column is missing or renamed. `-1` is then used as an array index:
`cols[-1]` is `undefined` in JavaScript, so every row silently fails the
`!stopId || !tripId` guard and the region produces ZERO matched stops — an
empty transport domain with no error. A feed publisher renaming one column
(or an unstripped BOM on a non-first column) turns into silent national data
loss instead of a failed bake. The repo's whole quality posture (coverage
gates, loud 503s, tripwire tests) is "fail loudly"; this is the one silent
spot.

## Current state

- `scripts/precompute-gtfs.ts` — region-generic GTFS precompute (generalized
  2026-06-12, commit 3303f48). Streams `stop_times.txt` line-by-line.

Excerpt (`scripts/precompute-gtfs.ts:164-182`):

```ts
  let header: string[] | null = null;
  let idxStop = -1;
  let idxTrip = -1;
  let idxArr = -1;
  let idxDep = -1;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(stripBom(line)).map((h) => stripBom(h));
      idxStop = header.indexOf("stop_id");
      idxTrip = header.indexOf("trip_id");
      idxArr = header.indexOf("arrival_time");
      idxDep = header.indexOf("departure_time");
      continue;
    }
    const cols = parseCsvLine(line);
    const stopId = cols[idxStop];
    const tripId = cols[idxTrip];
```

There are several other CSV readers in the same file using the same
`indexOf` pattern (stops.txt, trips.txt, calendar.txt, routes.txt — find them
all with `rtk grep -n "indexOf(" scripts/precompute-gtfs.ts`).

- There is currently NO unit test for this file
  (`rtk ls tests | grep -i gtfs` → only `bus-stops.test.ts`, which tests the
  output consumer, not the parser).

## Commands you will need

| Purpose   | Command                                       | Expected |
|-----------|-----------------------------------------------|----------|
| Typecheck | `rtk npm run typecheck`                       | exit 0   |
| Lint      | `rtk npm run lint`                            | exit 0   |
| Tests     | `rtk npm run test`                            | all pass |
| One file  | `rtk npx vitest run tests/precompute-gtfs.test.ts` | all pass |

## Scope

**In scope**:
- `scripts/precompute-gtfs.ts` — add header validation only (no behavioral
  change on valid feeds)
- `tests/precompute-gtfs.test.ts` (create)
- Possibly a tiny exported helper in `scripts/precompute-gtfs.ts` (e.g.
  `requireColumns(header, names, file)`) so the guard is testable.

**Out of scope**:
- `scripts/lib/gtfs-constants.ts` — feed URLs/bbox constants are pinned by
  other tests; do not touch.
- Any change to output file names, shapes, or melbourne semantics
  (`gtfs-transport.json`, `bus-stops.json` stay byte-compatible for
  unchanged inputs).
- Network access in tests — fixtures only.

## Git workflow

- Branch: `advisor-002-gtfs-header-guard`
- Commit style: `fix(gtfs): fail loudly when a feed header drops a required column`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Inventory every header-index site in the file

`rtk grep -n "indexOf(" scripts/precompute-gtfs.ts` — list each CSV reader
and which columns are REQUIRED for it to produce meaningful output (e.g.
stop_times: stop_id + trip_id required; arrival/departure optional-ish — if
both missing, am-peak frequency is impossible: treat as required as a pair).

### Step 2: Add a `requireColumns` guard

Add a small exported function near the top of `scripts/precompute-gtfs.ts`:

```ts
export function requireColumns(
  header: string[],
  required: string[],
  file: string
): void {
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `GTFS ${file}: required column(s) missing: ${missing.join(", ")} - ` +
        `header was [${header.join(", ")}]. Feed format drifted; refusing to ` +
        `produce silently-empty transport data.`
    );
  }
}
```

Call it immediately after each header parse, with that reader's required
columns. Keep optional columns optional (e.g. if the existing code already
tolerates a missing `arrival_time` by falling back to `departure_time`,
require at least one of the pair — implement as a second check, not by
weakening requireColumns).

**Verify**: `rtk npm run typecheck` → exit 0.

### Step 3: Write parser unit tests with in-memory fixtures

Create `tests/precompute-gtfs.test.ts`. Test `requireColumns` directly:
happy path (all present → no throw), missing one (throws, message names the
column and file), BOM-prefixed header handled by the existing `stripBom`
(construct the string `"﻿stop_id,trip_id"` and assert no throw after the
file's existing stripBom treatment — import and reuse the same helpers if
exported, otherwise test through requireColumns with pre-stripped input and
note the limitation in a comment).

If the zip-reading internals are not exportable without refactor, test ONLY
the exported guard — do not refactor the streaming internals in this plan.

**Verify**: `rtk npx vitest run tests/precompute-gtfs.test.ts` → all pass.

### Step 4: Full gates

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ exit 0, all pass. Note: do NOT run an actual GTFS bake (network, long).

## Test plan

- New file `tests/precompute-gtfs.test.ts`: requireColumns happy path,
  single-missing, multi-missing, error message content, arrival/departure
  pair rule. Model structure after `tests/bus-stops.test.ts`.

## Done criteria

- [ ] Every `indexOf(` header site in `scripts/precompute-gtfs.ts` is
      followed by a `requireColumns` (or pair-rule) guard
- [ ] `rtk npm run typecheck` / `lint` / `test` all exit 0
- [ ] New tests exist and pass
- [ ] No out-of-scope files modified (`rtk git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpt above doesn't match the live file (drift).
- Adding the guard requires restructuring the streaming reader (it should
  not — it's a pure post-header check). If it does, report why.
- Any existing test fails after the change — the guard must be a no-op on
  valid feeds.

## Maintenance notes

- When the TfNSW key lands and Sydney's feed runs for the first time, this
  guard is the thing that converts a surprise format difference into a clear
  CI failure with the column name in the message — exactly what the bake
  failure-issue workflow needs.
- Future GTFS readers added to this file must call the same guard; reviewers
  should check for that.
