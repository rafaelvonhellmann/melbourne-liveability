# Data Expansion Plan (Opus, 2026-06-13)

Implementation plan for the founder-selected data/feature wave: W13, W15, W20,
W21, W23, W24, W25 (+ one proposed addition). Planned by Opus; executed by Codex
(gpt-5.5 xhigh) in lanes per the orchestrate protocol; Fable/Opus gates. Founder
reconciles against Codex's independent blind research before final scope.

Hard rule carried from the licence-verification research: **no non-commercial /
no-redistribution / internal-use-only source ships.** Festra serves data as public
static tiles → it needs CC-BY-class commercial+redistribution rights. Verified
verdicts from the research are authoritative.

---

## Foundation first (F1, F2) — unlocks everything, do before the features

### F1. Open-data source + licence registry (the backbone)
Every new source this wave adds is a per-region fetch + a provenance entry + a
trust-drawer line. Done ad-hoc that's 7x duplication and a licence-discipline
hole. Build ONE typed registry: each source declares
`{ id, name, custodian, url, licenceVerdict, attribution, granularity, regions[], fetch }`.
- `licenceVerdict` is an enum from the research: `open-commercial-ok` |
  `open-with-attribution` | `non-commercial-or-restricted` | `paid-or-closed`.
- **Enforcement**: the build refuses to bake any source whose verdict isn't one
  of the first two. This makes "don't ship paid/NC data" a compile-time guarantee,
  not a memory.
- `sources.{region}.json` + the trust drawer read the registry → every figure
  carries its verified licence on screen (the provenance moat the climate-risk
  feature needs).
- Migrate existing sources (crime adapters, hazards, GTFS, EPA, ANEF) into it as
  the first consumers. Effort: M. Codex-executable; Fable designs the type.

### F2. SA1 / Mesh-block geography in the pipeline
The pipeline is SA2-native. Pocket granularity (W23) and SEIFA-at-SA1 (W24) need
SA1. Add SA1 + Mesh Block boundary fetch + the SA2→SA1 nesting + a precompute path
that writes per-SA1 aggregates without bloating the SA2 artifacts (separate
`pockets.{region}.json`). ABS ASGS Ed.3, CC BY 4.0. Effort: M. Pin ASGS2021
(Ed.4 lands Jul 2026 — migrate separately).

---

## The wave, sequenced (dependency + value order)

### 1. W24 — Quick CC-BY credibility wins  [S, validates F1]
- **SEIFA** affluence percentile (IRSAD) — ABS, CC BY 3.0 AU (verified). SA2 now,
  SA1 after F2. The "how advantaged" number every competitor has and we don't.
- **Modified Monash Model 2023** health-access (MM1-7) — data.gov.au, CC BY 4.0.
  "How hard to get a GP here." Trivial join.
- **ACECQA childcare quality ratings** — Regional Data Hub, CC BY, daily. Upgrades
  childcare POIs from points to NQS-rated. Family-persona signal.
- **Verdict/"so what" layer** — pure design on held data: a plain-English headline
  per domain + verbal tier bands. No new data; the cheapest credibility lift.
First feature through F1 → proves the registry. Mostly S.

### 2. W15 — Address search precision (Nominatim → G-NAF Core)  [S-M]
Swap the geocoder to Geoscape **G-NAF Core** (verified CC-BY clone; only restriction
is no-bulk-mail, irrelevant). Exact geocoded addresses + parcel linkage; bias to AU
+ active-region viewbox. Measure against a 20-real-address fixture before/after.
Independent of the rest — can run in parallel. Do NOT touch Geoscape Buildings full
(commercial); Core only.

### 3. W13 — Connectivity domain (8th domain)  [M]
NBN tech footprint (FTTP/FTTN/HFC/wireless/satellite — data.gov.au, **verified
CC BY 4.0**; the isopen:false flag was a stale CKAN artifact) + ACCC mobile coverage
per-carrier + Black Spot points (CC BY 4.0). Zonal stats vs SA2/SA1. New scored
domain: "can I work from home / will my phone work here." DO NOT use per-address
NBN/carrier lookups (ToS) or ACMA standardised maps (carrier all-rights-reserved) —
the polygon releases suffice. National from day one.

### 4. W20 — Planning & parcel intelligence (the Landchecker layer)  [M-L, VIC-first]
Per-parcel, on the report + a website parcel-click panel, all Vicmap/VicPlan CC BY 4.0:
- **Recent + proposed planning scheme amendments** near the parcel ("what's
  changing here") — the standout; planning.vic, gov-fetch curl shim.
- **Full overlay set** with purpose text: VPO / DDO / ESO / HO / BMO (today we only
  pull flood+BPA for hazards).
- **Zone** + purpose + nearby zones.
- **Aboriginal Cultural Heritage Sensitivity** (VIC Aboriginal Heritage Register).
- **Elevation contours / land slope** (ELVIS DEM — national, lands everywhere).
- **Parcel-identity block**: SPI / lot-plan / council property no. / site dimensions
  (rides on the parcel fetch we already do — FOUNDER TO CONFIRM keep-in; Opus vote: yes).
- **State electorates, council planning contact, closest schools** (named-distance).
VIC-complete first; other states get zones+overlays where published, amendments +
Aboriginal-sensitivity are VIC-specific → honest "not available for this state" copy.
Aircraft-noise national rule: state-republished ANEF only, NEVER Airservices direct
(Crown-copyright paid).

### 5. W23 — Within-suburb pocket granularity  [M, needs F2]
SA1 Census + SEIFA-at-SA1 → show intra-suburb variation ("north end top-quintile,
south 30pts lower, renters cluster east"). The Microburbs edge suburb-average tools
can't match. Precompute per-SA1 (F2). Report + website.

### 6. W25 — "What's around / coming" data  [M each, per-state staged]
- **Contaminated-land registers** NSW/VIC EPA (CC BY) — authoritative, replaces the
  OSM nuisance *proxy*; high fear-value.
- **NSW live DA pipeline** (data.nsw Online DA API, daily, CC BY) — "what's being
  built next door"; the W20/W21 headline competitors charge for.
- **National bushfire + flood HISTORY** (GA, CC BY) — gives non-VIC capitals real
  history (not just current overlays).
- **Sentinel-2 NDVI** national greenness (ESA Copernicus — **verified** open +
  commercial + redistribution; attribute "Contains modified Copernicus Sentinel
  data [Year]") — canopy nationwide, no paid Geoscape.
- **EV chargers** (state feeds CC BY); **air quality** nationalized beyond EPA-Vic.

### 7. W21 — Website display upgrades (frontend, can parallel)  [M]
- **Comparison matrix** for compare mode (rows=areas, cols=metrics, lettered map
  pins ↔ rows) — OneMap's pattern, upgrades the compare page.
- **Stability signal** on place profiles (owner-occupied % + turnover, ABS tenure,
  open) — "settled vs transient."
- **Distance-to-nearest** as the universal liveability vocabulary across profiles
  + glimpse.
- **Search-radius circle + lettered pins** on the compare/comparables map.
- House-vs-unit split as a forward schema rule for any future price domain.

### 8. (PROPOSED ADD) W26 — In-house walkability / liveability 0-100  [M]
Research rank #3. Walk Score's API is US/CA-only + non-redistributable, so compute
our OWN from held OSM + ABS density: intersection density + amenity distance-decay +
block length + population density, street-segment level. Replaces a licence-blocked
competitor metric with a scoreable, receipts-backed Festra number. Strong, on-brand,
no new data licence. Recommend including.

---

## Cross-cutting rules (every item)
- Through F1 registry; non-commercial verdict = cannot bake. WA flood (DWER, CC-NC)
  stays OUT — ship WA hazards bushfire-only (clean CC BY 4.0). (Task #30 resolved:
  drop, don't license.)
- Per-region staging like crime/hazards: national where national (SEIFA, NBN, NDVI,
  G-NAF, MMM, climate), VIC-first where VIC-specific (amendments, Aboriginal
  sensitivity, ANEF). Missing data = visible "not available for this state."
- Provenance on screen: every figure shows source + vintage + verified licence.
- Execution: Codex in lanes (disjoint adapters parallel; shared files — registry,
  build.ts, regions.ts — wired by Fable at merge). Fable gates each diff + re-runs
  tests (lane sandboxes can't run vitest).

## Deferred (saved, not dropped)
- **W19 report UX redesign** — HELD until this data lands (more data = the report
  needs redesigning around the richer content anyway). Lavish mockup + the founder's
  8 annotations preserved at .lavish/festra-report-redesign.html; resume there.
- The climate-risk SCORE (W22) and the report redesign are the two headline moves
  AFTER this data foundation.

## Reconciliation gate
Codex is running the report-intelligence research independently + blind
(task-mqbuwa99). When it returns, founder compares to Fable's pass and confirms
final scope before Codex executes this plan.
