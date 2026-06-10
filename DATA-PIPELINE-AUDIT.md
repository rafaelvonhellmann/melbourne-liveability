# Data pipeline audit - apply steps vs the monthly refresh (P0-1)

Audited 2026-06-10 against `scripts/build.ts`, `scripts/normalize.ts`, every
`scripts/apply-*.ts` / `scripts/fetch-*.ts` pair, and
`.github/workflows/data-refresh.yml`. Context: `score.ts` rewrites
`data/generated/places.json` from `indicators-raw.json`, so any context field
whose raw input is missing in a clean CI checkout (`data/raw` is gitignored)
would silently vanish on the monthly refresh - the "2026-07-02 deletes
volunteerPct" timebomb.

## How the defuse works (three layers)

1. **Recompute in the chain.** `normalize.ts` mirrors the logic of every
   apply-* step EXCEPT `apply-civic.ts` (it reads the same raw files inline),
   and `build.ts` now runs `apply-civic.ts` directly after score, so every
   context field is recomputed fresh when its raw input exists.
2. **Carry-forward net.** `build.ts` snapshots places.json before score and
   re-merges (`scripts/preserve-context.ts` snapshot/merge ->
   `scripts/lib/context-merge.ts`) any context field that was populated before
   but is missing after the rebuild. Recomputed values always win; retire a
   field on purpose via `RETIRED_CONTEXT_KEYS` in preserve-context.ts.
3. **Coverage gate.** `scripts/verify-coverage-diff.ts` (in data-refresh.yml,
   before the auto-commit) diffs per-field populated counts of the rebuilt
   places.json against git HEAD and FAILS the run on any >2% drop or vanished
   field (`scripts/lib/coverage-diff.ts`; tolerance via `--max-drop-pct=` /
   `COVERAGE_MAX_DROP_PCT`).

## Apply step -> input -> fetch -> workflow

"In refresh workflow?" = does the monthly data-refresh.yml (re)produce the raw
input before `npm run data:build` runs. Mechanism legend:
**re-run** = input fetched monthly and the field recomputed by normalize (or,
for civic, by the build chain itself); **fetch-added** = fetch was missing from
the workflow and was added by this audit (2026-06-10); **carry-forward** =
layer 2 above is the only protection (none need it as primary after the adds;
it remains the net for transient fetch failures, where the coverage gate
tolerates <=2% drift and carry-forward fills the gap).

| Apply step | Raw input file(s) | Producing fetch script | In refresh workflow? | Mechanism |
|---|---|---|---|---|
| apply-density.ts (`context.population`) | data/raw/abs-sa2-erp.json | fetch-indicators.ts (inside `data:fetch`) | yes ("Fetch base upstream data") | re-run (normalize mirrors) |
| apply-social-housing.ts (`context.socialHousing`) | data/raw/abs-sa2-landlord.json | fetch-indicators.ts (inside `data:fetch`); standalone dup `data:social-housing` | yes (via `data:fetch`; the standalone script is redundant in CI) | re-run (normalize mirrors) |
| apply-housing-stress.ts (`context.housingStress`) | data/raw/abs-sa2-stress.json | fetch-indicators.ts (inside `data:fetch`); standalone dup `data:housing-stress` | yes (via `data:fetch`) | re-run (normalize mirrors) |
| apply-heritage.ts (`context.heritage`) | data/raw/vic-ho.geojson (+ sa2-melbourne.geojson) | fetch-heritage.ts (`data:heritage`) | yes | re-run (normalize mirrors) |
| apply-overlays.ts (`context.overlays`) | data/raw/vic-conservation-overlays.geojson | fetch-overlays.ts (`data:overlays`) | yes | re-run (normalize mirrors) |
| apply-sea-level.ts (`context.seaLevel`) | data/raw/vic-sea-level.geojson | fetch-sea-level.ts (`data:sea-level`) | yes | re-run (normalize mirrors) |
| apply-fire-history.ts (`context.fireHistory`) | data/raw/vic-fire-history.geojson | fetch-fire-history.ts (`data:fire-history`) | yes | re-run (normalize mirrors) |
| apply-vif.ts (`context.projections`) | data/raw/vif2023-sa2.xlsx (COMMITTED to git 2026-06-10 - static 2023 release) | fetch-vif.ts (`data:vif`; manual-only: planning.vic WAF now 403s CI runners even via the curl shim) | no - input committed | re-run from committed raw |
| apply-abs-approvals.ts (`context.developmentPipeline`) | data/raw/abs-sa2-approvals.json | fetch-abs-approvals.ts (`data:abs-approvals`) | yes | re-run (normalize mirrors) |
| apply-abs-qualifications.ts (`context.community.bachelorPlusPct/postgradPct`) | data/raw/abs-sa2-qualifications.json | fetch-abs-qualifications.ts (`data:abs-qualifications`; ABS Data API, undici + curl fallback) | yes - ADDED 2026-06-10 | fetch-added; carry-forward as net |
| apply-schools.ts (`context.schools`) | data/raw/vic-schools-by-sa2.json (+ sa2-melbourne.geojson) | fetch-schools.ts (`data:schools`; education.vic.gov.au CSV, undici + curl fallback; needs `data:fetch` first) | yes - ADDED 2026-06-10 | fetch-added; carry-forward as net |
| apply-walk-access.ts (`context.walkAccess`) | data/raw/osm-amenities.json, osm-health.json, osm-schools.json | fetch-indicators.ts (inside `data:fetch`) | yes | re-run (normalize mirrors) |
| apply-cyclability.ts (`context.cyclability`) | data/raw/osm-cycleways.json (+ sa2-melbourne.geojson) | fetch-indicators.ts (inside `data:fetch`) | yes | re-run (normalize mirrors) |
| apply-civic.ts (`context.community.volunteerPct`) | none - live ABS G23 ArcGIS query (fetch + apply in one) | self-contained | yes - runs inside `data:build` (build.ts step after score + merge) | re-run (in the build chain; the ONE apply normalize does not mirror) |

## Non-apply layers (for completeness)

- `data:hazards` (vic-bpa/lsio/sbo) is fetched INSIDE `data:build` (a build.ts
  step), so the refresh always has it.
- Committed `public/data/` layers (`data:school-zones`, `data:traffic`,
  `data:activity-centres`, `data:beach`, `data:electorate`,
  `data:future-transport`) persist in git across rebuilds; they are annual /
  manual refreshes by design (see the comment in data-refresh.yml) and are not
  touched by score.ts, so the timebomb class does not apply to them.
- POI extracts (`data:community-poi`, `data:ev-poi`, `data:aged-care`,
  `data:vic-facilities`, `data:noise`, `data:nuisance`, `data:stations`,
  `data:water-corp`, `data:epa-air`) are fetched in the workflow and consumed
  by normalize/build-poi the same run.

## Standing rules

- The standalone `apply-*.ts` scripts remain manual/one-off tools; the build
  chain relies on the normalize mirrors plus apply-civic. If you add a NEW
  apply step, either mirror it in normalize.ts or add it to build.ts, add its
  fetch to data-refresh.yml, and extend this table - the coverage gate will
  catch you if you forget, AFTER the first good commit of the new field.
- normalize.ts treats most raw inputs as OPTIONAL (`.catch(() => ...)`), so a
  missing file is a silent no-op - exactly why the coverage gate exists. Do
  not "fix" a gate failure by retiring the field; find the broken fetch.
