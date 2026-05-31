# Handover — Melbourne Liveability MVP

**Workflow:** Composer 2.5 implements; Opus reviews at each DoD. Plan of record is `ULTRAPLAN.md`.

**Last updated:** 2026-05-31 (warm-editorial redesign SHIPPED + live; three follow-up features committed locally pending review; session paused for a machine restart).

---

## ⏪ SESSION HANDOVER — resume here (2026-05-31)

**Why paused:** owner restarting the computer. No background task was running at pause time (all worker subagents had completed; only an idle shell open).

### What's LIVE (pushed to `master` → GitHub Pages)
- **Warm-editorial redesign (Theme A)** — commit `817f4b1`. Deploy verified green; site returns 200 at https://rafaelvonhellmann.github.io/melbourne-liveability/ . Coral `#D97757` accent, cream surfaces, Fraunces+Inter, YlGnBu data palette; Map-home split panel (results⇄profile), blended Simple/Comprehensive profile, Compare columns table.

### What's COMMITTED LOCALLY but NOT pushed (awaiting owner review)
A single WIP commit holds three features (gate was green: typecheck/lint/build, 34 tests):
1. **POI pins** — all OFF by default; per-category toggle + colour swatches; categorical palette in `lib/poi-categories.ts` (separate from YlGnBu). `MelbourneMap`/`LayerToggle`/`MapLegend` updated.
2. **Data area vs geographic area** — `lib/data-coverage.ts` + `DataCoverageCard` on profile (per-domain real aggregation level, measured/missing, stale, low/no-data); map no-data `#d9d6cf` + legend wording.
3. **Home buyer index** (context lens, NOT scored) — `lib/home-buyer.ts` (affordability/cost-pressure .28, safety .18, schools .16, transport .14, low-hazards .14, walk .10), `HomeBuyerCard`, new "Home buyer" interest view. Caveat: NO sale-price data.

**To resume:** review the WIP commit (`git show HEAD`). If good → `git push origin master` (auto-deploys). To tweak (e.g. home-buyer weights) → edit then `git commit --amend` or a new commit; or unstage with `git reset --soft HEAD~1`.

### OPEN ITEMS / TODO next session
- **BLOCKED — `analisa_pt_information_architecture.md` is missing from the repo.** Owner intended to add the Lisboa municipality-drawer extraction (drawer header, horizontal tab inventory, metric-card anatomy, tab-by-tab data for Visão geral/Nómada/Segurança/Habitação/Saúde/Ambiente/Economia/Lazer/Infraestrutura/Demografia/Educação/Turismo/Proteção Social/Compostos, + "Municipality Drawer Pattern To Reuse For Melbourne"). File never landed in this folder. **Next session: get the file, TRANSLATE everything PT→EN, then adapt the drawer pattern (left-side municipality drawer with horizontal category tabs) to the Melbourne profile UX.**
- Decide whether to push the 3 WIP features (and any weight tweaks to the home-buyer index / pin colours).
- Optional: connect **Vercel** (`vercel login` + `vercel --prod`) — still pending owner interactive auth.

---

## Deployment status (LIVE)

- **Repo:** https://github.com/rafaelvonhellmann/melbourne-liveability (public, `master`).
- **Live site (GitHub Pages):** https://rafaelvonhellmann.github.io/melbourne-liveability/ — auto-deploys on push to `master` via `.github/workflows/deploy-pages.yml` (builds with `NEXT_PUBLIC_BASE_PATH=/melbourne-liveability`). Verified: home, `/data/*.json`, place pages, compare, methodology all 200.
- **Vercel (not yet connected — needs owner's interactive auth):** run `vercel login` then `vercel --prod` (root hosting, leave `NEXT_PUBLIC_BASE_PATH` unset), or import the repo at vercel.com/new. `vercel.json` is ready.
- **Runtime asset paths** are base-path-aware via `lib/asset-path.ts` (`withBase`), so the same codebase serves correctly at a sub-path (Pages) and at root (Vercel/local).
- **Known minor:** deep links with a trailing slash (e.g. `/places/<slug>/`) 404 on Pages; the canonical no-slash form (what `<Link>`/sitemap emit) works. Set `trailingSlash: true` if directory-form URLs are ever needed.

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

### POI pins: off by default + categorical colour-coding — NEW
Pins were polluting the map (several categories on by default, all one colour). Now:
- **All pin categories OFF by default** — `visiblePins` starts `{}` in `app/(map)/page.tsx`; pins appear only when the user ticks a category.
- **Colour-coded by category** via a distinct **categorical** palette in `lib/poi-categories.ts` (`POI_CATEGORIES`, `poiCircleColorExpression()`) — qualitative ColorBrewer Dark2/Set1-derived hues, deliberately **separate from the YlGnBu data ramp** (which stays reserved for the choropleth). 10 categories present in `pois.geojson`: hospital, gp, pharmacy, police, school, childcare, supermarket, park, gym_leisure, cafe_restaurant.
- **Map:** `MelbourneMap` paints `poi-circles` `circle-color` from the `match`/`get` expression and filters by the set of enabled categories (single source, decoupled from the active choropleth domain). White halo stroke for legibility.
- **UI:** `LayerToggle` has a dedicated "Pins" section — per-category checkbox + colour swatch, an empty-state hint, and a Clear (n) control (`onClearPins`). `MapLegend` shows a colour key for the currently-enabled pins and clarifies the no-data swatch ("No / low resident data").

### Data coverage vs drawn geography (transparency, not a score) — NEW
Makes the "we care about the DATA area, not just the drawn SA2" point explicit and honest, using existing fields only.
- **Pure logic:** `lib/data-coverage.ts` (`buildDataCoverage`, `DOMAIN_GRANULARITY`) — derives per-domain real granularity/aggregation notes, measured vs missing counts, stale flags, the `nonResidential` low/no-data flag, and the overall data-confidence tier from `place` fields.
- **UI:** `components/DataCoverageCard.tsx` on the profile (comprehensive view, alongside the other transparency cards; surfaced in the simple-mode prompt too). Introduces **no new numbers**; never affects rank.
- **Map:** low/no-resident-data SA2s already render in `NO_DATA_COLOR` (`#d9d6cf`) via `choroplethFillColorByProp`; legend wording clarified.

### Home buyer index (context lens, never scored) — NEW
- **Pure logic + test:** `lib/home-buyer.ts` (`HOME_BUYER_FACTORS`, `computeHomeBuyerIndex`, `rankHomeBuyerPercentiles`) — unit-tested in `tests/home-buyer.test.ts`. Blends EXISTING indicators (affordability/cost-pressure 28, safety 18, education 16, transport 14, low-hazards 14, walk access 10) into a 0–100 composite; present-weight renormalisation handles missing factors; ranked to a Greater-Melbourne percentile. **No dwelling sale-price data** — affordability is the rent-to-income cost-pressure proxy. Derived client/server-side from existing `place` fields → **no data rebuild**.
- **UI:** `components/HomeBuyerCard.tsx` on the profile (GM percentile passed from `app/places/[slug]/page.tsx` via `rankHomeBuyerPercentiles`); new **"Home buyer"** interest view in `lib/interest-views.ts` tilts the map weights.
- **Caveat (documented):** context lens, not part of the locked 7-domain composite/weights/Data Confidence; not a price/value/growth estimate.

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
- `lib/interest-views.ts` — Balanced / Renting / Home buyer / Education / Data quality.
- `lib/share-url.ts` + `ShareViewButton` — share map & compare links.
- Map: shortlist panel, recently viewed, interest views, copy link, `/alerts` nav.
- `/alerts` — email signup (Formspree env optional); `/compare` reads `?list=` + saved weights.
- Profile: `ProfileEngagement` (shortlist + recent view).

## Roadmap — next (ULTRAPLAN §12)
Phase B/C still **not built** (accounts, paid tier, B2B reports). Optional: `NEXT_PUBLIC_FORMSPREE_ALERTS_ID`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
