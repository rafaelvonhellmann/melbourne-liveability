# Plan 008: Replace @turf/turf barrel imports with granular packages in client libs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report. When done, update this plan's row in
> `plans/README.md`. Prefix shell commands with `rtk ` (repo convention; if
> unavailable, run the bare command).
>
> **Drift check (run first)**: `git diff --stat aca59bf..HEAD -- lib/activity-centres.ts lib/parcel.ts lib/school-zones.ts lib/water.ts package.json`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `aca59bf`, 2026-06-12

## Why this matters

Four CLIENT-reachable lib modules import the full `@turf/turf` barrel for a
handful of functions. If the bundler fails to tree-shake the namespace import
(common with barrel packages), several hundred KB of geometry code ships to
the browser for point-in-polygon checks. Honest caveat (vetted): turf 7 is
ESM and Next MAY already tree-shake this — the plan therefore measures
before-and-after and is allowed to conclude "no win, revert" as a valid
outcome. Granular imports are also simply more precise dependency hygiene.

## Current state

- Client-reachable barrel imports (verified):
  - `lib/activity-centres.ts:11` — `import * as turf from "@turf/turf";`
  - `lib/parcel.ts:11` — same
  - `lib/school-zones.ts:11` — same
  - `lib/water.ts:7` — same

Excerpt (`lib/water.ts:7-23`):

```ts
import * as turf from "@turf/turf";
...
  const pt = turf.point(point);
  for (const c of corps) {
    ...
    if (turf.booleanPointInPolygon(pt, g)) return { name: c.name, url: c.url };
```

- `scripts/*` also use the barrel (build-crosswalk, build-geo, fetch-*) —
  those are BUILD-TIME ONLY and explicitly out of scope.
- `package.json` currently depends on `@turf/turf` (^7.2.0).
- The repo has unit tests covering all four libs (e.g. water retailer tests).

## Commands you will need

| Purpose   | Command                                          | Expected |
|-----------|--------------------------------------------------|----------|
| Typecheck | `rtk npm run typecheck`                          | exit 0   |
| Lint      | `rtk npm run lint`                               | exit 0   |
| Tests     | `rtk npm run test`                               | all pass |
| Install   | `rtk npm install @turf/helpers @turf/boolean-point-in-polygon <+ others found>` | exit 0, lockfile updated |

## Scope

**In scope**:
- `lib/activity-centres.ts`, `lib/parcel.ts`, `lib/school-zones.ts`,
  `lib/water.ts` — import statements + `turf.` prefixes only
- `package.json` + `package-lock.json` — ADD granular @turf packages.
  KEEP `@turf/turf` itself (scripts still use it).

**Out of scope**:
- All `scripts/*` turf usage (build-time; zero client impact).
- Removing `@turf/turf` from package.json.
- Any geometry logic change.

## Git workflow

- Branch: `advisor/008-turf-granular`
- Commit: `perf(bundle): granular @turf imports in client libs`
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Inventory exact turf functions per file

`rtk grep -n "turf\." lib/activity-centres.ts lib/parcel.ts lib/school-zones.ts lib/water.ts`
List every distinct `turf.X` call. Map each to its granular package
(turf 7 naming): `point`/`polygon` etc → `@turf/helpers`,
`booleanPointInPolygon` → `@turf/boolean-point-in-polygon`,
`area` → `@turf/area`, `distance` → `@turf/distance`,
`centroid` → `@turf/centroid` — derive the package for anything else from
the turf docs (package name = kebab-case function name).

### Step 2: Install + swap

Install the granular packages found. In each of the four files replace the
namespace import with named imports and drop the `turf.` prefixes. No other
edits.

**Verify**: `rtk npm run typecheck && rtk npm run lint && rtk npm run test`
→ all green (the libs' existing unit tests pin behavior).

### Step 3: Measure (best-effort)

Local `next build` is unreliable on this machine (OneDrive race) — do NOT
fight it. Instead: record `rtk npx next build` ONLY IF it succeeds first try;
otherwise note "bundle measurement deferred to CI" in your report and rely on
the deploy workflow's build. If you can build twice (before via
`git stash` / after), record the relevant route chunk sizes from Next's
output table for the buyer-report route and the main app route.

**Verify**: a before/after size note (or an explicit deferral note) exists in
your final report.

## Test plan

No new tests — the four libs are already unit-tested; green suite is the
behavioral guarantee.

## Done criteria

- [ ] `rtk grep -rn "import \* as turf" lib/` returns no matches
- [ ] Granular packages in package.json; `@turf/turf` still present (scripts)
- [ ] Root gates exit 0
- [ ] Size note or deferral note recorded
- [ ] `plans/README.md` row updated

## STOP conditions

- A used function has no granular package equivalent in turf 7 — report it
  rather than restructuring the code.
- Tests fail after the swap — likely an import-shape mismatch (default vs
  named export differs per turf package; check the package's own README);
  two failed fix attempts = stop.

## Maintenance notes

- If CI bundle output shows NO size change, record that in plans/README.md
  as the outcome — keep the granular imports anyway (hygiene), and strike
  the perf claim.
- New client code should import granular turf packages; scripts may keep the
  barrel.
