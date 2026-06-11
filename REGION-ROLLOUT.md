# Region rollout - remaining work per city (June-20 launch scope)

Status after P4.1 Phase A (this change): the data layer is region-keyed.
`lib/regions.ts` holds all eight GCCSA entries; the fetch pipeline takes
`--region <id>` / `REGION` env (default `melbourne`, byte-identical output);
Melbourne constants are aliases over the registry. What is NOT done: the app/UI
region switcher (later wave), per-region output namespacing
(`places.<region>.json`), per-state Tier-B fetch modules, and per-region OSM
building-tile bakes.

## What "launch" can honestly mean on June 20

With 9 days, the realistic scope for the 7 new regions is the **Tier-A national
slice**: SA2 choropleth + area profiles built from ABS national data (Census,
SEIFA, ERP, income/rent/tenure, building approvals) + OSM amenity/transit
counts + ACARA schools / ACECQA childcare / GA facilities clips - and **honest
"not yet available in <city>" findings** for every Tier-B lens (crime, hazards,
school zones, traffic, lot size, planning overlays). That matches the
FABLE-ULTRAPLAN P4.4 "national SA2 free tier" shape. Full per-state Tier-B
parity per city is 1-3 weeks EACH (EXPANSION-PLAN section 3) and does not fit;
do not pretend it does.

## Shared blockers (before ANY second city ships)

| Item | Why | Est. agent-hours |
|---|---|---|
| Per-region output emit (`places.<region>.json` or region-keyed file) + build loop over regions | Today every script writes the same filenames (places.json, osm-*.json, train-stations.json); a second region run overwrites Melbourne | 6-10 |
| App wave: region switcher / `/<region>/` routes, per-region map framing (use registry mapCenter/zoom/maxBounds), geocode viewbox (lib/geocode.ts MELB_VIEWBOX is still Melbourne-only), per-region SEO | Out of Phase A scope by design | 16-24 |
| Per-region GTFS module split (precompute-gtfs.ts is PTV-wired via registry melbourne entry; needs per-region gtfsUrl + agency quirks) | Transit domain scores need it; otherwise transit = OSM stops only with a caveat | 4-8 per city |
| Per-region building-tile bake + density gating (swap Geofabrik extract per bake-buildings.yml) | Sun lens per city; density gating needed everywhere incl. Melbourne | 4-6 per city + the one-off gating work |
| Honesty layer: "not yet available" finding templates per missing lens, per city | The launch claim depends on it (s18 risk otherwise) | 4-6 once |

## Per-city remaining work

"Tier-A national steps" are the same loop everywhere and are READY now:
`--region <id>` data:fetch (SA2/SAL/LGA via GCCSA from the registry), ABS
indicator pulls (gccsa-filtered), qualifications (state-coded), Overpass bbox
extracts, then crosswalk/normalize/score. Estimate ~4-8 agent-hours per city
for the Tier-A run+verify once the shared output-emit blocker above is done
(first non-Melbourne city will surface assumptions; budget double for it).

| City | Tier-A (national) | Tier-B state modules needed (EXPANSION-PLAN s.3) | Launches WITHOUT them (June 20) | Est. agent-hours beyond Tier-A |
|---|---|---|---|---|
| **Sydney** (1GSYD) | Ready - run the loop | NSW module: BOCSAR crime (monthly suburb), SEED hazards (bushfire/flood/coastal), ePlanning overlays, SIX cadastre (lot size, open), TfNSW GTFS (keyed - verify terms), traffic, air API, SA2 projections | SA2 choropleth + profiles from national data; OSM amenities/transit; ACARA/ACECQA/GA pins; "not yet available" for crime/hazards/zones/lot-size | 30-50 (richest portal set; flagship QA is the long pole) |
| **Brisbane** (3GBRI) | Ready | QLD module: council FloodWise (parcel flood), storm-tide, MSES overlays, DCDB cadastre (open), Translink GTFS, bushfire endpoint hunt (data.qld is "email us"); crime is LGA-only - D7 decision: ship with caveat or omit | Same national slice; crime gets a permanent honesty caveat either way | 25-40 |
| **Adelaide** (4GADE) | Ready | SA module: PlanSA combined overlays, SA crime (suburb), traffic, Adelaide GTFS; cadastre is PAID ($250+) - D6: hide lot-size; police layer via OSM fallback | National slice; sun works via baked OSM tiles; lot-size hidden with honest note | 20-35 |
| **Perth** (5GPER) | Ready | WA module: SLIP ArcGIS (bushfire/activity centres/traffic, keyless), WA crime, Transperth GTFS; school zones are PDF-only (no spatial layer - omit with caveat); cadastre PAID - hide lot-size; air needs keyed AQICN | National slice; two permanent gaps (zones, lot-size) declared honestly | 20-35 |
| **Hobart** (6GHOB) | Ready | TAS module: theLIST/LISTmap (open cadastre, planning-scheme overlays, bushfire + coastal inundation + landslip), Metro Tas GTFS (bus-only), Tas Police crime (coarse LGA - caveat) | National slice; small market, low build cost; landslip is the differentiator later | 15-25 |
| **Darwin** (7GDAR) | Ready | NT module: mostly national fallbacks (NAFI fire, DEA/Coastal Risk for SLR - no NT layer), storm surge, NT crime (town-level, caveat), bus-only GTFS; no bushfire overlay exists | National slice; the most "not yet available" lenses of any city - say so plainly | 15-25 |
| **Canberra** (8ACTE) | Ready - registry acceptance fixture (FABLE-ULTRAPLAN P4.1: built with Melbourne from day one) | ACT module: ACTmapi ArcGIS for everything (overlays, open cadastre, bushfire+flood, spatial school PEAs), Transport Canberra GTFS (bus+light rail), suburb ACT crime; NO LGA joins (hasCouncils=false - verify normalize/crosswalk degrade gracefully) | National slice; sun WORKS today (~622 bldg/km2 OSM); cleanest first non-Melbourne city - do it first to debug the pattern | 15-25 |

## What 9 days actually buys

One agent-week-ish of focused work realistically covers: the shared
output-emit blocker, the app region switcher MVP, Tier-A runs for all 7
cities, the honesty-layer findings, and ONE city's Tier-B module if it goes
smoothly (Canberra is the right one - single jurisdiction, one portal, sun
already works). It does NOT buy: 7 state Tier-B modules (~150-235 agent-hours
in the table above), per-city e2e + data:verify QA at the standard Melbourne
got, self-hosted Valhalla for commercial routing terms, or SA/WA cadastre
decisions. Launching June 20 "covering all greater capital regions" is honest
ONLY as: Melbourne full + 7 cities at national-data depth with explicit
per-lens "not yet available" messaging + Canberra possibly deeper.

## Notes carried from Phase A (this change)

- `fetch-indicators.ts` skips the VIC-only sources (VCSA crime, Vic MapShare
  hospitals) for non-Melbourne regions instead of fetching wrong-state data.
- `places.json` does NOT carry a per-place `region` field (EXPANSION-PLAN
  overstated this); the file-level `region` lives in `crosswalk.json` and now
  derives from the registry (`PIPELINE_REGION.gccsa`, value unchanged =
  "2GMEL"). Stamping region per place / per output file belongs to the
  output-emit blocker above - doing it now would break byte-identical output.
- Overpass scripts are bbox-parameterized but write region-less filenames
  (osm-*.json) - same blocker.
- `scripts/fetch-vg-prices.ts`, school zones, heritage, overlays, hazards,
  EPA air, beach quality, water corp, VIF projections, activity centres,
  traffic AADT, electorates, future transport are ALL VIC Tier-B sources and
  stay Melbourne-only until each state module lands (they are run per-script,
  not by data:fetch, so they cannot silently poison another region's build).
