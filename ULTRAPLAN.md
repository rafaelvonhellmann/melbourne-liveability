# Melbourne Liveability MVP — Ultraplan (v2, domain model)

**Target executor:** Cursor (agentic). Build phase-by-phase. Each phase has a Definition of Done (DoD). Do not start a phase before the prior phase's DoD passes. Commit at each DoD.

**Inspiration:** analisa.pt (map-first, mobile-first, fuzzy suburb search, transparent scoring) + spachus.com.au (thematic layer toggles, clean filters). Open directly into the map experience, never a marketing landing page.

**Concept:** a liveability map of Greater Melbourne built **only** from Australian government / official open data (with OSM as attributed fallback), organised as **domains**. Each domain is its own toggleable map layer, its own sub-score, its own sources and caveats. Movers re-weight domains live; map re-colors and results re-rank.

### ⚠️ Product framing (authoritative — read this before adding metrics)
**The product is a data-access / compilation tool, NOT a scoring engine.** The point is to **compile open government (and attributed open) data into an accessible, transparent website** so ordinary people can easily find and understand it for where they live or want to move. Generating "the score" is a convenience entry point, not the mission.

Consequence for new work: **new metrics are added as context — display panels + optional toggleable map layers — NOT folded into the scored composite, the weights, or the Data Confidence scoring.** The scored composite stays the locked v1 set (Affordability/Transport/Safety/Health/Hazards/Education/Income). Context layers (Equity, Community, Environment, Politics, Data Confidence, **15-minute access / walkability / cyclability**) are first-class deliverables in their own right — the website's value is the breadth and honesty of the compiled data, not one ranking number. Every metric still needs a verified licence, a source record (version+hash), and a caveat.

---

## ⚠️ BUILD PRIORITY — read before anything (cut-line)

This plan documents the full vision. **Do NOT build it all before shipping.** The single biggest risk is never shipping because the pipeline has 25+ sources to wire. Build in this order; ship and deploy v1.0 before touching v1.x.

### v1.0 — THIN SLICE (build this end-to-end first, then deploy)
The whole vertical, but only 4 scored domains. Prove crosswalk → data → map → deploy works before scaling indicators.
1. **Crosswalk** (Sec 2) — SA2 ↔ suburb ↔ LGA. Gates everything.
2. **Scaffold + blank Melbourne map + routes** (Sec 3).
3. **Types + domain registry** (Sec 4).
4. **4 scored domains only:** Affordability (rent-to-income), Transport (GTFS precompute), Crime/Safety (property+violent split), Health (hospital+GP+NDIS proximity). v1.0 weights renormalised to sum 100: **Affordability 40, Transport 24, Crime/Safety 18, Health 18**. (Full-vision weights in Sec 1 restored as backlog domains land.)
5. **Non-residential SA2 tagging** (Sec 5.7b) — correctness, not optional.
6. **Core UI:** map-first, fuzzy search, domain sliders + URL state, transparency (sources/period/caveats), staleness badges, table fallback, colorblind palette, mobile bottom-sheet.
7. **Profile + compare + methodology + disclaimer** pages.
8. **Tests + acceptance** (Sec 7) for the 4 domains.
9. **Deploy static.** ← v1.0 done. Real users, real feedback.

### v1.x — BACKLOG (add incrementally AFTER v1.0 ships, each behind its own DoD)
Restore full weights (Sec 1 table) as domains land.
- **Scored domains:** Hazards (bushfire+flood), Education (schools/childcare/catchments), Income/economy (DHI/employment).
- **Context panels:** Equity (SEIFA, Gini), Community (migration/churn/First Nations/tenure/area-character/welfare), Politics, Environment (heat/air), Social housing.
- **Access / compilation context (NOT scored):**
  - ✅ **15-minute access** — per-SA2 straight-line reachability of everyday amenities (supermarket, pharmacy, GP, school, childcare, park, cafe/restaurant, gym/leisure) within ~1.2 km of the population-weighted centroid. Inspired by Melbourne's "20-minute neighbourhood" + Paris's "15-minute city". Emits an "N of 8 categories reachable" availability summary + a coarse **walkability index** (amenity-coverage + density blend). `WalkAccessPanel` on profiles + `pct_walkaccess` map context layer. Source: OSM (ODbL, attributed). Caveat: straight-line, not street-network; OSM coverage uneven.
  - ✅ **Cyclability index** — per-SA2 density of OSM cycling infrastructure: dedicated cycleways (`highway=cycleway`), on-road bike lanes (`cycleway=*`) and bicycle-designated paths (`bicycle=designated`), summed by length whose midpoint falls in the SA2 and divided by land area → km/km² + a coarse 0–100 saturating index. `CyclabilityPanel` on profiles + `pct_cyclability` map context layer (mutually exclusive with the other context layers). Source: OSM (ODbL, attributed). Caveat: infrastructure density, not a safety/comfort/connectivity rating; separated vs on-road lanes counted equally; OSM coverage uneven. Context only — never scored.
- **Context enrichment:** housing stress, PHIDU health outcomes, childcare deserts.
- **Persona presets** (Family/Young-professional/Retiree/Student).
- **SEO/OG + sitemap.**

### v2+ — see Sec 9 Deferred + Sec 10 National
Green space, walkability, travel-time-to-CBD, vacancy, NBN, gambling/liquor, aircraft noise, buyer mode, national expansion (jurisdiction adapters).

### Engagement / accounts / monetisation — see Sec 12
Everything stays **free** for now. Phased roadmap (localStorage personalisation → email alerts → accounts/sync → freemium + B2B area reports) lives in **Section 12**. Core map + liveability data remain static and free.

**Rule:** an indicator is not "in" until it has a verified licence, a source record (version+hash), and a caveat. No half-wired data on the map.

---

## 0. Product Decisions (locked)

- **Boundary:** ABS Greater Melbourne (GCCSA `2GMEL`). Not City of Melbourne LGA.
- **Canonical place unit:** ABS **SA2**. Suburb/locality names are *aliases* for search, resolved to SA2 via crosswalk.
- **Audience:** movers / renters. Not policymakers or investors.
- **No** database, auth, accounts, paid property APIs, AI summaries, server runtime for data. Static-first SSG.
- **Stack:** Next.js (App Router, TypeScript, SSG), Tailwind, shadcn/ui, lucide-react, MapLibre GL, Node 20.9+ (dev has v24 — fine).
- **Sources:** Australian government / official open data first. OpenStreetMap (Overpass, ODbL) only as fallback to fill POI gaps, always attributed.

---

## 1. Domain Model (the core abstraction)

A **Domain** is a thematic group of indicators. Each domain:
- has a **score** (0-100 percentile within Greater Melbourne), or is **context-only** (display, never scored),
- owns a **map layer** (choropleth and/or POI pins) toggleable spachus-style,
- carries its own **sources, period, aggregation method, caveats**.

### v1 domains + default weights (scored sum = 100)

| Domain | Weight | Scored? | Map layer | Indicators |
|---|---|---|---|---|
| **Affordability** | 30 | yes | choropleth | **scored:** rent-to-income ratio (DFFH median rent ÷ ABS median DHI). **context:** rental-stress % + mortgage-stress % (>30% income on housing, Census). |
| **Transport** | 18 | yes | choropleth + stop pins | stops within 800m, modes (train/tram/bus), AM-peak frequency |
| **Crime/Safety** | 14 | yes | choropleth + police pins | property-crime rate, violent-crime rate (sub-weighted, both shown); police station proximity (context) |
| **Health** | 14 | yes | choropleth + pins | **scored:** distance/count of public hospitals, GP clinics, NDIS providers, pharmacies(opt). **context:** population health outcomes (PHIDU Social Health Atlas — chronic disease, mental health, smoking, life expectancy); aged-care facilities (opt). |
| **Hazards** | 8 | yes | choropleth + overlay | bushfire-prone-area % of SA2, flood-overlay % of SA2 (inverted: lower risk = higher score) |
| **Education** | 8 | yes | choropleth + pins + zone overlay | school count by type (primary/secondary/combined; gov/catholic/independent), childcare count, **+ Vic school catchment zone** (findmyschool.vic.gov.au), **+ childcare-desert access (Mitchell Institute, context)**. **Access/catchment only — no quality ranking, no NAPLAN.** |
| **Income/economy** | 8 | yes | choropleth | **scored:** median DHI, employment-to-pop ratio, participation rate. **context (display-only):** unemployment rate, welfare reliance (JobSeeker %, DSP %, Age Pension %, total Centrelink-payment recipients %), pensioner %. |
| **Social housing** | 0 (context) | toggle to weight | choropleth + housing pins | social-housing tenure % (Census), DFFH social-housing stock |
| **Equity** | — | **never scored** | choropleth (separate panel) | **SEIFA** (IRSAD/IRSD/IER/IEO — canonical AU area SES index), Gini (computed from Census income brackets, approx), DHI distribution, income inequality |
| **Population/Community** | — | **never scored** | choropleth (separate panel) | born-overseas %, recent-migrant % (year of arrival), residential churn (moved last 1/5yr), net migration in/out, education attainment, language/ancestry, **First Nations (Aboriginal & Torres Strait Islander) %**, **housing tenure mix (owned outright / owned-with-mortgage / renter %)**. **No visa subclass — not available at SA2.** + **area character:** dwelling-type mix (house/townhouse/apartment %), median age + family composition, car ownership, journey-to-work mode share (all Census). |
| **Politics/Civic** | — | **never scored** | choropleth (separate panel) | dominant party + first-preference share + 2PP lean (Labor / Liberal-Coalition / Greens / Independent / other), AEC booth results aggregated to SA2. Neutral framing. |
| **Environment** | — | **never scored** | choropleth (separate panel) | extreme-heat days (BoM), air quality (EPA Victoria; bushfire-smoke season). Coarse → context only. |
| **Green space** | — | deferred v1.1 | park polygons | distance to nearest open space |

**Weights are runtime-adjustable sliders and URL-shareable** (`?w=affordability:30,transport:18,safety:14,health:14,hazards:8,education:8,income:8`). Scored domains sum to 100. Single biggest UX win. "Reset to defaults" button. Social-housing weight defaults 0; user can raise it (redistributes from 100).

### Why Equity is never in the liveability score
Gini / DHI-distribution / inequality are **not higher=better**. A high-Gini suburb is not a "worse place to move" the way high rent is. Folding inequality into a liveability rank is a category error. Show it in a dedicated **Equity panel** + optional choropleth so users can see context, but it contributes 0 to rank. Document this explicitly in `/methodology`.

---

## 2. The Hard Problem: Geometry Crosswalk (do first, gates everything)

Sources use different geographies:
- ABS income/economy/equity/tenure → **SA2** (and Mesh Block for pop weighting)
- DFFH rent, VCSA crime → **suburb (SAL) + LGA**
- Health/Education/Police/Social-housing/Green POI → **point or polygon coordinates**

SA2 ↔ suburb is **not 1:1** (a suburb spans multiple SA2; an SA2 contains multiple suburbs).

**Deliverable `crosswalk.json`:** map each SA2 to overlapping suburbs/LGAs with overlap weights.
**Aggregation rule (locked):** **population-weighted** via ABS Mesh Block population; fall back to **area-weighted** spatial intersection where pop unavailable. Every aggregated indicator records which method it used. Document in `/methodology`.

POI/point data needs **no crosswalk** — assign directly to the SA2 polygon it falls in, and compute distance from SA2 centroid for proximity metrics.

Steps:
1. ASGS SA2 (GCCSA=Greater Melbourne) + SAL (suburb) + LGA boundaries.
2. Spatial intersect SA2 × SAL with `@turf/turf` or `mapshaper -clip`; compute intersection areas.
3. ABS Mesh Block pop → assign to intersections for population weighting.
4. Emit `crosswalk.json` (`sa2 -> [{suburb, sal_code, lga, weight, method}]`) + inverse (`suburb -> [sa2...]`).

**DoD Phase 1:** weights per SA2 sum ~1.0 (tol 0.01); unit tests for a multi-suburb SA2 and a split suburb; hand spot-check Carlton (inner), Box Hill (middle), Tarneit (outer-growth).

---

## 3. Repo Scaffold

```
/app
  /(map)/page.tsx            # "/" full-screen map (default route)
  /places/[slug]/page.tsx    # place profile (SSG)
  /compare/page.tsx          # 2-4 place compare
  /methodology/page.tsx      # formula, caveats, sources, update dates, domain defs
/components
  Map, LayerToggle, SearchBox, FilterPanel, DomainSliders, ResultsList,
  ScoreBreakdown, DomainCard, SourceDrawer, StalenessBadge, EquityPanel, CommunityPanel, EnvironmentPanel, PoliticsPanel, BottomSheet
/lib
  scoring.ts    # normalization + weighted domain score (pure, tested)
  weights.ts    # parse/serialize URL weights, defaults, validation
  search.ts     # fuse.js over aliases
  domains.ts    # domain registry (id, label, sources, scored flag, layer config)
  types.ts
/scripts
  fetch.ts            # data:fetch -> data/raw (gitignored)
  build-crosswalk.ts  # Phase 1
  normalize.ts        # source files -> canonical records (incl POI precompute)
  score.ts            # percentile scores per domain
  build.ts            # data:build (runs all -> /public/data + /data/generated)
/data
  /raw         # gitignored
  /generated   # COMMITTED: places.json, indicators.json, crosswalk.json, sources.json, poi.json
/public/data   # COMMITTED served: places.geojson or places.pmtiles, poi.geojson
```

**npm scripts:** `data:fetch`, `data:crosswalk`, `data:normalize`, `data:score`, `data:build`, `dev`, `build`, `test`, `lint`.
**Commit generated assets** (deploy must not re-fetch; some sources licence-gated). Raw stays gitignored.

**DoD Phase 3:** `npm run dev` serves blank Greater Melbourne map (MapLibre, free basemap — Protomaps/Carto/MapTiler-free). Type-check + lint clean. Routes stubbed. LayerToggle renders domain list.

---

## 4. Shared Types (`lib/types.ts`)

```ts
type SourceMeta = {
  id: string; name: string; url: string; licence: string;
  period: string; fetchedAt: string;
};

type DomainId =
  | "affordability" | "transport" | "safety" | "health"
  | "education" | "income" | "hazards" | "socialHousing" | "equity" | "population" | "environment" | "politics"
  | "greenSpace";  // deferred v1.1 — type present so registry is complete

type IndicatorValue = {
  raw: number | null;
  percentile: number | null;            // 0-100 within Greater Melbourne
  method: "population-weighted" | "area-weighted" | "direct" | "proximity" | null;
  sourceId: string;
  missing: boolean;
  stale: boolean;
};

type DomainScore = {
  domain: DomainId;
  scored: boolean;                       // equity=false
  percentile: number | null;
  subIndicators: Record<string, IndicatorValue>;  // e.g. safety: {propertyCrime, violentCrime, policeProximity}
};

type Place = {
  sa2Code: string; slug: string; name: string;
  lga: string; suburbAliases: string[];
  centroid: [number, number];
  domains: Record<DomainId, DomainScore>;
};

type Poi = {
  id: string; type: "hospital"|"gp"|"ndis"|"pharmacy"|"school"|"childcare"|"police"|"socialHousing";
  name: string; coord: [number, number]; sa2Code: string; sourceId: string;
};

type ScoreWeights = Partial<Record<DomainId, number>>;  // scored domains sum 100; equity excluded
type ScoreBreakdown = {
  total: number;
  components: { domain: DomainId; weight: number; percentile: number|null; contribution: number; missing: boolean }[];
};
```

---

## 5. Data Pipeline

### 5.1 Licence gate (BLOCKING, before committing ANY derived data)
Record licence per source in `sources.json`. Verify redistribution of derived data is permitted.
- **ABS** (boundaries, Data by Region, Census, Mesh Block pop): CC BY 4.0 — OK + attribute.
- **DFFH rent / social-housing stock:** verify data.vic licence before committing.
- **VCSA crime:** verify CSA / data.vic terms.
- **PTV GTFS:** verify; ship only derived scalars.
- **ACARA schools / ACECQA childcare:** verify terms.
- **DSS Payment Demographic Data** (Age Pension, JobSeeker, DSP, etc.): data.gov.au, CC BY — OK + attribute. Note small-cell suppression.
- **Health POI** (data.vic hospitals, NHSD/Healthdirect GP, NDIS provider data): verify each; some directories restrict bulk reuse.
- **Vic Police station locations:** verify data.vic.
- **Hazards** (CFA/DELWP bushfire-prone-area mapping; VICSES/Melbourne Water flood overlays): data.vic — verify, attribute.
- **SEIFA** (ABS Socio-Economic Indexes for Areas): CC BY — OK + attribute.
- **School catchment zones** (Vic DET / findmyschool.vic.gov.au): verify reuse terms.
- **Environment** (BoM extreme-heat/climate; EPA Victoria air quality): verify terms, attribute.
- **AEC election results** (booth-level first-pref/2PP + booth locations): CC BY — OK + attribute. National.
- **PHIDU Social Health Atlas** (population health outcomes by area): verify licence/attribution.
- **Mitchell Institute childcare deserts** (SA2): verify reuse terms, attribute.
- **Vic Gambling Commission** (EGM/pokies, losses) + **liquor outlets** (data.vic): verify, attribute. [optional]
- **Airservices Australia** (ANEF aircraft-noise contours): verify terms. [optional]
- **Vic Valuer-General / data.vic property sales** (median sale prices): verify. [buyer mode, deferred]
- **OpenStreetMap (fallback POI):** ODbL — attribute + note sharealike on derived DB.

If a source forbids redistributing derived data: fetch on dev machine at build, commit only if allowed, else fetch-on-build and document.

### 5.2 POI precompute (Health, Education, Police, Social-housing pins)
Same pattern as GTFS — never ship bulky raw directories. Per SA2 compute and store scalars:
- **Health:** distance to nearest public hospital; count GP clinics within 2km; count NDIS providers within 5km; (pharmacies optional).
- **Education:** count schools within 2km by type (primary/secondary/combined) and sector (gov/catholic/independent); count childcare within 2km. **No quality/NAPLAN.**
- **Crime/Safety:** distance to nearest police station (context sub-indicator).
- **Social housing:** social-housing tenure % (Census, SA2 direct); DFFH stock count nearby (context).
Also emit `poi.json` / `poi.geojson` of individual points for map pins (filtered to Greater Melbourne) where licence allows.

### 5.3 Transport (GTFS) precompute
Full PTV GTFS 100MB+. Per SA2: stops within 800m, modes available, AM-peak frequency at nearest stops. Discard raw.

### 5.4 Crime subtypes (Crime/Safety domain)
VCSA offence data split into:
- **Property crime:** burglary, theft, motor-vehicle theft, property damage.
- **Violent/person crime:** assault, robbery, sexual offences.
- (drug / public-order = "other", optional display.)
Safety score = sub-weighted property + violent percentiles, **both displayed separately**. Police-station proximity = context sub-indicator (not heavily weighted).
**Required caveat:** resident-population crime rates overstate inner-city areas with large daytime worker/visitor populations. Show wherever a safety score appears.

### 5.4b Hazards (scored domain — bushfire + flood)
Polygon overlays intersected with SA2 (no crosswalk; spatial intersect like green space).
- **Bushfire:** CFA/DELWP Bushfire-Prone Area (BPA) mapping. Compute % of SA2 area inside BPA.
- **Flood:** VICSES / Melbourne Water flood-overlay polygons (e.g. LSIO/SBO planning overlays). Compute % of SA2 area inside flood overlay.
- Score = inverted percentile (more area at risk = lower score). Sub-weight bushfire + flood within domain.
- **Caveat (required):** these are **regulatory planning overlays, not probabilistic risk models** — they flag designated-risk land, not insurance-grade likelihood. Coarse; an SA2 may be partly overlaid yet most dwellings unaffected. State clearly wherever hazard score shows.

### 5.4c Housing stress + area character + health outcomes (context, display-only)
- **Housing stress** — Census: % of renting households paying >30% income on rent (rental stress); % of mortgaged households paying >30% (mortgage stress). The AU-standard affordability lens; show in Affordability breakdown as context. Not double-counted into the scored rent-to-income ratio.
- **Area character** — Census (SA2 direct): dwelling-type mix (separate house / townhouse / apartment %), median age + family/household composition, car ownership (vehicles per dwelling), journey-to-work mode share (drive/PT/walk/cycle). CommunityPanel. Pairs with personas.
- **Population health outcomes** — PHIDU Social Health Atlas: chronic disease, mental health, smoking, obesity, immunisation, life expectancy by area. Health domain context (distinct from facility access). Caveat: PHIDU geography may be PHA/SA3, not always SA2 — map to SA2 where possible, else label the geography.
- **Childcare deserts** — Mitchell Institute access-vs-demand ratio per SA2. Education context.

### 5.5 Affordability vs Income (no double-count)
- **Affordability (30%)** = median rent ÷ median DHI (rent-to-income ratio). Lower = more affordable = higher score.
- **Income/economy (8%)** = median DHI percentile + employment-to-pop ratio + participation rate. Distinct standing measure, NOT the ratio. Document the distinction in `/methodology`.

### 5.5b Economic activity / welfare (Census + DSS, scored-core + context)
- **Scored (in Income/economy):** employment-to-population ratio, labour-force participation rate — Census 2021 (SA2).
- **Context (display-only, never scored — welfare reliance is not higher=better):**
  - unemployment rate (Census).
  - **Welfare/Centrelink reliance** — **DSS Payment Demographic Data** (data.gov.au, quarterly, CC BY): recipient counts by SA2 for JobSeeker, Disability Support Pension, Parenting Payment, Carer, Youth Allowance, **Age Pension** (pensioners).
  - pensioner % = Age Pension recipients ÷ 65+ population.
- **Denominator gotcha:** DSS publishes COUNTS, not rates. Convert to % using ABS ERP/Census population — age-appropriate denom: Age Pension over 65+ pop; JobSeeker/DSP over working-age (15-64) pop; total payments over total pop. Record method.
- **Caveat:** DSS payment geography may suppress small cells (privacy) → some SA2 missing; mark `missing:true`. Display in CommunityPanel under an "Economic activity" subsection.

### 5.6 Equity panel (computed, display-only)
- **Gini:** ABS publishes Gini mainly at SA4/Greater-Capital, not SA2. Compute **approximate SA2 Gini from Census income brackets**. Caveat: bracket-derived = approximate, label clearly.
- **DHI distribution:** spread of equivalised disposable household income across brackets.
- **Income inequality:** ratio metrics (e.g. P80/P20) from brackets where derivable.
Display in EquityPanel + optional choropleth. **Weight 0, never in liveability score.**

### 5.6b Population/Community context (Census + Regional Population, display-only)
Demographic context, **never scored** (born-overseas % is not higher=better — category error, same as equity). SA2 sources:
- **Born overseas %**, top countries of birth, ancestry, language at home, citizenship — Census 2021 (SA2).
- **Recent-migrant %** — derived from Census *year of arrival* (e.g. arrived in last 5 yr).
- **Residential churn** — Census *address 1yr ago / 5yr ago* → % moved in. Strong transience signal for renters.
- **Net migration in/out** — ABS Regional Population components of change (net internal + net overseas). LGA solid; SA2 with caveats. Annual, more current than Census.
- **Education attainment** — highest qualification (bachelor+ %), schooling level — Census (SA2).
- **Visa subclass: NOT AVAILABLE at SA2.** Census doesn't collect visa class; Home Affairs visa data is national/state/SA4 only. Do not fabricate. Proxy only via citizenship + year-of-arrival + country-of-birth, clearly labelled as proxy.
- **First Nations %** — Aboriginal & Torres Strait Islander population share, Census (SA2). AU-specific demographic context; present factually, no value judgement.
- **Caveat:** Census 2021 is 5yr old; next census Aug 2026. Flag with StalenessBadge (census-derived >5yr).
Display in CommunityPanel + optional choropleth.

### 5.6c Australian-specific layers (context, display-only unless noted)
- **SEIFA (ABS):** load IRSAD/IRSD/IER/IEO deciles per SA2 directly (no computation). Canonical AU area SES index. Show in EquityPanel as the headline SES measure (Gini stays the secondary, approx measure). Not scored.
- **School catchment zones (Vic DET, findmyschool):** polygons; for each SA2 determine the dominant primary + secondary catchment by area overlap. Show as Education layer overlay + on place profile ("zoned for X Secondary College"). Not scored (zone != quality). Caveat: zones change yearly; stamp the zone year.
- **Environment (BoM + EPA Vic):** extreme-heat-days count + typical air-quality band per SA2 (nearest monitoring station; coarse). EnvironmentPanel, display-only. Caveat: station density is sparse → spatially approximate.

### 5.6d Tenure + Politics (context, display-only — never scored)
- **Housing tenure mix** — Census 2021 (SA2 direct): % owned outright, % owned with mortgage, % rented, % other. Show in CommunityPanel housing subsection (sits naturally next to social housing). Renter % is a key audience signal but stays context, not a "better/worse" judgement.
- **Political leaning** — AEC federal results: take booth-level first-preference + 2PP, aggregate booths falling within each SA2, vote-weighted → dominant party, Greens share, Independent/other share, 2PP lean. Show in **PoliticsPanel**.
  - **Neutral framing only.** No "good/bad", no score contribution. Factual shares + clear "context, not part of liveability score" label.
  - **Caveats (display):** (1) electoral divisions != SA2 — booth aggregation is approximate; (2) pre-poll/postal votes (now a large share) are division-located, not booth — assign at division level and note coverage; (3) results are point-in-time (last federal election) — stamp the election year; redistributions shift boundaries.
  - National-ready: AEC is all-Australia. State election leaning (VEC etc.) is a per-jurisdiction add → adapter, deferred.

### 5.7 Normalization (`scoring.ts`, pure + tested)
- Percentile-rank each indicator **within Greater Melbourne** (relative, not absolute — state caveat; outer-growth areas always rank low on transport).
- Invert where higher=worse (rent, crime).
- Missing data: `percentile=null`, excluded from weighted total, weight redistributed proportionally across present scored domains; show missing-data warning.
- Domain score = sub-weighted combination of its indicators' percentiles.

### 5.7b Non-residential / low-population SA2 handling (correctness — do not skip)
Greater Melbourne has SA2s that are airport, parkland, industrial, water, or CBD-non-residential with near-zero resident population. These distort percentiles and choropleth.
- Tag each SA2 with `nonResidential: true` when ERP/Census population < threshold (e.g. < 200) or ABS SA2 type flags it.
- Exclude tagged SA2 from percentile baselines and from ranked results; render on map as a distinct "no resident data" fill, not a misleading score.
- Document the exclusion list in `/methodology`.

### 5.8 Map geometry budget
Simplify SA2 with `mapshaper` (topology-preserving `-simplify` + `-clean`), target total geometry **< 2MB**; else convert to **PMTiles** (served static, no tile server). Centroids/labels in `places.json` separate from polygons. POI pins clustered client-side.

### 5.9 Data manifest + reproducibility + refresh runbook
- **Manifest:** every source in `sources.json` records dataset version/edition, exact download URL, `fetchedAt`, and **file hash (sha256)** of the raw file. Build fails loudly if a re-fetched file's hash is unexpected (detect silent upstream changes).
- **Per-place data-completeness:** compute `coverage = present indicators / total`; store on `Place`; surface as a badge ("8/10 indicators present").
- **Refresh runbook** (`/docs/REFRESH.md`): step-by-step to rebuild when DFFH drops a new rent quarter, VCSA new crime year, DSS new quarter, ABS new release. Static product = update discipline matters.

**DoD Phase 5:** `npm run data:build` runs end-to-end raw→committed artifacts. Every scored domain has values for every Greater Melbourne SA2 + sub-indicators. Crime split property/violent. Equity computed + flagged display-only. Every value carries sourceId, period, method, missing, stale. `sources.json` complete with **verified licences**. Geometry <2MB or PMTiles. Tests: parsing, slug gen, percentile, missing-data redistribution, crosswalk sums, crime-subtype split, Gini calc. Fixtures: Carlton / Box Hill / Tarneit.

---

## 6. UI / UX

### 6.1 Map-first, mobile-first
- `/` opens full-screen MapLibre map. No landing page.
- **Mobile:** full-screen map + **bottom sheet** (search/filters/results, drag to expand). Mobile-first; scale to desktop split (map left, results right).
- Active-domain choropleth fill; tap place → mini DomainCard → profile link.

### 6.2 Layer toggle (spachus-style)
- **LayerToggle** lists every domain. Toggle choropleth basis + POI pin layers (hospitals, GP, NDIS, schools, childcare, police, social housing). Multiple pin layers stackable; cluster at low zoom.

### 6.3 Search
- **Fuzzy suburb search** (`fuse.js`, client-side, over `suburbAliases`), typo-tolerant. Suburb→SA2 via crosswalk; if suburb maps to multiple SA2, show all.

### 6.4 Domain sliders + URL state + presets
- Slider per scored domain; live re-color + re-rank (client recompute via `scoring.ts`). Social-housing slider starts 0. Serialize to URL, restore on load, reset button.
- **Persona presets** (Microburbs/Niche-style): one-tap buttons that set the slider weights — "Family" (education/health/safety up), "Young professional" (transport/affordability up), "Retiree" (health/safety/quiet up), "Student" (affordability/transport up). Presets are just named `ScoreWeights` in `lib/weights.ts`; selecting one updates sliders + URL. Cheap, high-impact mover UX.

### 6.5 Transparency (non-negotiable)
- Every score shows: domain weights, sub-indicator raw values, percentile, source + period, aggregation method, and caveats (crime daytime-pop, percentile-relativity, Gini-approx, missing-data, staleness).
- **StalenessBadge:** rent >6mo, crime >18mo, census-derived >5yr → "data as of X".
- **SourceDrawer:** per-indicator source URL, licence, period, fetch date.
- **EquityPanel:** **SEIFA (headline)** + Gini/DHI-dist/inequality, explicit "context only, not in score" note.
- **CommunityPanel:** born-overseas %, recent-migrant %, residential churn, net migration, education attainment, language/ancestry, **First Nations %**, **housing tenure mix**, **area character** (dwelling type, median age, family composition, car ownership, journey-to-work mode), + **Economic activity subsection** (unemployment, welfare/Centrelink reliance, pensioner %) — all labelled "context only, not in score"; visa shown only as labelled proxy or omitted; Census-staleness badge.
- **EnvironmentPanel:** extreme-heat days + air-quality band, "context only, spatially approximate" note.
- **PoliticsPanel:** party first-pref / Greens / Independent shares + 2PP lean, election year stamped, "context only, not in score" + booth-aggregation/pre-poll caveats. Neutral, factual presentation.
- **Data-completeness badge:** per place show coverage ("8/10 indicators present"); flag low-coverage places.
- Footer: global attribution (incl OSM ODbL where used) + link to disclaimer.

### 6.6 Color + accessibility (cheap, do it right)
- **Colorblind-safe palette** (ColorBrewer/viridis); sequential for single-domain, diverging only where a midpoint is meaningful. Explicit distinct **"no data" / non-residential** color. Always show a **legend**.
- **Table fallback / a11y:** map alone is inaccessible and non-indexable. Provide a sortable **data-table view** of ranked places (also works without JS, helps SEO). Keyboard-navigable controls; WCAG AA contrast; `aria` on map controls.

### 6.7 Routes
- `/` map + search + filters + sliders + layer toggle + ranked results + table-view toggle.
- `/places/[slug]` profile: total score + per-domain breakdown, sub-indicators, mini-map, POI nearby, sources, caveats, equity + community context, completeness badge.
- `/compare` 2-4 places side-by-side; per-domain rows; readable on mobile (h-scroll or stacked).
- `/methodology` formula, domain defs, percentile-relativity, crosswalk aggregation rule, crime caveat, hazard-overlay caveat, Gini-approx caveat, equity/community-excluded rationale, non-residential exclusions, per-source licences + update dates.
- `/disclaimer` not relocation/financial advice; data approximations + caveats; licences.

### 6.8 SEO + sharing (near-free growth via SSG)
- Per-place static pages with `generateMetadata`: title, description, **OG image** ("Carlton liveability score"). Sitemap.xml of all places. Canonical URLs. This is how analisa-style sites win organic search.

### 6.9 Analytics
- Privacy-friendly (Plausible/Umami), no PII, to learn searched suburbs + toggled layers.

**DoD Phase 6:** typo search works; slider re-ranks live; weights round-trip URL; layer toggles show/hide pins + switch choropleth; profile/compare/methodology render; every indicator shows source+period+caveat; staleness badges appear; equity clearly excluded from score.

---

## 7. Testing

- **Unit:** source parsing, slug gen, percentile normalization, scored-weights=100, missing-data redistribution, crosswalk weight sums, crime-subtype categorization, Gini-from-brackets, URL weight round-trip, domain sub-weighting.
- **Fixtures:** Carlton (inner), Box Hill (middle), Tarneit (outer-growth) — reproducible breakdowns.
- **UI/integration:** search, profile nav, compare, slider→rerank, layer toggle, methodology links, equity panel.
- **Browser (desktop+mobile):** map non-blank; controls don't overlap; long names fit; compare readable; bottom sheet works; pin clusters render.

**Acceptance criteria:**
1. Every displayed indicator has source, period, caveat where needed.
2. Every ranked place has a reproducible breakdown.
3. Weights slider-adjustable + URL-shareable.
4. Equity metrics never contribute to liveability rank.
5. No source licence violated by committed/derived data.

---

## 8. Build Order (FULL-VISION phase gates)
> **NOTE:** the BUILD PRIORITY cut-line at the top of this doc is authoritative for *what ships when* (v1.0 thin slice first). This section is the full-vision dependency order once you go past v1.0.
1. **Crosswalk** (Sec 2) — gates all data.
2. **Scaffold + blank map + layer toggle shell** (Sec 3).
3. **Types + domain registry** (Sec 4).
4. **Licence gate + data pipeline** (Sec 5): affordability, transport, crime-split, health POI, education POI, hazards, income+welfare, social-housing, equity (SEIFA+Gini), community (+tenure/area-character), politics, environment; non-residential SA2 tagging; data manifest+hashes.
5. **UI** (Sec 6): map-first, search, sliders + presets, layer toggle, transparency (all panels), table fallback, colorblind palette, SEO, mobile.
6. **Tests + acceptance** (Sec 7).
7. **Deploy** static (Vercel/Cloudflare Pages/Netlify); committed artifacts → no fetch at deploy.

## 9. Deferred (v1.1+)
- **Green space** domain (open-space polygons, distance-to-park).
- **Travel-time to CBD / job access** (Transport sub-indicator): GTFS-derived PT minutes to Flinders St + isochrones. Needs routing/precompute.
- **Rental vacancy rate** (Affordability): DFFH bond-lodgement / vacancy data — renter availability signal.
- School/childcare **quality** signals (v1 is access-only).
- Pharmacies, additional health POI depth.
- Absolute thresholds alongside percentiles.
- **NBN connection type** (FTTP/FTTN/fixed-wireless) per SA2 — AU infra, WFH signal. Address-level → aggregate dominant tech.
- **Council rates by LGA** — Affordability cost context (AU rates system).
- **Distance to bay/beach/foreshore** — Melbourne bayside amenity layer.
- **Pokies (EGM) density + gambling losses + liquor-outlet density** — Vic Gambling Commission / data.vic; social-harm context (differentiator, sensitive).
- **Aircraft noise (ANEF contours, Airservices)** — environment/hazard context near airports.
- **Family-violence rate** (VCSA separate) — crime sub-context; sensitive, neutral framing.
- **Tree canopy cover** — heat-island/greening, pairs with Environment + green space.
- **Median sale prices** (Vic Valuer-General) + development/planning-permit pipeline — buyer mode.
- Buyer mode: stamp duty / first-home-buyer / land tax (v1 is renter-focused).
- **Walkability score** (Walk Score-style) — ✅ shipped as a context-only walkability index inside the 15-minute access layer (OSM amenity coverage + density). NOT scored. Street/intersection-density refinement still open.
- **Cost-of-living beyond rent** (Numbeo-style) — groceries/transport cost context.
- **Resident reviews** (Homely-style UGC) — needs DB + moderation; breaks static-only model.
- Expansion beyond Melbourne → see Section 10.

---

## 10. National expansion architecture (DESIGN NOW, build Melbourne only)

We ship Greater Melbourne first but the codebase goes Australia-wide. Bake these abstractions in v1 so adding a state = config + adapter, not a rewrite. Do NOT build other states' data now — just don't hardcode against Victoria.

### 10.1 National vs state-specific sources
- **National (scale free, already AU-wide):** ABS — ASGS boundaries/SA2, Census (incl. tenure), SEIFA, DSS payments, Regional Population, Mesh Block pop. AEC federal election results (booth-level). PTV GTFS pattern generalizes (every state has GTFS). ACARA schools (national). NDIS (national).
- **State/jurisdiction-specific (need per-state adapter):**
  | Domain | Vic (v1) | Needs equivalent for NSW/QLD/SA/WA/TAS/ACT/NT |
  |---|---|---|
  | Rent | DFFH Rental Report | NSW Rent & Sales, QLD RTA bonds, etc. |
  | Crime | VCSA | BOCSAR (NSW), QLD Police, etc. — **categories differ per state; map to common property/violent taxonomy** |
  | Police stations | Vic Police (data.vic) | per-state open data |
  | Bushfire/flood | CFA/DELWP + VICSES/Melb Water | RFS (NSW), QFES (QLD), state SES |
  | Air/climate | EPA Victoria | EPA per state + BoM (national) |
  | School catchments | Vic DET findmyschool | per-state education dept |

### 10.2 Jurisdiction adapter pattern
- Define `interface JurisdictionAdapter` with methods: `fetchRent()`, `fetchCrime()` (→ common taxonomy), `fetchPolice()`, `fetchHazards()`, `fetchAirQuality()`, `fetchCatchments()`. Each returns canonical records keyed by SA2/suburb.
- `adapters/vic.ts` is the only implementation in v1. Registry: `jurisdiction -> adapter`.
- **Crime taxonomy normalization** is the hard cross-state problem (each state classifies offences differently). Define a canonical property/violent/other mapping; each adapter maps its state's categories into it. Document the mapping.

### 10.3 Parametrize the region
- No hardcoded `2GMEL`. Pipeline takes `--region <GCCSA|SA4 code>`; `data:build --region=2GMEL`. Config lists active regions. Slug namespace stays national-unique (SA2 codes are unique AU-wide).

### 10.4 Scale implications
- National ~2,400+ SA2 vs ~300 for Melbourne. The <2MB geometry budget will NOT hold nationally → **PMTiles becomes mandatory** at national scale, and the static-JSON-per-everything approach may need per-region splitting or a lightweight tile/data backend. Note the threshold; revisit PostGIS/DB when going multi-state.
- Percentile baseline decision at national scale: rank **within metro/GCCSA** (default) vs **nationally**. Keep per-region percentile as default; expose national as option. Document — a Melbourne suburb's transport percentile means something different against Sydney than against rural NT.

---

## Top risks
1. **Geometry crosswalk** — Phase 1 de-risks (underestimated originally).
2. **POI + GTFS size** — precompute scalars, ship pins only where licence allows, never raw dirs.
3. **Licence** — verify redistribution per source before committing (esp. health directories NHSD/NDIS, VCSA, DFFH).
4. **Gini at SA2** — not published; computed-from-brackets approximation; label clearly.
5. **Scope creep** — 7 scored domains + 5 context layers (Equity, Community, Politics, Environment, Social-housing) is a lot for MVP. **See BUILD PRIORITY cut-line (top of doc) — it is authoritative.** Ship v1.0 thin slice (afford/transport/safety/health) first; everything else is backlog.
6. **Hazard overlays** — regulatory overlays != probabilistic risk; coarse at SA2; caveat hard.
7. **Non-residential SA2** — must tag/exclude airport/parkland/industrial or percentiles + map mislead.
8. **Victoria hardcoding** — keep jurisdiction adapter boundary clean (Sec 10) or national expansion = rewrite.

---

## 11. Reference sites (study for UX + methodology, not to copy)

**Primary inspiration:** analisa.pt (map-first, transparent scoring), spachus.com.au (layer toggles).

**AU analogs:**
- **Microburbs** — multi-score suburb profiles + lifestyle personas (→ persona presets).
- **Australian Urban Observatory (RMIT)** — academic liveability index, AU suburbs; best methodology reference.
- **profile.id / community.id / economy.id** — gold-standard AU demographic dashboards (→ context-panel presentation).
- **Domain / realestate.com.au** suburb profiles — mainstream AU expectations.
- **Homely** — qualitative resident reviews (→ future UGC).

**International concept/UX:**
- **AreaVibes** (US) — 0-100 category livability score; near-identical concept.
- **Niche** (US) — category grades + polished UX bar.
- **CrystalRoof / StreetCheck** (UK) — comprehensive per-postcode profile; template for `/places/[slug]`.
- **Nomad List** — mover slider/filter UX.
- **Numbeo** — cost-of-living + QoL indices (→ cost-of-living-beyond-rent).
- **Walk Score** — walkability metric (→ deferred walkability indicator).

---

## 12. Engagement, accounts & monetisation roadmap (POST-v1.x)

**Status:** agreed direction (2026-05-30). **Everything ships free for now.** These phases are added incrementally only after the data product is solid; each behind its own DoD.

> ⚠️ **This intentionally revises a §0 "locked" decision.** §0 says *no database, auth, accounts, paid APIs, server runtime — static-first*. The core map + all liveability data stay **static and free** (it's a movers' public good and our SEO engine). Accounts/payments are added as a **thin, separate service** layered on top so the data site stays static. Do not introduce a server runtime for the data pipeline.

### Guiding principles (non-negotiable)
- **Free core, forever:** full map, all scored domains, methodology, data-confidence, per-suburb profiles. Never paywall core liveability *facts* (safety, affordability, hazards) — exploitative for a relocation tool and it kills SEO/virality.
- **Sell the experience, not the data.** Sources are CC BY open-government data: we may build a paid product on them and must **retain attribution**, but we charge for tooling/convenience/derived analysis — not for reselling ABS/VCSA data, and never implying official endorsement.
- **Personalisation is the spine.** Personas (Family / Young-pro / Retiree / Student + interest views: rental, education, **data-quality**) drive layout, default map layer, re-weighting, and profile emphasis.
- **Privacy = obligation, not checkbox.** The moment we collect email/payment we become a **data controller under the Australian Privacy Act (APPs)** → privacy policy, consent, secure storage, breach plan. Gate Phase B on this.

### Phase A — Engagement, **zero backend** (do first; stays fully static) ✅ SHIPPED
- ✅ **localStorage personalisation:** persona, weights, recently-viewed, suburb shortlist (`lib/user-prefs.ts`).
- ✅ **Shareable views:** URL `w`, `list`, `view`, `persona` + Copy link (`lib/share-url.ts`, `ShareViewButton`).
- ✅ **SEO as top-of-funnel:** 354 SSG suburb pages + sitemap + OG (maintain).
- ✅ **Email capture without accounts:** `/alerts` page; Formspree via `NEXT_PUBLIC_FORMSPREE_ALERTS_ID` or local save; ties to monthly `data-refresh` CI.
- ✅ **Interest views / persona dashboards:** Balanced, Renting, Education, Data quality (`lib/interest-views.ts`) — default layer + weights + confidence mode.
- **DoD:** retention/return-visit + shortlist-usage metrics show traction before Phase B (measure in analytics when enabled).

### Phase B — Accounts & sync (only if Phase A retention proves out)
- Thin hosted auth+DB (e.g. **Supabase / Clerk + Postgres**) to **sync** shortlists/personas/dashboards across devices. Core map stays static and free.
- Privacy policy + consent + secure storage live (APP compliance). Still **free**.

### Phase C — Freemium + B2B
- **Free:** full map, all domains, methodology, data confidence, basic compare (≤3), 1 shortlist.
- **Paid (small $/mo or $/yr):** unlimited named persona dashboards (synced), multi-suburb compare (5–10), **exportable PDF/CSV suburb report card**, shortlist update-alerts, saved searches, trend view (when time-series lands).
- **B2B / B2G (likely the real revenue):** authoritative, sourced, exportable **area report cards** for councils, MPs' offices, journalists, relocation/real-estate firms — the "politicians checking their area" + data-quality angle monetises far better than $3/mo consumers. Price-test early.
- Payments via Stripe through a serverless function called client-side; **never** add a server runtime to the data build.
