# Amenity data audit: 15-min walk access + cyclability

Date: 2026-06-11. Read-only investigation; no pipeline files changed.

## Verdict

**Needs category-mapping and fetch-shape fixes; a plain re-fetch will NOT help.**
The 1-Jun-2026 extracts are fresh (10 days old) and supermarket counts match a
live Overpass query exactly in all 5 test areas. The gaps are structural:

1. **Cafe/restaurant/fast_food, pharmacy and gym fetched as NODES only** -
   `scripts/fetch-indicators.ts` has no `way[...]` clause for
   `amenity~"pharmacy|cafe|restaurant|fast_food|gym"`. Building-mapped venues
   are invisible. Measured miss: **-45% cafes in Brighton, -21% in Fitzroy**.
2. **`amenity=childcare` fetched but discarded** - the extract contains 380
   childcare elements, but `scripts/normalize.ts` (line 448) and
   `scripts/apply-walk-access.ts` (line 75) count only
   `t.amenity === "kindergarten"`. Measured miss: **-100% childcare in
   Tarneit - Central, -67% in Box Hill**. This flips the "reachable" coverage
   bit and depresses `walkabilityIndex` (70% of the index is coverage).
3. **Relations never fetched** (no `relation[...]`/`nwr` clauses anywhere).
   Large schools mapped as multipolygon relations are missed: **Brighton shows
   1 school vs 4 live (-75%)**; Fitzroy misses 2 school relations. Parks lose
   ~1 relation per area (-3% to -22%).
4. **GP filter slightly narrow** - `/doctors|clinic/.test(t.amenity)` drops
   `healthcare=doctor|clinic` elements without an `amenity` tag: 16 metro-wide
   (CBD -12%). Minor.
5. **Cyclability is sound** - our way selectors capture 781 of 820 (95%) of
   cycle-infrastructure ways in a live Fitzroy probe; the missing 5% are
   `bicycle=designated` on `highway=track|pedestrian|service` and
   `opposite_*`/`share_busway` values on `cycleway:left/right/both`
   (which `lib/cyclability.ts#classifyCycleway` already accepts but the fetch
   never retrieves). Low priority.

## Method

- Read the computation path: `scripts/fetch-indicators.ts` (Overpass extracts)
  -> `scripts/normalize.ts` / `scripts/apply-walk-access.ts` (classify + count
  within straight-line 1.2 km of the SA2 centroid via
  `scripts/lib/proximity.ts#countWithinKm`) -> `lib/walk-access.ts`
  (`classifyOsmAmenity`, `summariseWalkAccess`). Cyclability:
  `lib/cyclability.ts` + `scripts/apply-cyclability.ts`.
- Took our shipped per-SA2 counts from `data/generated/places.json`
  (`context.walkAccess.categories`).
- For 5 spread SA2s, ran live Overpass count queries (overpass-api.de, one
  polite request per area, 4 s apart) with `around:1200` of the same centroid,
  same tag semantics but all element types (`nwr`), plus `healthcare=pharmacy`
  / `healthcare~doctor|clinic|general_practitioner` for the health categories.
- Cross-checked causes against the local raw extracts
  (`data/raw/osm-amenities.json`, `osm-schools.json`, `osm-health.json`,
  all fetched 2026-06-01) by counting element types per category.

Caveat: live counts are 10 days newer than the extracts, so 1-2 element drift
per cell is expected noise. Gaps quoted as causes were verified by element-type
breakdown, not just totals.

## Results: ours vs live Overpass (radius 1.2 km from SA2 centroid)

| SA2 | Category | Ours | Live | Gap | Likely cause |
|---|---|---:|---:|---:|---|
| Melbourne CBD - East (206041503) | supermarket | 82 | 82 | 0% | - |
| | pharmacy | 31 | 31 | 0% | - |
| | GP/clinic | 15 | 17 | -12% | healthcare-only tags + 1 way dropped by amenity filter |
| | school | 3 | 3 | 0% | - |
| | childcare | 3 | 4 | -25% | amenity=childcare discarded |
| | cafe/restaurant | 1096 | 1110 | -1% | 10 way-mapped venues not fetched |
| | park | 190 | 197 | -4% | 1 relation + drift |
| Fitzroy (206071142) | supermarket | 42 | 42 | 0% | - |
| | pharmacy | 11 | 12 | -8% | 1 way-mapped pharmacy not fetched |
| | GP/clinic | 16 | 16 | 0% | - |
| | school | 12 | 15 | -20% | 2 school relations not fetched |
| | childcare | 10 | 11 | -9% | amenity=childcare discarded |
| | cafe/restaurant | 269 | 342 | **-21%** | 69 way-mapped venues not fetched |
| | park | 132 | 138 | -4% | 1 relation + drift |
| Box Hill (207031163) | supermarket | 8 | 8 | 0% | - |
| | pharmacy | 4 | 4 | 0% | - |
| | GP/clinic | 2 | 2 | 0% | - |
| | school | 3 | 3 | 0% | - |
| | childcare | 1 | 3 | **-67%** | live split: 1 kindergarten + 2 childcare; childcare discarded |
| | cafe/restaurant | 9 | 9 | 0% | - |
| | park | 14 | 18 | -22% | 1 relation + way drift |
| Brighton (Vic.) (208011169) | supermarket | 6 | 6 | 0% | - |
| | pharmacy | 2 | 3 | -33% | 1 way-mapped pharmacy not fetched |
| | GP/clinic | 1 | 1 | 0% | - |
| | school | 1 | 4 | **-75%** | 3 school relations (large independents) not fetched |
| | childcare | 0 | 0 | 0% | - |
| | cafe/restaurant | 23 | 42 | **-45%** | 19 way-mapped venues not fetched |
| | park | 24 | 24 | 0% | - |
| Tarneit - Central (213051583) | supermarket | 8 | 8 | 0% | - |
| | pharmacy | 1 | 1 | 0% | - |
| | GP/clinic | 1 | 1 | 0% | - |
| | school | 3 | 3 | 0% | - |
| | childcare | 0 | 2 | **-100%** | live split: 0 kindergarten + 2 childcare; childcare discarded |
| | cafe/restaurant | 7 | 7 | 0% | - |
| | park | 33 | 39 | -15% | 1 relation + way drift |

Element-type evidence from the local extracts (Greater Melbourne totals):

- `osm-amenities.json`: cafe/restaurant/fast_food = 7838 nodes, **1 way**;
  pharmacy/chemist = 598 nodes, **0 ways**; supermarket = 1542 nodes + 996
  ways (which is why supermarkets match perfectly); park = 15786 ways,
  **0 relations**.
- `osm-schools.json`: school = 15 nodes + 1511 ways, **0 relations**;
  kindergarten = 817 elements counted; **childcare = 380 elements fetched
  then discarded by the kindergarten-only filter**; preschool = 0.
- `osm-health.json`: 1097 GP/clinic elements kept; 16 healthcare-tag-only
  elements dropped by the amenity-only filter.

Cyclability live probe (Fitzroy, 1.2 km): our fetch selectors match 781 ways,
broader selectors (adding `bicycle=designated` on track/pedestrian/service and
`opposite_*`/`share_busway` on `cycleway:left/right/both`) match 820 -> 95%
coverage. No live length comparison run; selector coverage is the bound.

## Recommended fixes (pipeline, in priority order)

All in `scripts/fetch-indicators.ts` unless noted. NOTE: scripts/ is owned by
a concurrent crime-data fix right now - apply after that lands.

1. **Add `way[...]` clauses for pharmacy/cafe/restaurant/fast_food/gym and
   `shop=chemist`** in the everyday-amenities Overpass block (mirror the
   supermarket pattern; `out center` already handles way centroids).
   Biggest user-visible gap (cafes -21% to -45% in shopping-strip suburbs).
2. **Count `amenity=childcare`** in `scripts/normalize.ts:448` and
   `scripts/apply-walk-access.ts:75`: change
   `t.amenity === "kindergarten"` to `/^(kindergarten|childcare|preschool)$/`.
   Zero re-fetch needed - the data is already in the extract. Fixes false
   "no childcare within 15 min" in growth suburbs (Tarneit) and lifts their
   walkabilityIndex coverage term.
3. **Switch school/park/amenity blocks to `nwr[...]`** (or add
   `relation[...]` clauses) so multipolygon schools and parks are fetched;
   `out center` yields a representative point for relations too. Fixes
   Brighton-style -75% school undercounts.
4. Broaden the GP filter to also accept
   `healthcare~"^(doctor|general_practitioner|clinic)$"` when `amenity` is
   absent (16 elements metro-wide; cheap while touching the same lines).
5. (Low) Extend the cycleway fetch with `bicycle=designated` on
   `highway~"^(track|pedestrian|service)$"` and the `opposite_*`/`share_busway`
   values on `cycleway:left/right/both` - `classifyCycleway` already accepts
   them, only the fetch is narrower (~5% of ways).
6. After fixes: re-run `data:fetch` -> `apply-walk-access` -> `data:geo` ->
   `data:poi`, and spot-check Brighton schools (expect 4) and Tarneit
   childcare (expect 2) against this table.

Not recommended: switching to vic-facilities as the primary source for these
categories - the structural OSM gaps above explain the observed misses, and
supermarket parity shows the distance/centroid method itself is correct.
