# Plan 007 — F2: SA1 + SEIFA-at-SA1 pocket granularity (separate ASGS2021 artifact)

Status: READY (Fable-designed via workflow waqpkyh2q, ground-truthed against the repo). Executor: Codex. Gate: Fable.
Drift SHA: master @ 6a0bb99 (post F1 + water-card removal).

## Why
Add within-suburb (SA1) pocket granularity as a **wholly separate, lazily-loaded** artifact family (`pockets.{region}.json`), pinned to ABS ASGS Edition 3 (2021), with SEIFA-at-SA1 as context/display-only — **without changing a single byte** of the SA2 artifacts (`places.json`, `sources.json`) or coupling to F1. Unlocks W23 (pocket granularity) and the SA1 half of W24.

## Ground truth (verified — do not re-litigate)
1. `scripts/fetch.ts:30-52` = 3 `fetchAbsGeoJson` calls (SA2 by GCCSA_CODE_2021, SAL/LGA by STATE_CODE_2021), no SA1. `data:fetch` is a MANUAL prerequisite, NOT in `scripts/build.ts`.
2. `scripts/lib/abs-geo.ts:3` hardcodes `ABS_BASE=.../ASGS2021` (the Ed.3 pin); paginates 2000/page; 403/429 backoff 30/90/180s — reuse AS-IS.
3. `pipeline-region.ts:89-91` `sa2RawName` uses `region.id`; sal/lga use `stateSlug`.
4. `build-geo.ts:41-74,89-91` = the bloat surface (byte-copies places.json + inlines props) — NEVER touch.
5. `normalize.ts:219-227` = the SA2 SEIFA loop keyed on `sa2_code_2021` mutating `p.irsadDecile/irsdDecile` — **the single highest byte-identity risk; must NOT be reused for SA1**.
6. `lib/places-data.ts:16-34,45-61` = per-region promise cache + HEAD-probe loader to clone.
7. `lib/regions.ts:351-363` `regionDataFile` keeps melbourne's bare name (so `pockets.json` for melbourne, `pockets.{region}.json` otherwise).
8. `lib/types.ts:241-247` `PlaceContext.equity` is the shape to mirror; `Place` (313-325) must NOT gain SA1 fields.
9. `scripts/hash-sources.ts` owns sources.json — must not be touched. `xlsx`+`csv-parse` already deps.

**SA2→SA1 nesting is a pure column-prefix relation: `parent sa2Code = sa1Code.slice(0,9)`** — no crosswalk, no turf geometry. Default ships ZERO SA1 geometry (Approach A: attribute-only join to already-loaded SA2 geometry). Trip-wires: a build-time `gzip<=100KB` assertion + an `ASGS_EDITION='2021'` constant + a `prefix===sa2Code` assertion against existing places.json.

## Steps (each with its gate)

1. **Pin constant + SA1 raw filename + SA1 code loader.** `abs-geo.ts`: add `export const ASGS_EDITION = '2021' as const;` (document that ABS_BASE already pins Ed.3; Ed.4 [22 Jul 2026] is a separate future migration — do NOT parameterize ABS_BASE). `pipeline-region.ts`: add `export function sa1RawName(region = PIPELINE_REGION) { return \`sa1-${region.id}.geojson\`; }` beside sa2RawName (region.id, NOT stateSlug). `melbourne-sa2-codes.ts`: add `loadSa1Codes` mirroring loadSa2Codes (getProp(['SA1_CODE_2021','sa1_code_2021'])).
   - Gate: typecheck; `git diff --exit-code data/generated/places.json data/generated/sources.json` clean.
2. **SA1 boundary fetch** as a 4th `fetchAbsGeoJson` in `fetch.ts`, mirroring the SA2 call. PRIMARY: layerPath `SA1/FeatureServer/0`, where=`GCCSA_CODE_2021='${region.gccsa}'`, outFields `SA1_CODE_2021,SA2_CODE_2021,GCCSA_CODE_2021`; `saveJson(sa1RawName(region), sa1)` after the sa2/sal/lga saves; add to the import + count log. FALLBACK if GCCSA isn't queryable on the SA1 FeatureServer: chunk `SA2_CODE_2021 IN (...)` at ≤200 codes via inClause (loadSa2Codes first). Reuse abs-geo AS-IS. Do NOT add SA1 to build.ts.
   - Gate: `npm run data:fetch` produces `data/raw/sa1-melbourne.geojson` (several-thousand features, each with 11-digit SA1_CODE_2021 + 9-digit SA2_CODE_2021); spot-check `sa1Code.slice(0,9)===SA2_CODE_2021`. typecheck; places/sources byte-unchanged.
3. **SEIFA-at-SA1 loader** → NEW raw file consumed ONLY by build-pockets. `scripts/fetch-seifa-sa1.ts`: download the national SEIFA 2021 SA1 indexes xlsx (cat 2033.0.55.001, ~23MB; hard-code the edition/2021/SA1_2021 URL tokens), parse with `xlsx`, keep ONLY `{sa1Code, irsadDecile, irsdDecile}`, carry **nulls** for suppressed low/zero-pop SA1s (blank → null, NEVER 0), write `data/raw/abs-seifa-sa1-2021.json`. Register `data:seifa-sa1`. **CRITICAL: do NOT touch normalize.ts:219-227 or its `byCode<sa2Code>` map.** Cache the download (skip if raw exists).
   - Gate: `npm run data:seifa-sa1` writes the file keyed by 11-digit codes, nulls for suppressed, no 0-deciles. typecheck; places/sources byte-unchanged.
4. **New `Pocket`/`PocketsFile` types** in `lib/types.ts` as a SIBLING pair — NEVER fields on Place. `PocketSeifa = {irsadDecile:number|null; irsdDecile:number|null; sourceId:'abs-seifa-sa1-2021'; period:'2021'}`; `Pocket = {sa1Code; sa2Code; centroid:[number,number]; population:number|null; seifa:PocketSeifa; withinSa2Rank?; medianRentWeekly?; renterPct?; apartmentPct?}`; `PocketsFile = {generatedAt; asgsEdition:'2021'; region:RegionId; pockets:Pocket[]}`.
   - Gate: typecheck; Place type byte-unchanged in the diff (additive only); places/sources byte-unchanged.
5. **`scripts/build-pockets.ts`** modeled on build-geo.ts but writing a WHOLLY NEW file. (1) read `sa1-{region}.geojson`; (2) read places.json → `Set<sa2Code>` of valid parents; (3) read `abs-seifa-sa1-2021.json` → `Map<sa1Code,{irsadDecile,irsdDecile}>`; (4) per SA1: `sa2Code=sa1Code.slice(0,9)`, ASSERT it matches both the feature's SA2_CODE_2021 AND an existing places.json sa2Code (fail loud — the Ed.4 trip-wire); centroid via turf; attach seifa (nulls passthrough); (5) group by parent sa2Code, compute `withinSa2Rank` = percentile of this SA1's irsad vs OTHER SA1s in the SAME sa2Code (fully OUTSIDE score-places.ts); (6) write `{generatedAt, asgsEdition:ASGS_EDITION, region, pockets}` to `generatedOutPath('pockets.json')` AND `publicOutPath('pockets.json')`. ZERO SA1 geometry. **Build-time SIZE ASSERTION: gzip the output, throw if >100*1024 bytes.** NEVER read/write places.json/places.geojson/sources.json. Register `data:pockets`.
   - Gate: `npm run data:pockets` writes both pockets.json; gzip<100KB; prefix assertion passes; every pocket `sa2Code===sa1Code.slice(0,9)`. `git diff --exit-code` clean on places.json/places.geojson/sources.json (gen+public). typecheck.
6. **Wire `data:pockets` into build.ts with a warn-and-skip gate.** `const HAS_SA1 = existsSync(path.join(RAW, sa1RawName()));` (mirror HAS_GTFS/HAS_HAZARDS); insert `...(HAS_SA1 ? ['npm run data:pockets'] : [])` AFTER `npm run data:geo`. Must NOT run data:fetch; must NOT crash a stale-checkout rebake (skips when sa1 raw absent). Do NOT add data:seifa-sa1 to build.ts (build-pockets warn-and-skips the SEIFA join if its raw is absent → null seifa).
   - Gate: full `npm run data:build` (melbourne, sa1 raw present) runs data:pockets; a second run with sa1 raw removed SKIPS it without error. AFTER full build: `git diff --exit-code` clean on all SA2 artifacts (gen+public). typecheck.
7. **Lazy frontend loader `lib/pockets-data.ts`** modeled on places-data.ts. `loadPockets(region): Promise<Map<sa2Code, Pocket[]>>` — fetch `withBase(dataPath(region,'pockets.json'))`, 404-tolerant (empty Map), per-region promise cache, group by sa2Code client-side. Add `__resetPocketsDataCachesForTests()`. Fetched LAZILY only on SA2 drill-in (onPlaceSelect/onPinDrop → buyer report). Do NOT register an always-on map source; do NOT alter the eager map load.
   - Gate: typecheck; MelbourneMap.tsx eager path unchanged (no new addSource at load); places/sources byte-unchanged.
8. **`tests/pockets.test.ts`**: (a) schema — every Pocket `sa2Code===sa1Code.slice(0,9)`, seifa.sourceId/period correct, deciles number|null (never 0-as-suppressed), PocketsFile.asgsEdition==='2021'; (b) nesting/assertion — a fixture SA1 whose prefix matches no places.json sa2Code makes build-pockets throw; (c) within-rank — computed within parent only; (d) edition-pin — `ASGS_EDITION==='2021'`; (e) loader — loadPockets returns the grouped Map, 404-tolerant, cached per region.
   - Gate: full vitest green incl the new suite; lint clean; typecheck; SA2 artifacts byte-unchanged.

## Done criteria
- typecheck + lint + full vitest green (incl tests/pockets.test.ts).
- `git diff --exit-code` returns 0 for data/generated/{places,sources}.json AND public/data/{places.json,places.geojson,sources.json} AFTER a full melbourne `data:build` with SA1 raw present.
- A pockets artifact exists (public/data/pockets.json) passing the schema test; ASGS_EDITION='2021' exported + stamped + asserted; gzip(pockets.json)<100KB enforced by a build-time assertion; the prefix==sa2Code trip-wire asserted + tested.
- `data:pockets` gated on `sa1-{region}.geojson` existing (warn-and-skip) so a stale-checkout rebake doesn't crash.

## Scope boundaries (hard)
- NO change to SA2 artifacts (places.json/geojson, sources.json — gen + public) byte-for-byte. No SA1/pocket field on Place; do NOT touch build-geo.ts at all.
- NO reuse of the SA2 SEIFA loop (normalize.ts:219-227) or its byCode map; SA1 SEIFA flows through the new loader → new raw file → build-pockets only. Never truncate SA1 codes into the SA2 map.
- NO F1 coupling: do not touch sources.json, hash-sources.ts, the registry, crosswalk. Record SA1/SEIFA-SA1 provenance only in F2's own path (CC BY 4.0, ABS ASGS Ed.3 2021 / SEIFA 2021).
- NO geometry shipped by default (Approach A). Approach B (geometry shards) DEFERRED. Mesh Blocks OUT (217MB). SA1 is the floor.
- Ed.4 (22 Jul 2026) DEFERRED: hard-code Ed.3/2021/SA1_2021 tokens; never an in-place overwrite.
- NO frontend behavior change beyond the opt-in pockets fetch behind the existing drill-in. Default session downloads zero pocket bytes.
- Pockets are CONTEXT/display-only: SA1 SEIFA + withinSa2Rank never enter domains/percentiles/weights/dataConfidence/score-places.ts.
- data:fetch + data:seifa-sa1 stay MANUAL prerequisites — NOT in build.ts.

## STOP conditions
- If any SA2 artifact (places/sources, gen or public) shows a byte diff after a build, STOP and report — that's a byte-identity leak.
- If the SA1 FeatureServer rejects the GCCSA filter, switch to the IN-clause fallback (step 2) and report.
- If gzip(pockets.json) exceeds 100KB, STOP — do not ship; the attribute-only design is being violated.
- If any single step exceeds ~15 min, stop and report.
