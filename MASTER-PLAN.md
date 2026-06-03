# Master Plan & Handover — liveable.melbourne / Buyer Check

Single source of truth to **start a new session**. Covers what is shipped, what
is pending (build / review / act), the backlog, the file map, how to run, and
the gotchas. A `## Code-review findings` section at the end is filled after the
review pass.

---

## START HERE - new-session handover (HEAD `a0a975b`, tree clean, deploy green)

**Product.** Free static Next.js + TS liveability map + pin-level **Buyer Location
Check** for Greater Melbourne, on GitHub Pages (sub-path host via `withBase()`).
No listings, no backend, no auth. Moat = transparency + buyer-decision DEPTH (beat
NestCheck, the real VIC competitor, on depth + trust, NOT coverage). Founder's
north star: "improve how we deliver the information to people."

**Decisions (locked).** Ship FREE; monetisation parked + UI removed. Profile-on-
register (accounts) = NEXT PHASE only - the local `lib/buyer-fit.ts` profile is the
seed; keep new profile work account-ready. Never regress: static-export-only,
Buyer Mode never folded into the locked 7-domain score, every finding shows
source + freshness + caveat (unit-tested), deterministic no-AI report engine,
DIGNITY-STANDARD (supply not welfare-%, amenities not demographics), ASCII only
(no em-dashes - founder stripped them in `5011863`), never fabricate data.

**Gate every item.** `node node_modules/typescript/bin/tsc --noEmit` (capture the
REAL exit - `| rtk cat` MASKS tsc's exit code; use `; echo TSC_EXIT=$?`) ;
`npx vitest run` (27 files / ~224 tests) ; `npx eslint .`. Commit per item, push =
auto-deploy. Verify via DOM / data / CI, never the local dev server (OneDrive locks
`.next`; map canvas rAF-throttles under automation - founder eyeballs renders).
rtk gotchas: breaks `npx` as a prefix (use `npx ... | rtk cat`), mangles `find` +
heredoc stdin (use plain git/node there).

**CRITICAL - monthly data-refresh.** `scripts/.github/workflows/data-refresh.yml`
runs in a clean CI env. The newer raw fetches (community / EV / police+childcare /
noise / nuisance / stations / heritage) are NOT in `scripts/fetch.ts`, so the
workflow now fetches them explicitly before `data:build` (fixed `88838c4`). If you
add ANY new fetch script, ADD IT TO data-refresh.yml or the monthly refresh
silently drops that layer (this regressed pins 37,723 -> 32,010 on 2026-06).

### Tasklist - build queue (recommended order)

| # | Item | Status / how |
|---|------|--------------|
| DONE | **Declutter buyer report** (#7) | Shipped: per-finding Source/Confidence/Geography -> PDF-only (`e3ce360`); engine `tone:"concern"` drives a "What to weigh up" negatives section vs neutral "Things to verify" (`43e02e5`). Copy can iterate after founder eyeballs it live. |
| 1 | DONE - **Conservation / restriction overlays** (ESO/SLO/VPO/EMO/EAO/PAO) | Shipped `b993c92`. 6 Vicplan overlays (ids verified live) as a sourced/caveated buyer finding (PAO/EAO = high severity -> before-you-offer checklist) + area-card panel; normalize inline + data-refresh.yml wired. |
| 2 | DONE - **Social-anchor scoring** | Shipped (4 commits). Work/school/family anchors added in the profile by geocoded address -> straight-line distance + plain-English band in the report ("Distance to your places") + purple map pins with dashed lines to the pin. `lib/anchors.ts`; context only, never scored. The NestCheck wedge. |
| 3 | DONE - **Sun-path SVG** | Shipped. Honest side-on sun-path diagram (`components/buyer/SunPathDiagram.tsx`) - summer/winter arcs; replaced the WSW/degrees copy. |
| 4 | DONE - **Transit lines near pin** | Shipped. Rail (blue) + tram (green) lines clipped near the pin + map legend; reuses the noise-line loader. Bus (GTFS) still a follow-up. |
| 5 | DONE - **School catchments** | Shipped (this session). The DataVic School Zones release actually ships GeoJSON (CRS84/WGS84 - NO reproject, NO SHP dep needed; the bulk-SHP assumption was wrong). `fetch-school-zones.ts` (adm-zip) takes Primary + Secondary Year 7 integrated zones, metro-clips + simplifies (~30 m) -> `public/data/school-zones.json` (770+216 zones, 0.56 MB, lazy-loaded). `lib/school-zones.ts` resolveSchoolZones (turf point-in-polygon); buyer-report "school-zones" finding now resolves the actual zoned school in pin mode (verified: CBD -> Carlton Gardens PS + University High). |
| 6 | DONE - **Big Build pin-layer** | Shipped. Metro Tunnel + SRL East pins in buyer mode with click-through to the official page. |
| 7 | DONE - **"The Basin" grocery fix** | Shipped. Nearest-supermarket fallback ("short drive") when none is within the walk circle. |
| 8 | **Codex remaining (open)** | per-finding source-freshness badge (founder deferred to PDF); wire profile fields (schools/safety/walkability) into report ordering; specific proxy source labels; inline jargon defs; 44px touch targets; ARIA (search listbox, map role); adjacency real-boundary; flatten nested cards; **axe-in-CI** (G7 was blocked on a clean local env - wire it into CI). |
| - | **NDIS pins** | EXCLUDED (OSM has ~3; do not fake sparse data). |
| - | **Accounts / profile-on-register** | NEXT PHASE only (needs backend). Local profile is the seed. |
| - | **Google Earth premium / Cesium / OpenGeoAgent** | NO - licensed / 3D / AI-pipeline, off-strategy. Parcels + footprints OK later via OPEN Vicmap. |
| - | **Dead-ends (flag, never fake)** | hospital catchments (no such concept - use distance); power-grid outage history (distributor-level only); per-area infra spending (not geocoded - Big Build is the proxy). |
| + | **Horizon lens** (future-risk theme) | LARGELY SHIPPED. Forward-looking layers for a 5-25yr purchase. DONE: sea-level rise + coastal inundation (DEECA Future Coasts via the queryable CoastKit REST service - the "download-only SHP" assumption was overturned by the discovery workflow), past fire history (Vicmap WFS), VIF population/dwelling projections, **ABS building approvals / "what's being built"** (see below), Big Build proximity (future transit). Each labelled projection/scenario with source+caveat. REMAINING (optional): climate flood/fire forward-trend, explicit upzoning / activity-centre densification overlay. |
| + | BLOCKED (manual order) - **Water retailer** | Which retailer services the SA2 (Yarra Valley / South East / Greater Western Water). The boundary dataset is DataShare manual-order only (`md=60bfa03f`, no direct/API download), so it cannot be auto-fetched. Defer until the order is placed; then ingest the resulting file via the standard clone pattern. Skip generic water-quality (metro is uniform/regulated; localised contamination already via the EAO overlay). |
| + | DONE - **Aged care / retirement pins** | Shipped. 262 OSM nursing-home/assisted-living facilities as a context pin category (Community group). Density verified before adding. SKIPPED SDA / shared-support (dignity + sparse). |
| + | DONE - **"What's being built" (development pipeline)** | Shipped (this session). ABS Building Approvals dataflow `ABS,BA_SA2,2.0.0` (per-SA2, not just LGA), dataKey `1.9.TOT.110+100.SA2..M` (dwelling units, total sector + work, Houses + Total Residential). `fetch-abs-approvals.ts` decodes SDMX-JSON (no reproject) -> compact per-SA2 monthly series; `lib/approvals.ts` summarizeApprovals = trailing-12-month dwellings + prior-12 trend + house vs higher-density split; normalize inline -> `context.developmentPipeline` (all 361 GM SA2s, latest 2026-03); buyer-report "development-pipeline" finding. BUILT FORM + supply framing only (dignity). data:abs-approvals wired into data-refresh.yml (monthly). Future council permits still have no clean open feed - covered forward via Big Build + approvals trend. |

### Shipped 2026-06-04 (overnight autonomous run)

Seven features, each gated (tsc=0 / vitest / eslint / data:verify) + committed +
pushed; final `next build` green (371 static pages, export OK). vitest 303 / 40 files.
- **#11 Water retailer** - Vicmap `water_corp` WFS (CC BY 4.0) bypassed the manual-
  order blocker; filtered to the 3 metro retailers; `context.waterRetailer` on
  358/361 SA2 + buyer finding.
- **#17 EPA air quality** - AirWatch `/sites` (header is `X-API-Key`, NOT the Azure
  default); 94 sites -> `public/data/epa-air-sites.json`; nearest-monitor finding with a
  DATED band + live-AirWatch link. Built with the founder's key; fetch self-skips when
  `EPA_API_KEY` is unset; wired into the monthly workflow.
- **Activity centres (Horizon)** - Vicmap `plan_zone` ACZ (175 metro polys) -> in-an-
  activity-centre finding.
- **Affordability trend** - ABS C21_T02 ratio-of-medians (mortgage + rent vs income,
  2011/2016/2021 on 2021 boundaries) -> 2 SA2 trend series.
- **Median lot size** - runtime client query to the Vicmap parcel WFS (CORS-open) +
  turf.area; per-pin "lot size" finding (no SA2 median - millions of parcels, no area field).
- **Bus access** - extended GTFS precompute -> `public/data/bus-stops.json` (18,597 stops);
  nearest-bus-stop + route-count finding (resolves the #4 bus follow-up).
- New deps: none beyond adm-zip (prior). New sources: vic-water-corp, epa-air,
  vic-activity-centres, abs-census-tsp-sa2, vic-parcel (manifest 40 sources / 25 cited
  / no dangling).

**Remaining (NOT built - documented, not blocked-on-me):**
- **Climate forward flood/fire trend** - NO honest open feed exists (discovery workflow
  verified: ACS hazard indices are use-restricted + coarse + no flood; VFCT is manual
  in-tool export; CSIRO/BoM is ~5-12 km grid). Building it would fabricate parcel-level
  precision. Deliberately NOT built. Only defensible future move = a PDF-only qualitative
  note citing VFCT/ACS.
- **"Find areas like this" (criteria filter)** - the similarity ENGINE already exists
  (`lib/similar-areas.ts` reference-based per-domain match, surfaced on profiles + alerts
  + summary card), and the map weight-sliders already re-rank areas by chosen priorities.
  A dedicated criteria-filter page would largely duplicate these - left as a UX design
  decision for the founder rather than built speculatively.
- **a11y polish (#8)** - baseline a11y IS enforced (eslint-plugin-jsx-a11y via
  next/core-web-vitals, passing). The remaining Codex items (axe-in-CI, 44px touch
  targets, runtime contrast/focus) are runtime/visual and need a clean browser + axe env
  to verify - the same reason G7 was parked. Best done with the founder present, not blind.
- **#19 ACECQA childcare ratings** - DECISION (founder + me): do NOT ship the data
  (all-rights-reserved). Reference-only - point users to the official ACECQA/Starting
  Blocks rating lookup from the childcare context (small copy add, not a data pipeline).

### Shipped 2026-06-03 (Horizon + Buyer-depth session)

Five items, each gated (tsc=0 / vitest / eslint / data:verify) + committed + pushed:
- **#14 Codex-audit fixes** - 3 buyer-report findings cited the wrong source
  (transport-noise/nuisance/train-station all pointed at osm-amenities); corrected
  to osm-noise-corridors / osm-nuisance-points / osm-train-stations + reworded the
  price caveat. Proves the double-check mechanism caught real bugs.
- **#10 ABS building approvals** (development pipeline) - SDMX-JSON, `context.developmentPipeline`, all 361 GM SA2s, monthly.
- **#5 School zones** - GeoJSON (no SHP/reproject), address-level zoned-school finding.
- **#18 Traffic AADT** - DTP measured vehicles/day, "busy road nearby" pin finding.
- data-refresh.yml: `data:abs-approvals` added (monthly); school-zones/traffic are
  annual committed public files (documented in the workflow).
- New deps: `adm-zip` (school-zones unzip). New sources: abs-building-approvals,
  vic-school-zones, dtp-aadt (manifest 35 sources / 21 cited / no dangling).

**(Historical note - this queue was RESOLVED on 2026-06-04, see the section above.)**
- **#17 EPA air quality** - DONE 2026-06-04 (header was `X-API-Key`, not the Azure
  default; founder supplied the key, `EPA_API_KEY` secret still to be added for the
  automated monthly refresh - the fetch self-skips meanwhile).
- **#11 Water retailer** - DONE 2026-06-04 (the manual-order blocker was bypassed via the
  Vicmap `water_corp` WFS - same data, open, no order needed).
- **#19 ACECQA childcare ratings** - still not shipped as DATA (all-rights-reserved);
  decided reference-only (link to the official ACECQA rating lookup).

### Shipped this session (`b9c56b1`..`a0a975b`)

Codex P0-P1 quick wins (contrast `--accent` #ad4f2e passes AA, sub-path share
links via `shareHref`, heritage copy, agent voice); em-dashes stripped from copy;
data-refresh durability patch; **report restructure** - "Before you offer, check
these first" priority TL;DR (top-3 verify/red_flag by severity then materiality),
on-screen copy now direct with full detail moved to the PDF (`hidden print:block`);
hazard + school-zone declutter (material vs unavailable); sun-aspect copy
simplified; walk-circle pin clip (buyer-mode pins now clipped to the bike/walk
circle, not dumped citywide); pin grouping (Health services aggregated, Hospitals
separate, NDIS dropped). 27 test files, ~224 vitest, all CI-green.

### Codex ultrareview

`CODEX-ULTRAREVIEW.md` (gpt-5.5 pass). Addressed: report priority restructure,
contrast, sub-path links, heritage copy, agent voice, em-dashes, hazard/school
declutter, on-screen-direct + PDF-comprehensive split, data-refresh durability.
Open items tracked in that doc's status header (mirrored in tasklist #8).

### Non-price research -> product direction

The "property fit profile" model (time / comfort / safety / family / climate /
social / flexibility / confidence) extends `lib/buyer-fit.ts`. Cheapest high-value
differentiator = social-anchor scoring (task #2). New buyer lenses to consider:
investor, land-buyer, agent (existing lenses: Balanced / Renting / Buying /
Family / Retiree / Data-quality).

---

## (HISTORICAL) Autonomous build mandate - G1-G12 board (superseded)

> Superseded by the new-session handover at the top of this file. The G1-G12
> board below is ALL shipped; kept for provenance only. Follow the tasklist
> above, not this section.

**Original mandate - keep building the Goal board (G1-G12) below until it's done.**
Founder's instruction, verbatim intent: *"set it as a goal and build everything that is
pending; if you hit a problem, come to me for a direction — otherwise don't stop."* So:

- **Do NOT checkpoint or stop to report progress.** Gate → commit → push → next item, repeat.
- **Only message the founder for a genuine direction-decision** (a real fork, a source that
  doesn't exist, an ethics/dignity call). Not for progress updates.
- **Gate every item:** `npm run typecheck` · `npm test` (vitest) · `npm run lint`. Commit per
  item (trailer below). Push = auto-deploy (GitHub Pages).
- **Verify via CI, not the local dev server.** Repo lives in OneDrive; `.next` gets locked
  mid-build/HMR → local `next dev` serves stale/broken bundles, `next build` flakes. CI is
  clean — `gh run watch <id>` on deploy-pages is the authoritative build check. To use the
  dev server, `rm -rf .next` first. The MapLibre GL canvas also rAF-throttles under
  automation, so verify map features via DOM/data/CI, not screenshots/synthetic clicks.
- **Never fabricate data.** Find an authoritative source, fetch, sanity-check; if no clean
  source exists, FLAG it (don't invent coordinates/values). See the Big Build curated set +
  the data-audit for the pattern.

**Do NOT build (out of scope):** the §6 "founder calls" (brand name, pricing, legal/ODbL,
accounts/payment) · **national expansion** · **welfare/Centrelink-% per area** (dignity — use
social-housing *supply* instead, same reason we dropped ethnicity %).

### Goal board
| # | Item | Status | Class / how |
|---|---|---|---|
| G1 | "Show 15-min walk" button + bold radius | ✅ `0766c7b` | — |
| G4 | Sun & aspect finding (lib/sun.ts) + remove ShadeMap | ✅ `1c2fc0a` | — |
| G5a | Data completeness audit + drop NDIS | ✅ `5827f0d` | `npm run data:audit` → `data/generated/data-audit.json` |
| G6 | Colourblind-safe ramp toggle | ✅ `4438123` | RdYlBu (red=worse→blue=better) toggle on map+legend; persisted pref; LayerToggle "Display". Report swatches stay default. |
| G8 | "Find areas like this" multi-criteria filter | ✅ `169d24e` | `lib/similar-areas.ts` equal-weight per-domain % similarity; profile "Areas like this" (precomputed) + map card expandable. |
| G12a | Cyclability radius around the pin | ✅ `bfd04b6` | ~15-min bike ring (3.5 km, teal) + area cycle-infra index in the buyer panel. |
| G3 | Community amenities (worship + community centres) | ✅ `00ff0c8` | Overpass → 1,160 worship + 513 community/cultural pins; buyer "Community & culture" group. `npm run data:community-poi` |
| G2 | Social-housing **supply** layer | ✅ `65891a1` | ABS Census G37 landlord-type → `context.socialHousing` (public+community %); profile panel. `npm run data:social-housing` then `data:apply-social-housing` → `data:geo`. **Map context-layer still TODO.** |
| G5b | Police (VicPol) + childcare (VIC) authoritative | ✅ `c5482e5` | Vicmap FOI replaces OSM: police 125→98 (official), childcare 1,198→3,694. Per-category buyer attribution. `npm run data:vic-facilities` then `data:poi`. |
| G9 | Deeper indicators | 🟡 partial `aeb64ea` | **DONE:** rent + mortgage stress → `context.housingStress` (ABS G9.. stress %). **TODO:** DFFH vacancy, journey-to-work mode share, train-station distance (separate sources). |
| G11 | Zoning/heritage/parcel overlays | 🟡 partial `25d659d` | **DONE:** Heritage Overlay share → `context.planning.heritageOverlayPct` + profile panel + caveated buyer finding (Vicplan layer 9, 11,270 polys, complete). **TODO:** zoning (Vicplan zones) + parcel-level overlay matching. `npm run data:heritage` then `data:apply-heritage` → `data:geo`. |
| G10 | School catchments + primary/secondary split | ⬜ | research-gated (official zone boundaries — findmyschool.vic / DET). Heaviest: needs polygon catchments + point-in-polygon at pin level. |
| G12b | Fuller LXRP-110 set + Big Build map pin-layer | ⬜ | Pin-layer = pure code (data in `data/generated/major-projects.json`, 11 stations) but a WIDE blind-to-verify map surface (rAF throttle) — well-specified follow-up. LXRP-110 set needs a clean geocoded source. |
| G7 | axe a11y audit (Playwright) | ⬜ | blocked: needs a clean local env (OneDrive lock) |

Suggested order for the next session: **G11 zoning** (extend the shipped heritage pattern — add a Vicplan zone layer the same way) → remaining **G9** (train-station distance is computable from the existing GTFS; DFFH vacancy / journey-to-work need new sources) → **G2 map context-layer** (the supply data already lives in `context.socialHousing`) → **G12b pin-layer** / **G10 catchments**. G7 when the local env is clean.

**Verification reality (held all session):** map render rAF-throttles under automation, so every map feature was verified via DOM/data/CI, never pixels. All 8 items this session gated `typecheck · vitest · lint` + CI deploy green. Context layers verified with the HEAD-diff script (domainsChanged === 0 every time — the locked composite was never touched).

**Context-layer pattern (proven this session, reuse for more ABS/DFFH context):** dedicated `fetch-*.ts` → raw → `apply-*.ts` reads `data/generated/places.json` + injects `place.context.X` (mirror `apply-social-housing.ts` / `apply-housing-stress.ts`), PLUS the same compute inlined in `normalize.ts` for durability, then `data:geo`. ALWAYS verify with the HEAD-diff script (domainsChanged must be 0 — context never touches the locked composite). Sanity-check values vs ground truth before committing.

### Decisions already made (do NOT re-litigate)
- Score ramp = continuous **red→green** (worse=red); G6 adds a colourblind toggle *on top*.
- "Rental affordability" → **"Rent vs income"**. Priority sliders hold **raw** weights (label = share-of-score). Pharmacy is in **Health**. Layer tooltips don't name sources (→ methodology).
- Sun-aspect is **proprietary** (`lib/sun.ts`); ShadeMap removed (liability).
- **NDIS dropped** from the report (OSM has 3 across Melbourne); map pin category kept.
- Social housing = **supply** (Census landlord-type + OSM points), NOT welfare-%.
- Community signal = **amenities** (places of worship of all faiths + community/cultural centres), NOT demographics.
- Lens picker = curated 6 (Balanced / Renting / Buying / Family / Retiree / Data quality).

### Conventions / gotchas
- `rtk` prefixes shell commands (token filter) but **breaks `npx` as a prefix** — use `npx … | rtk cat`, never `rtk npx …`.
- Data scripts: `npx tsx scripts/<x>.ts`. Offline data rebuild for data items: `data:normalize` → `data:score` → `data:geo` (reads `data/raw/*`, gitignored but present locally; avoid network `data:hazards`/full `data:fetch` unless needed).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- ~138 vitest tests. Hard constraints (§2) unchanged: static export only · Buyer Mode never scored · never overclaim/fabricate · every finding sourced + caveated · sub-path safe (`withBase`).

---

## 0. TL;DR
- **What:** static (no-backend) Next.js map of Greater Melbourne liveability +
  a **Buyer Location Check** (drop/search a location → sourced, caveated
  due-diligence report before you offer). Buyer-first product.
- **Live:** https://rafaelvonhellmann.github.io/melbourne-liveability/
- **Repo:** github.com/rafaelvonhellmann/melbourne-liveability (HEAD `5827f0d`)
- **Goal:** report-first buyer due-diligence for Melbourne; open map stays free;
  per-report monetisation validated before national expansion. Compete on
  transparent, sourced due-diligence — NOT price (that is Cotality/Domain/REA).

## 1. Run + gates
```
npm run dev            # localhost:3000
npm run typecheck      # (or: node node_modules/typescript/bin/tsc --noEmit)
npm test               # vitest — 101 tests
npm run lint           # (or: npx eslint .)
npm run build          # next build -> static export to out/
```
Local-binary fallbacks (`npm run` PATH is flaky in this shell): `node node_modules/typescript/bin/tsc --noEmit`, `npx vitest run`, `npx eslint .`.

**Gotchas:**
- **OneDrive build flake:** repo lives in a OneDrive folder; `next build` can fail
  at "Collecting build traces" (ENOENT `.next/...nft.json`) — OneDrive syncing
  `.next`. Fix: `Stop-Process -Name OneDrive -Force` for the build, then restart
  it. Irrelevant to `output:export`; CI (GitHub runners) unaffected.
- **Automated-browser map render:** controlled/headless tabs `rAF`-throttle the
  MapLibre GL canvas (blank map); reproduces on prod too — verify the map in a
  normal focused tab, not automation.
- Data raw (`data/raw`) is gitignored; only generated JSON/GeoJSON is committed.

## 2. Hard constraints (never regress)
Static export only (no backend/server/API/db/auth/payment) · Buyer Mode is a
context lens, **never** folded into the scored composite · not advice · never
overclaim/invent data · every finding shows source + freshness + precision +
confidence + caveat (unit-test enforced) · sub-path safe (`withBase()`).

## 3. SHIPPED (this + prior sessions, all deployed)
Commits `2cd7ae9` → `0a2c375`:
- **Buyer Check v2 engine** (`0581ed8`) — `lib/buyer-report.ts` deterministic
  findings; `BuyerReportPanel`; `/buyer`, `/buyer/sample-report`; profile
  "Buying here?" card; paid-tier `lib/walk-isochrone.ts` (env-gated, off).
- **Data** — gated rebuild lit up Year-12 (`5980054`); banks + TAFE + university
  POI categories (`f355d32`).
- **CI** — Pages actions bumped to Node 24 (`21fa9c6`).
- **Phase 0** (`8624b8a`) — honesty fixes (heritage overclaim removed, every
  finding sourced/caveated + test, advice-wording removed, off-coverage
  precision, base-path source links), **mobile context-lens leak fixed**,
  sitemap (real domain + routes), buyer-first metadata + OG, alerts privacy
  link, **`DIGNITY-STANDARD.md`**, **`/about` trust page**.
- **Phase 1** — hazards-conditional + SEIFA plain-language (`6da8b36`);
  categories groceries-first / Services split / hospitals-first (`1222b19`).
- **Phase 2** — zoom-to-pin + wider sidebar (`897f4c3`); search-to-area pin
  (`9f5d0ec`); nearby-amenity pin toggles (`71aaf5b`).
- **Phase 3** — crime nuance: property + violent split, caveated (`8bf5892`).
- **Phase 4** — per-report pricing **waitlist** (no committed price) + env-gated
  cookieless analytics funnel (`f671e2e`).
- **UX rework** — declutter sidebar (`8e719c4`); 15-min walk **radius** drawn
  (`1eb772e`); **unify flow** (click/search = instant deep-dive, no toggle, no
  size-reset) + **Economy** rename (`41c6ccf`); domain hover tooltips (`0a2c375`).

## 4. BUILD tasks #7-#13 — ALL SHIPPED (`d805e13`..`56dec4a`)
All seven goal-tracker build items are done, each gated (typecheck · tests · lint) and pushed:
| # | Item | Commit | Notes |
|---|---|---|---|
| 9 | **Crime LGA fallback** | `d805e13` | Root cause was a name mismatch, not missing data: ABS says `Moreland`, VCSA renamed it `Merri-bek` (2022), so the existing LGA-fallback silently dropped all 13 Moreland SA2s. Added a shared `normalizeLgaName()` alias → they now resolve at the accurate suburb level. |
| 7 | **Full-address geocode → exact pin** | `dd3e328` | `lib/geocode.ts` (OSM Nominatim, Melbourne-bounded, abortable, attributed, explicit-submit so ≤1 req/s). SearchBox offers "search as address"; a pick drops an exact pin → deep-dive (SA2 from geometry). Static-safe. Wired on the map + Compare. |
| 13 | **R3 precise-walk race + R5 dead export** | `da7bef8` | `recomputePrecise()` now snapshots the pin + AbortController + staleness guard. Removed unused `amenitiesNearIsochrone` + its tests. |
| 11 | **Compare search + adjacency caveat** | `c218b09` | Buyer report gains a "Close to a neighbouring area" finding when the pin is within ~15-min walk of a neighbour's centroid (honestly captioned as centre-point proximity, not a boundary test). Compare reframed to "Search where you want to live" + address→SA2 add. |
| 12 | **ShadeMap link + retention** | `20859f9` | `lib/shademap.ts` "Check sunlight & aspect" deep-link in the report; saved-checks retention (`user-prefs.savedChecks`) with a "Your saved checks" list in the buyer entry state. Cross-device still needs accounts. |
| 10 | **Parks dedupe** | `a400a83` | `dedupeParkAmenities()` collapses OSM park splits (same name OR generic, within 200 m). Verified: a Royal Park pin drops 36→20 distinct parks. Park geometry is point-only, so green-%-of-area would need a polygon rebuild — deferred. |
| 8 | **Collapsible sidebar + Lens merge + mobile parity** | `56dec4a` | Unified "Lens" picker (Balanced/Renting/Buying/Family/Retiree/Data quality — young-pro/student→Renting, education→Family); collapsible desktop panel; mobile sheet now Explore/Search/Layers/Weights (Results tab + Recently-viewed removed). |

## 5. REVIEW / FIX + polish — mostly shipped (`d0c2d5d`..`45d3964`)
Shipped (gated typecheck · 130 tests · lint; CI build green):
- ✅ **Canonical tags** `/buyer/sample` → `/buyer/sample-report` (`b22e411`, Codex P3).
- ✅ **Domain tooltip** → styled, keyboard-accessible explainer box (`de75175`).
- ✅ **CI** data-refresh.yml actions `v4`→`v6` (`d0c2d5d`); deploy-pages already `v6` (`21fa9c6`).
- ✅ **Bushfire + flood hazard risk layers** (`a946e3d`) — overlay-share choropleths,
  Reds ramp, off by default, never scored. **Ramp + bands (2/10/25/50%) are a first
  pass — review/tune.**
- ✅ **WCAG AA contrast** (`046fef9`, Codex P2) — accent deepened #D97757→**#AD4F2E**
  (focus #9C4221) to clear 4.5:1 as text + white-on-fill. **Brand reads a touch deeper;
  the two hex values are tunable (keep ≤#AD4F2E on light to stay AA).**
- ✅ **Buyer-restore E2E** (`7ff7684`) — Playwright spec for `?buyer=1&lat&lng`.
- ✅ **Infrastructure MVP** (`45d3964`) — "major project nearby" buyer finding from a
  curated VIC Big Build set (Metro Tunnel ×5 + SRL East ×6), coords resolved via OSM
  Nominatim + sanity-checked (`scripts/build-major-projects.ts` →
  `data/generated/major-projects.json`). Factual, sourced, NOT price prediction. A map
  pin-layer can follow.

Still open:
- **axe a11y audit** (Playwright) — un-addable blind here: Playwright's webServer is the
  OneDrive-corrupted `npm run dev`, E2E isn't in deploy CI, and axe needs iterative fixing
  against a live run. Do it in a clean local env. [Codex P1.]
- **`page.tsx`** (~950 lines) — extract `useBuyerMode`. **Deferred on purpose:** refactoring
  the core buyer flow (no unit coverage; only the corrupted dev server verifies it) blind is
  the wrong risk. Do once OneDrive `.next` is clean. [optional]
- **Community amenities** — founder GREENLIT reshaping "community" to amenities (places of
  worship of all faiths, community/cultural centres as a POI category), NOT demographics.
  Next build item.
- **OneDrive `.next` HMR lock** can corrupt the *local* dev server mid-edit (stale
  bundle, false "hooks order" errors). CI/prod unaffected. Fix: stop OneDrive, `rm
  -rf .next`, `npm run dev`. See [[onedrive-next-build-race]].

## 5b. Strategy discussed (this session) — decisions/notes
- **Lens merge:** founder chose the curated buyer-first 6 (`56dec4a`).
- **Demographics (religion/nationality/migration):** recommended AGAINST per-ethnicity
  percentages (steering risk, conflicts with `DIGNITY-STANDARD.md`). **Founder GREENLIT**
  the amenities reshape instead — places of worship of all faiths + community/cultural
  centres as a POI category. Next build item (see §5).
- **Legal/copyright:** OSM ODbL share-alike on the derived geojson is the one to watch;
  AU has no sui-generis DB right so the open data is inherently copyable — moat = brand
  + methodology + report UX + gated paid features. Folds into §6 legal review.
- **Council/infra contracts (analisa.pt-style):** raw procurement isn't geocoded.
  **MVP SHIPPED** (`45d3964`) as a buyer finding from a curated, OSM-resolved Big Build
  station set (§5). A fuller LXRP-110 set + a toggleable map pin-layer remain if wanted.

## 6. PENDING — ACT (founder decisions / external)
- **D1 brand name** — pick (shortlist: Kerbside / Groundwork / Premise /
  Sightline); `liveable.melbourne` is the working name. Verify domain/TM/socials.
- **Pricing number** — set per-report price via the waitlist/WTP test.
- **Legal review** of Terms/Privacy/Disclaimer + report wording before charging.
- **ORS key proxy** — required before shipping paid precise-walk (key currently
  client-exposed; feature env-gated OFF in prod). [Codex P1.]
- **Accounts/payment** thin service — gates cross-device retention + paid reports.
- **Twitter/price data** — price-growth = out of scope; rent-affordability = backlog.

## 7. BACKLOG (bigger / deferred)
Composable (stacked) layers · multi-criteria "find areas like this" filter
(spec Part 6) · deep methodology indicators (mortgage-to-income, rental stress,
DFFH vacancy, journey-to-work mode share, train-station distance — need new
ABS/DFFH fetch + 2-source validation vs scores) · zoning/heritage/parcel overlays
· Centrelink / social housing
(sparse OSM) · primary/secondary school split (sparse `isced`) · cyclability
radius · national expansion (Sydney/Perth/…) · price/growth context (licensing).

## 8. File map (key)
- Engine/data: `lib/buyer-report.ts`, `lib/source-manifest.ts`,
  `lib/walk-isochrone.ts`, `lib/buyer-location.ts`, `lib/share-url.ts`,
  `lib/analytics.ts`, `lib/domains.ts`, `lib/colors.ts`, `lib/poi-categories.ts`,
  `lib/scoring.ts`.
- Components: `components/MelbourneMap.tsx`, `components/buyer/BuyerReportPanel.tsx`,
  `components/buyer/SampleReportPage.tsx`, `components/buyer/BuyerHereCard.tsx`,
  `components/LayerToggle.tsx`, `components/MobileSheet.tsx`, `components/SearchBox.tsx`.
- Routes: `app/(map)/page.tsx` (+ `layout.tsx`), `app/buyer/*`, `app/about/page.tsx`,
  `app/pricing/page.tsx`, `app/places/[slug]/page.tsx`, `app/compare/page.tsx`,
  `app/sitemap.ts`, `app/layout.tsx`.
- Pipeline: `scripts/build.ts`, `scripts/fetch-extra-poi.ts`, `scripts/build-poi.ts`,
  `scripts/fetch-indicators.ts`, `data/generated/sources.json`.
- Docs: this file, `ACTION-PLAN.md`, `CODEX-REVIEW.md`, `DIGNITY-STANDARD.md`,
  `BUYER-MODE-DRAFT.md`.
- Tests: `tests/buyer-report.test.ts`, `tests/walk-isochrone.test.ts`,
  `tests/share-url.test.ts` (+ others). 101 total.

## 9. Handover notes
- Goal-tracker tasks **#1–13 ALL complete** (section 4 — shipped `d805e13`..`56dec4a`,
  each gated typecheck · 123 tests · lint, committed per item and pushed to deploy).
- **Next up: §5 REVIEW/FIX items** (none touched this session): WCAG accent contrast
  (`#D97757` ~3.1:1), canonical tags on `/buyer/sample*`, Playwright E2E + axe, styled
  domain-tooltip popover, `page.tsx` god-component extraction. Then §6 ACT (R4 ORS
  proxy before paid, pricing number, legal review, accounts service) + **D1 brand name**.
- Browser-verify caveat held all session: the MapLibre GL canvas rAF-throttles under
  automation, so map-pixel + synthetic-click checks are unreliable — DOM/report-panel
  text, computed styles and data-level checks were used instead (all passed).
- Decisions D1–D4: D2 per-report ✅, D3 buyers+agents ✅, D4 dignity+trust ✅;
  **D1 brand name still open**.

## 10. Code-review findings
Max-effort multi-agent review of `88b4ae2..HEAD` (this session's buyer/map work).
**Constraints HELD** — Buyer Mode not folded into scoring; static-export safe;
`withBase` used; every finding shows source or caveat; analytics env-gated. 5 findings:

| # | Finding | Severity | Status |
|---|---|---|---|
| R1 | `BuyerReportPanel` within-group amenity sort broke nearest-first — a closer later-category pin (e.g. 150 m bank) hidden behind 4 same-category pins | High (regression from flow-unify) | **FIXED** `29a7917` |
| R2 | `safety-context` claimed medium/LGA recorded-offence context for ~20 SA2s with null crime (overclaim) | Medium | **FIXED** `29a7917`; full LGA-number fallback = task #9 |
| R3 | `recomputePrecise()` (paid precise-walk) has no abort/staleness guard — pin moved during the in-flight ORS fetch overwrites with the wrong report | Medium (env-gated OFF in prod) | **FIXED** `da7bef8` |
| R4 | ORS API key client-exposed on prod activation (no proxy/rate-limit) | Medium (act before paid) | §6 ACT (Codex P1) — still open |
| R5 | `amenitiesNearIsochrone` exported + tested but unused by the app (can drift from `getNearbyAmenities`) | Low | **FIXED** `da7bef8` (removed) |
