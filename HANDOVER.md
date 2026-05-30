# Handover — Melbourne Liveability MVP

**Workflow:** Composer 2.5 implements; Opus reviews at each DoD. Plan of record is `ULTRAPLAN.md`.

**Last updated:** 2026-05-30 (cyclability context layer shipped; hazard-overlay intersect in `normalize` fixed — `data:build` now completes here; product reframed as data-compilation, not a scoring engine).

---

## Product framing (authoritative)
This is a **data-access / compilation tool, not a scoring engine** (see ULTRAPLAN top). The mission is compiling open data into an accessible, honest website. **New metrics are added as context — display panels + optional map layers — never folded into the scored composite, weights, or Data Confidence scoring.** The scored composite stays the locked v1 set.

## Status: v1.x product SHIPPED + reviewed

Seven scored domains (weights 30/18/14/14/8/8/8), context panels, persona presets, sitemap,
**Data Confidence layer/report card**, **auto-refresh** (CI cron + freshness probe).

| Area | State |
|------|-------|
| Transport | PTV GTFS precompute (`data:gtfs`) |
| Crime | VCSA Table 03 + crosswalk |
| Health | Vic MapShare hospitals + OSM GP (NDIS not scored) |
| Income | ABS DHI + Census 2016 labour |
| Hazards | Vic planning BPA + flood overlays (`data:hazards`) |
| Education | OSM schools 2 km + ABS preschool enrolment |
| Context | SEIFA, tenure/dwelling, First Nations % (display-only) |
| 15-min access | OSM everyday amenities ≤1.2 km of SA2 centroid — context only (`data:fetch`→`osm-amenities.json`) |
| Cyclability | OSM cycle infrastructure (cycleways + on-road lanes + designated paths) length/km² per SA2 — context only (`data:fetch`→`osm-cycleways.json`) |
| UI | Persona presets, `ContextPanels`, `WalkAccessPanel`, `CyclabilityPanel`, `app/sitemap.ts`, OG metadata |

### 15-minute access (context, never scored) — NEW
Inspired by Melbourne's 20-minute neighbourhood + Paris's 15-minute city. Per SA2 we count, within ~1.2 km straight-line of the population-weighted centroid, how many of **8 everyday categories** are reachable (supermarket, pharmacy, GP, school, childcare, park, cafe/restaurant, gym/leisure) + a coarse walkability index (coverage + density). Stored on `place.context.walkAccess`.
- **Pure logic + categories:** `lib/walk-access.ts` (`WALK_THRESHOLD_KM`, `WALK_CATEGORIES`, `classifyOsmAmenity`, `summariseWalkAccess`) — unit-tested in `tests/walk-access.test.ts`.
- **Pipeline:** new Overpass query in `scripts/fetch-indicators.ts` → `data/raw/osm-amenities.json`; computed in `scripts/normalize.ts`; passed through `scripts/score.ts`; `pct_walkaccess` emitted in `scripts/build-geo.ts`; amenity pins added in `scripts/build-poi.ts`.
- **Fast re-apply path:** `npm run data:walkaccess` (`scripts/apply-walk-access.ts`) enriches an already-built `places.json` with `context.walkAccess` using the same shared helpers, then run `data:geo` + `data:poi`. A full `data:build` produces the identical field via `normalize` (the hazard-overlay intersect that used to make `data:build` unable to finish here is now fixed — see "Hazard-overlay perf fix" below).
- **UI:** `components/WalkAccessPanel.tsx` on profiles; map context toggle "15-min walk access" (`pct_walkaccess`) mutually exclusive with Data confidence (`MelbourneMap`/`LayerToggle`/`use-map-personalisation`).
- **Source:** `osm-amenities` (OSM, ODbL) added to `sources.json` + `hash-sources.ts` + `source-refresh.ts`.
- **Caveat (documented):** straight-line not street-network distance (overstates access); OSM coverage community-maintained/uneven. Context only — never in the composite or weights.

### Cyclability index (context, never scored) — NEW ✅
Per SA2 we compile the total length of OSM cycling infrastructure — dedicated cycleways (`highway=cycleway`), on-road bike lanes (`cycleway=*` / `cycleway:left|right|both`) and bicycle-designated paths (`bicycle=designated`) — whose midpoint falls in the SA2, divided by SA2 land area → a cycle-infrastructure **density** (km/km²) and a coarse saturating **0–100 index**. Stored on `place.context.cyclability`. (Sanity: top SA2s are Brunswick/Coburg/Northcote/Flemington — Melbourne's real inner-north "bike belt".)
- **Pure logic + classification:** `lib/cyclability.ts` (`CYCLABILITY_SATURATION_KM_PER_KM2`, `classifyCycleway`, `summariseCyclability`) — unit-tested in `tests/cyclability.test.ts`.
- **Aggregation helper:** `scripts/lib/cyclability-compute.ts` (RBush of SA2 bboxes + `booleanPointInPolygon` on each way's midpoint; `out geom` lengths via turf).
- **Pipeline:** new Overpass query in `scripts/fetch-indicators.ts` (`out geom`) → `data/raw/osm-cycleways.json`; computed in `scripts/normalize.ts`; flows through `score.ts` via `place.context`; `pct_cyclability` emitted in `scripts/build-geo.ts`.
- **Fast re-apply path:** `npm run data:cyclability` (`scripts/apply-cyclability.ts`) enriches an already-built `places.json`, then run `data:geo`.
- **UI:** `components/CyclabilityPanel.tsx` on profiles; map context toggle "Cyclability" (`pct_cyclability`) mutually exclusive with Data confidence + 15-min walk access.
- **Source:** `osm-cycleways` (OSM, ODbL) added to `sources.json` + `hash-sources.ts` + `source-refresh.ts`.
- **Caveat (documented):** infrastructure *density*, not a safety/comfort/connectivity rating; separated paths and painted on-road lanes counted equally; a trail crossing two SA2s is attributed to the SA2 holding its midpoint; bbox capped to Greater Melbourne; OSM coverage uneven. Context only — never in the composite or weights.

### Hazard-overlay perf fix (2026-05-30)
`scripts/normalize.ts`'s hazard step (`scripts/lib/sa2-overlay-pct.ts`) used to run `turf.intersect` of each SA2 directly against the raw Vic planning overlays. The Bushfire-Prone-Area layer is only ~29 features but they are continent-scale multipolygons (100k+ vertices), so each SA2 took ~7 s and the full pass effectively never finished (then the 105 MB flood overlay ballooned memory to ~3 GB and exited without writing output). **Fix:** before the heavy intersect we now `turf.bboxClip` each candidate to the SA2 bounding box (linear, turns a giant polygon into a small local piece) and **sanitise** the clip (drop degenerate <4-point rings that Sutherland–Hodgman emits, which previously made `turf.intersect` throw and silently zero the result). Because an SA2 is a subset of its own bbox, this is **exact** — verified against the previously committed values (Werribee – South: bushfire `39.76750199829023`, flood `0.000014291268727621335`, both bit-for-bit identical). Result: hazard step ~3 min, peak ~2 GB, `data:build` completes.

### Commands
```bash
npm run data:fetch      # boundaries + indicators (incl. SEIFA, schools, community)
npm run data:gtfs       # PTV transport precompute
npm run data:hazards    # Vic planning overlays (slow; paginated ArcGIS)
npm run data:normalize && npm run data:score && npm run data:geo && npm run data:poi && npm run data:hash
# or: npm run data:build    (crosswalk→gtfs→hazards→normalize→score→geo→poi→hash)
npm run data:all          # data:fetch + data:build (used by CI auto-refresh)
npm run data:freshness    # probe upstream last-updated vs cadence → data/generated/freshness.json
npm test && npm run build
```

### Data Confidence (context, never scored)
- Computed in `scripts/score.ts` (`computeDataConfidence`) from coverage + completeness + freshness + method confidence → `place.dataConfidence`.
- UI: map toggle "Data confidence" (`pct_confidence` in geojson) + `components/DataConfidenceCard.tsx` on profile.
- Verified: confidence is ~uniform across SA2 and does NOT correlate with income/SEIFA (r≈0) — a transparency feature, not a ranking input.

### Auto-refresh
- `scripts/lib/source-refresh.ts` (cadence + ArcGIS/CKAN probes) + `scripts/check-freshness.ts`.
- `scripts/hash-sources.ts` stamps `fetchedAt` when a raw file's sha256 changes (drift detection).
- `.github/workflows/data-refresh.yml` — monthly cron: `data:all` → test → build → commit changed `data/generated/*` + `public/data/*` (commit triggers redeploy). **Note: repo not yet `git init`-ed locally — user will set git later.**

### Opus review fixes from v1.0 (do NOT redo)
- Honest `sourceId`s, no fabricated `amPeakFreq`/NDIS when data missing.
- `Attribution.tsx`, `SourceDrawer`, methodology caveats.

### Caveats (methodology)
- Hazards = regulatory overlays, not probabilistic risk.
- Crime suburb→SA2 crosswalk; labour 2016 vs income/rent 2021.
- OSM schools/GP are community-maintained.

---

## Conventions
- ABS ArcGIS: `scripts/lib/arcgis-fetch.ts` (batch SA2 codes).
- Hazard intersection: `scripts/lib/sa2-overlay-pct.ts` (RBush + turf.intersect).
- Commit `public/data/*` and `data/generated/{sources,freshness}.json` after pipeline runs.

## Phase A engagement (ULTRAPLAN §12) ✅
- `lib/user-prefs.ts` — shortlist, recent views, weights, persona, interest view (localStorage).
- `lib/interest-views.ts` — Balanced / Renting / Education / Data quality.
- `lib/share-url.ts` + `ShareViewButton` — share map & compare links.
- Map: shortlist panel, recently viewed, interest views, copy link, `/alerts` nav.
- `/alerts` — email signup (Formspree env optional); `/compare` reads `?list=` + saved weights.
- Profile: `ProfileEngagement` (shortlist + recent view).

## Roadmap — next (ULTRAPLAN §12)
Phase B/C still **not built** (accounts, paid tier, B2B reports). Optional: `NEXT_PUBLIC_FORMSPREE_ALERTS_ID`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
