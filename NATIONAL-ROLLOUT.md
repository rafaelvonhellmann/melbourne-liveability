# National Rollout Runbook (2026-06-12)

Executable plan for Fable / Opus 4.8 sessions. Source of truth for region order, per-state
data modules, effort, and acceptance gates. Supersedes the ordering notes in REGION-ROLLOUT.md;
that doc remains authoritative for the registry/app-seam architecture.

## State of play (verified on production 2026-06-12)

- LIVE: Melbourne (361 SA2, 7/7 domains), Sydney (Tier-A, baked 766fab4), Canberra (134 SA2, Tier-A).
- Tier-A = national sources only (ABS + OSM): scores 5 of 7 domains. **Safety and hazards are
  unscored outside VIC** - they need per-state Tier-B modules.
- Pipeline is fully region-parameterized (lib/regions.ts registry + PIPELINE_REGION). A new
  capital Tier-A bake is one workflow dispatch, 15-40 min, zero code.

## Rollout order

### Phase R0 - Tier-A presence, all capitals (this week, zero code)

Dispatch data-refresh one at a time, in this order (market heat x size):

1. Brisbane  (3GBRI, ~290 SA2, ~60-70 min)
2. Perth     (5GPER, ~145 SA2, ~35-45 min)
3. Adelaide  (4GADE, ~125 SA2, ~30-40 min)
4. Hobart    (6GHOB, ~50 SA2, ~15-20 min)
5. Darwin    (7GDAR, ~30 SA2, ~10-15 min)

Per bake: dispatch -> SHA-watched deploy -> verify-live probe -> switcher flips automatically.
When Darwin lands: flip the landing honesty line ("all 8 capitals").

### Phase R1 - Tier-B quality parity, by market heat

Market heat (mid-2026, Cotality/SQM/KPMG): Darwin and Perth hottest momentum, Brisbane hottest
heat-x-size (Olympics build accelerating, #1 interstate migration 4 yrs running, ~1.0% vacancy),
Sydney coldest momentum but biggest audience and best open data. Darwin is market-hottest but
data-poorest - do not lead with it.

Order: **Brisbane -> Perth -> Sydney -> Adelaide -> Hobart -> Darwin**, plus a Canberra quick win.
Exception rule: NSW BOCSAR crime is so cheap (~1-2 days, best dataset in AU) it may jump the
queue whenever a session has slack.

## Per-region Tier-B modules

Effort in focused Fable sessions (1 session ~ half a day equivalent).

### Cross-cutting first (do once, unlocks every region)

| Module | What | Effort |
|---|---|---|
| GTFS generalization | precompute-gtfs.ts beyond PTV; registry already has stateSources.gtfsUrl. All six capitals have open GTFS (TfNSW, Translink, Transperth, Adelaide Metro, Metro Tas, NT DLI). | 1 session once, then ~0.5/region |
| Crime module interface | normalize.ts: replace IS_VIC crime branch with per-state adapter (source id, geography level, join key). | 1 session |
| Hazards module interface | same pattern for bushfire/flood overlays | 1 session |
| Per-region sources.json | hash-sources.ts currently DEFAULT_REGION-only; per-region provenance manifests for the trust drawer | 1 session |
| Per-region e2e + verify-live | smoke spec per live region (?region= load, choropleth paints, switcher state) | 1 session |

### Brisbane (QLD) - first
- Crime: QPS open data, LGA-level CSVs monthly + crime locations point data (5yr). data.qld.gov.au. ~1-2 sessions.
- Hazards: SHIPPED (scripts/lib/hazard-adapters.ts QLD adapter). Bushfire = QFES SPP Bushfire Prone Area statewide, bbox-clipped; flood = BCC City Plan 2014 flood overlay (river + creek/waterway + overland flow), Brisbane LGA ONLY - SA2s mostly in Moreton Bay/Logan/Ipswich/Redland etc. keep floodPct missing (null). Moreton Bay publishes open ArcGIS flood/overland overlays (services-ap1.arcgis.com/152ojN3Ts9H3cdtl OM_Flood_Hazard / OM_Overland_Flow) but the categories need mapping before mixing into one percentile pool - next increment.
- GTFS: Translink. ~0.5 session after generalization.
- Zoning context: BCC City Plan zoning shapefile (open) - context layer only.
- Watch: no statewide beach-water program (council patchwork) - skip beach card.

### Perth (WA)
- Crime: **DONE** - WA Police recorded offences by locality, pulled from the crime
  statistics portal's public Power BI report (NOT the district-only bulk XLSX, and NOT
  1,700 HTML pages). The publish-to-web report is backed by an unauthenticated
  `/public/reports/querydata` JSON API: POST a semantic query with the report's public
  resource key and read the model's locality x offence-category x month grain directly.
  Wired as the `wa` crime adapter (scripts/lib/wa-crime.ts, sourceId
  `wa-police-suburb-offences`); rolling 12 months, statewide (1,641 WA localities, ~1,233
  with offences), reusable for any future regional WA bake. Classification: "Selected
  Offences Against the Person" -> violent, "Selected Offences Against Property" ->
  property; "Detected Offences" + "Miscellaneous Offences" excluded (police-detected /
  catch-all, same discipline as VIC/ACT/QLD/NSW). WA gazetted localities are unique
  statewide (verified: 0 cross-district name collisions), so the join is bare-name like
  ACT - no namesake guard needed. Cache: data/raw/wa-crime-cache/wa-crime-YYYY-MM.json
  per immutable month, so monthly CI re-fetches only the newest month (cold start = 13
  requests: 1 month-list + 12 months, ~0.5s throttle).
  - **LICENCE FLAG (founder action before commercial launch):** the portal page
    (wa.gov.au) carries the generic WA Government Terms of Use, which permit attributed
    personal / non-commercial / in-organisation reuse but require WRITTEN PERMISSION for
    commercial use. The data.wa.gov.au WA Police org otherwise publishes CC BY 4.0, but
    no CC BY catalogue entry was found for the suburb crime series. Provenance recorded
    honestly in sources.json with a verifyNote. Confirm commercial-reuse permission
    (email WA Police, or locate a CC BY entry) before commercial launch - unlike the
    NSW/QLD/ACT crime sources, this one is NOT confirmed open for commercial use.
  - First perth bake watch: CI's `data:fetch` runs the FULL cold pull (13 PBI requests).
    Watch the first run for rate-limit/timeout behaviour on the Power BI public endpoint.
- Hazards: DFES bushfire prone areas (open), DoT/DWER flood mapping. ~2 sessions.
- GTFS: Transperth. ~0.5.
- Schools: NO open catchments (per-school PDFs - acknowledged state gap). Education stays proximity-based; do not hand-digitise.
- BONUS: City of Perth open 3D model (7.5cm, OBJ/FBX/Cesium tiles, CBD LGA only) - sun-shadow showcase better than Melbourne's CoM data in the CBD. Optional 1-2 sessions, great marketing asset.

### Sydney (NSW) - best data in the country
- Crime: **DONE** - BOCSAR suburb-level monthly incidents (SuburbData.zip, CC BY 4.0) wired as
  the `nsw` crime adapter (scripts/lib/nsw-crime.ts, sourceId `bocsar-suburb-offences`); rolling
  12 months, statewide, reusable for Newcastle/Wollongong/Northern Rivers.
- Hazards: ePlanning EPI layers - flood planning, bushfire prone land (statewide open GIS). ~2 sessions.
- GTFS: TfNSW complete feed (very large - watch precompute memory/time). ~0.5-1.
- Beach: Beachwatch NSW (formal program, machine-readable) - beach card parity with Melbourne. ~1.
- Price context: Valuer-General bulk PSI, free, weekly, back to 1990 - BETTER than VIC source. ~1-2.
- 3D: City of Sydney model is licence-locked (AAM). Use ELVIS LiDAR-derived heights or OSM. Do not use CoS model.

### Adelaide (SA)
- Crime: SAPOL on Data.SA, suburb/postcode CSV 10+ yrs (sexual offences excluded at suburb level - footnote it). ~1 session.
- Hazards: PlanSA Planning and Design Code overlays (statewide single code - easiest scheme in AU). ~1-2.
- GTFS: Adelaide Metro. ~0.5.
- Price context: open suburb medians quarterly (Data.SA). ~1.
- Watch: air network sparse (CBD + Elizabeth, monthly lag).

### Hobart (TAS)
- Crime: **BLOCKED - annual state-level PDF only (DPFEM). No suburb/LGA open data.** Ship safety as "not scored - no open data for Tasmania", honest card. Optionally request data from DPFEM.
- Hazards: TAS planning scheme overlays via LIST ArcGIS REST (open, statewide). ~1-2.
- GTFS: Metro Tasmania. ~0.5.
- Beach: Derwent Estuary Program summer monitoring (scrape). Optional.

### Darwin (NT)
- Crime: **BLOCKED - PFES monthly stats at whole-of-region level (Darwin = one number). No suburb scoring possible.** Honest card, same as TAS.
- Air: 2 stations total - no intra-city variation; skip air context.
- Beach: croc/stinger reality - drop beach card, consider pools/waterparks POI instead.
- Hazards: NT planning scheme GIS availability unverified - investigate first (0.5), then decide.
- GTFS: Darwin feed on data.nt.gov.au. ~0.5.
- Smallest market (~30 SA2). Presence-only is acceptable indefinitely.

### Canberra (ACT) quick win
- Crime: ACT suburb-level crime exists on dataACT/ACTmapi but is NOT in the pipeline. ~1 session -> Canberra goes 5/7 -> 6/7. Cheap credibility win.

## Hard data problems (founder-visible honesty list)

1. TAS + NT crime: structurally absent. Safety domain cannot be scored honestly. Decision locked:
   show "not scored - no open data", never proxy with SEIFA silently.
2. ACARA My School: ToU bans commercial comparative performance use; bulk = Data Access Program
   application. NOT currently used (education = OSM schools + ABS preschool) - keep it that way
   unless DAP approved.
3. Property sales: free/open only in NSW (excellent) and SA (medians). QLD/WA/TAS/NT paid or
   closed - price-context card stays Melbourne+Sydney+Adelaide unless data is licensed.
4. WA school catchments: PDF-only. Education stays proximity-based in Perth.
5. Sun-shadow buildings at scale: Melbourne tiles = 170 MB. 8 regions of tiles threatens the
   GitHub repo/Pages ~1 GB soft limit. DECIDED 2026-06-12: inner-ring-only tiles per region now
   (~30-50 MB budget each), migrate all building tiles to Cloudflare R2 at domain cutover.
   TAS/NT safety: DECIDED - run a proper data hunt (FOI/data requests included) before falling
   back to the honest "not scored" card. See FABLE-EXECUTION-PLAN.md Wave 7.

## Acceptance gates (every region, every bake)

- places.{region}.json present, area count within 10% of ASGS expectation, >=5 domains scored
  (7 where Tier-B landed).
- Coverage gate: verify-coverage-diff vs HEAD baseline (exists after first bake).
- Per-region e2e spec green; verify-live probe on production post-deploy.
- Melbourne byte-identity preserved on no-param URLs (pinned by regression tests).
- Switcher honesty: unbaked = "Coming soon"; missing domains = visible "not scored" copy, not 0.
