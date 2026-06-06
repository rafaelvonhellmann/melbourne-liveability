# Multi-city expansion plan — Sydney, Brisbane, Adelaide, Perth, Darwin

Maps the Melbourne build (40 data sources, ABS-SA2 model) to the other five
mainland capitals. Source-by-source matrix, architecture changes, per-city
unique data, gaps, and a rollout order. Researched against live open-data
portals (11-agent workflow, Jun 2026). **Verify every state URL + licence again
at build time** — portals move and licence terms vary.

---

## 1. Verdict (TL;DR)

- **The model ports.** Everything funnels through one constant (`GREATER_MELBOURNE_GCCSA = "2GMEL"`) and each area already carries a `region` field. Expansion is **parameterization, not a rebuild**.
- **~60% of the data is national and scales for free** — all ABS (demographics), all OSM (amenities/transport), plus better-than-Melbourne national layers for schools (ACARA), childcare (ACECQA) and hospitals/police (Geoscape Foundation Facilities). Just loop the GCCSA codes + bounding boxes.
- **~40% is state-specific** and exists in every state but in different agencies/formats — a per-state fetch module each. Most are `have-equivalent`.
- **Three hard gaps** decide scope + cost:
  1. **Building heights for the sun feature** — open only in **Melbourne + Adelaide**. Sydney/Brisbane/Perth/Darwin need commercial Geoscape or a coarse OSM-levels fallback.
  2. **Cadastre / lot-size-at-a-point** — open in **NSW + QLD**; **paid** in SA ($250+) and WA (subscription); bulk-only in NT. The "lot size" feature can't run on free data in Adelaide/Perth.
  3. **Crime granularity** — suburb-level in NSW/SA/WA; **Brisbane is a single LGA** so open crime has no intra-city variation; NT is town-level.

---

## 2. Architecture changes (follow the same model)

The pipeline is already GCCSA-scoped, so the refactor is contained:

1. **Region registry** — replace the single `GREATER_MELBOURNE_GCCSA` constant with `lib/regions.ts`:
   ```
   { id, label, gccsa, bbox, state, mapCenter, zoom,
     waterRetailer: "single"|"multi", buildingHeightSource, stateSources:{...} }
   ```
   GCCSA codes (ABS ASGS Ed.3, stable): **Sydney `1GSYD` · Brisbane `3GBRI` · Adelaide `4GADE` · Perth `5GPER` · Darwin `7GDAR`** (Melbourne `2GMEL`).
2. **Parameterize the fetch pipeline** — `scripts/fetch.ts` + `fetch-indicators.ts` already filter `GCCSA_CODE_2021='2GMEL'`; take the code as an arg and loop. ABS Data API query templates are identical; only the SA2 list changes. Get each city's SA2 list from the ASGS allocation file filtered by `GCCSA_CODE_2021`, or clip the SA2 boundary FeatureService by `GCC_CODE21`.
3. **Per-state source modules** — one fetch module per state for the Tier-B layers (crime, planning overlays, flood/fire/coastal, school zones, traffic, air, activity centres). Config-driven where possible.
4. **Emit per-region data** — `places.<region>.json` (or keep one file keyed by the existing `region` field) + per-region geo.
5. **App / UX**:
   - region switcher (and/or `/<region>/...` routes);
   - generalize `MEL_BBOX` in `lib/share-url.ts` to a per-region bbox for pin validation (derive each from the GCCSA polygon extent);
   - per-region map center/zoom; per-region SEO (sitemap/robots/metadata).
6. **Sun feature** — per-region `buildingHeightSource` (see Tier C).
7. **Routing/Valhalla** — global already; no change. Reachability + drive-time + precise-walk work in every city out of the box.

---

## 3. Data tiers

### Tier A — National, scales free (do once, clip per city)

| Source | Scales | How to scope |
|---|---|---|
| ABS SA2 boundaries, Data by Region, Census 2021 (income/rent/tenure/qualifications/labour/preschool), SEIFA, ERP, Building Approvals | **Yes** | Loop GCCSA code; same SDMX query, no key |
| OSM / Overpass (amenities, POIs, transit stops, cycleways, noise/nuisance corridors) | **Yes** | Swap bbox (derive from GCCSA polygon); self-host Overpass or use Geofabrik extracts for volume |
| **ACARA** Australian Schools List (point + sector govt/Catholic/independent + lat/long) | **Yes** | One national pull → clip. **Replaces per-state school-location work** |
| **ACECQA** National Registers (childcare, daily CSV) | **Yes** | Per-state CSV; geocode addresses (no lat/long) → clip |
| **Geoscape Foundation Facilities Points** (Geoscience Australia, CC BY) — hospitals + police + emergency in one national service | **Yes** | National ArcGIS REST → clip. **Better than Melbourne's per-state Vicmap approach — consider retrofitting Melbourne to this** |
| National hazard fallbacks: GA **Smartline** (coastal landform), **Coastal Risk Australia** (SLR), **DEA Coastlines** (shoreline change), **NAFI** (fire, esp. northern AU) | **Yes** | Continental; clip per city. Use where state data is weak |

Routing (Valhalla keyless) is already global.

### Tier B — State-specific equivalents (one module per state)

Legend: ✓ have-equivalent · ~ partial · ✗ missing · **N** national-covers

| # | Category (VIC source) | SYD | BNE | ADL | PER | DAR |
|---|---|:--:|:--:|:--:|:--:|:--:|
| 1 | Crime stats | ✓ | ~¹ | ✓ | ✓ | ~² |
| 2 | Transit GTFS | ✓ | ✓ | ✓ | ✓ | ✓³ |
| 3 | Bushfire-prone overlay | ✓ | ~⁴ | ✓ | ✓ | ✗⁵ |
| 4 | Flood overlay | ✓ | ✓ | ✓ | ~⁶ | ~⁷ |
| 5 | Heritage overlay | ✓ | ✓ | ✓ | ~⁸ | ~ |
| 6 | Conservation/restriction overlays | ✓ | ✓ | ✓ | ✓ | ~ |
| 7 | Coastal inundation / SLR | ✓ | ✓ | ~ | ~ | ✗⁹ |
| 8 | Fire history | ✓ | ✓ | ✓ | ✓ | ✓ (NAFI) |
| 9 | Population projections (SA2) | ✓ | ✓¹⁰ | ~¹¹ | ✓ | ~¹² |
| 10 | School catchment zones | ✓ | ✓ | ✓ | ✗¹³ | ~¹⁴ |
| 11 | School locations + sector | **N** | **N** | **N** | **N** | **N** |
| 12 | Traffic volumes (AADT) | ✓ | ~¹⁵ | ✓ | ✓ | ~¹⁶ |
| 13 | Water retailer boundaries | ~¹⁷ | ~¹⁸ | ~¹⁷ | ~¹⁷ | ~¹⁷ |
| 14 | Cadastre / lot size | ✓ | ✓ | ~**$**¹⁹ | ~**$**²⁰ | ~²¹ |
| 15 | Air quality (live) | ✓ | ✓ | ~²² | ~²³ | ~²⁴ |
| 16 | Activity-centre zones | ✓ | ✓ | ✓ | ✓ | ~ |
| 17 | Hospitals + police | ✓/**N** | ✓/**N** | ~²⁵/**N** | ✓ | **N** |
| 18 | Childcare | **N** | **N** | **N** | **N** | **N** |
| 19 | Building heights (sun) | ~²⁶ | ~²⁷ | ✓²⁸ | ~²⁹ | ~³⁰ |

**Notes:** ¹ QLD open crime is **LGA-only**; Brisbane = one big LGA → no intra-city variation (suburb crime only via non-bulk map). ² NT town/locality level, provisional. ³ bus-only (no train/tram in Darwin). ⁴ data.qld page says "email for a copy" — find the SPP ArcGIS REST endpoint or self-host. ⁵ NT planning scheme has **no** bushfire overlay (Bushfires NT zones are coarse). ⁶ WA flood mapped per-river only (covers Swan/Canning). ⁷ NT LSF/LSSS overlays open only via FTP/manual export; easy WMS is non-commercial. ⁸ WA only the ~1,300 State Register; local heritage not one open layer. ⁹ no NT SLR layer → use Coastal Risk Australia / DEA. ¹⁰ QLD dwelling projections only to LGA, not SA2. ¹¹ SA SA2 = population only, no dwellings. ¹² NT = SA3 regions only. ¹³ **WA school zones are PDF maps only — no spatial layer.** ¹⁴ NT PEAs are Google-Maps/PDF only. ¹⁵ QLD state-roads only. ¹⁶ NT tabular, no geometry. ¹⁷ single metro retailer → lens is moot, hard-code a constant flag. ¹⁸ SEQ multi-provider (Urban Utilities/Unitywater/councils) — assemble per-distributor. ¹⁹ **SA cadastre paid ($250+ min); free subset = Adelaide CBD only.** ²⁰ **WA Landgate cadastre paid subscription; free tier non-commercial only.** ²¹ NT open cadastre exists but bulk-download only (no commercial-OK live WFS). ²² SA validated monthly + web map (snapshot at build). ²³ WA live values need keyed AQICN feed. ²⁴ NT EPA dashboard-only (City of Darwin IoT sensors are open). ²⁵ SA has no open police-station layer → OSM fallback. ²⁶ Sydney: no open height model (City of Sydney storeys polygons CBD-only; Geoscape commercial). ²⁷ "Virtual Brisbane" exists but not an open download. ²⁸ **Adelaide: open City 3D model with heights (FBX/Multipatch — convert to glTF).** ²⁹ City of Perth 3D is viewer-only. ³⁰ Darwin: heights only via commercial Geoscape.

### Tier C — The three hard gaps

1. **Building heights / sun (the Northlight differentiator).** No open national heights layer. Open council 3D with heights exists only in **Melbourne (CityGML)** and **Adelaide (FBX/Multipatch)**. Sydney/Brisbane/Perth/Darwin: commercial **Geoscape Buildings** (national, has heights; free to NSW gov only) or coarse **OSM `building:levels` × ~3 m**, else flat assumed height.
   → **Decision:** licence Geoscape (paid, unlocks heights everywhere incl. retrofit) **or** accept "true cast shadows in Melbourne + Adelaide; sun-path + shademap link elsewhere."
2. **Cadastre / lot size.** Open + WFS in **NSW (SIX Maps)** and **QLD (DCDB)**. **Paid** in SA (Land Services SA) and WA (Landgate) — the lot-size feature can't run on free data there. NT open but bulk-only.
   → **Decision:** pay for SA/WA parcels, or hide lot-size in those cities (fall back to ABS mesh-block / OSM footprint proxy).
3. **Planning-overlay concept mismatch.** No state replicates Victoria's named overlays (ESO/SLO/VPO/EMO/EAO/PAO). Each has functional equivalents (NSW EPI layers, QLD MSES + council City Plan, SA combined Code overlays, WA Region Scheme, NT Part-3 overlays). → maintain a **per-state overlay crosswalk** mapping local instruments to our finding categories rather than 1:1 codes.

---

## 4. Per-city snapshot

- **Sydney (NSW)** — *richest open data, do first.* BOCSAR crime, SEED hazards (bushfire/flood/fire/coastal all open), **open cadastre (SIX Maps)**, TfNSW GTFS + traffic + air API, SA2 projections. Gap: no open building heights (sun limited). Biggest market.
- **Brisbane (QLD)** — strong council open data + **open DCDB cadastre**, council flood (parcel-level!), storm-tide, MSES. Gaps: crime LGA-only (no intra-Brisbane), bushfire needs endpoint work, sun (Virtual Brisbane not open).
- **Adelaide (SA)** — clean combined PlanSA overlays, fresh traffic, **open City 3D model → the sun feature works here.** Gaps: **paid cadastre** (no open lot-size), coastal SLR viewer-only, no open police layer (OSM).
- **Perth (WA)** — excellent SLIP ArcGIS REST (bushfire/activity-centres/traffic all keyless), WA Tomorrow SA2 projections. Gaps: **school zones missing (PDF only)**, **paid cadastre**, air needs keyed feed, sun (no open heights).
- **Darwin (NT)** — smallest, most gaps: no bushfire overlay, no SLR layer, coarse crime/projections, school zones PDF-only, bus-only transit. But standout unique hazards (storm surge, UXO, mineral titles). Do last; lean on national fallbacks (NAFI, DEA, GA facilities).

---

## 5. Interesting place-specific data (the "unique per city" ask)

Datasets Melbourne doesn't need but that matter locally — strong differentiators:

- **Sydney** — **Mine Subsidence Districts** (legal build gate, Newcastle/Macarthur), **EPA Contaminated Land notices**, **Acid Sulfate Soils**, **Greater Sydney Heat Vulnerability Index (SA1)** + **Tree Canopy 2022 (mesh-block)**, **AHIMS** Aboriginal heritage, **Kingsford-Smith ANEF aircraft-noise contours**.
- **Brisbane** — **parcel-level Flood Awareness** (river/creek/storm-tide, the FloodWise data), **storm-tide inundation to 2100**, **coastal erosion-prone areas**, **acid sulfate soils (SEQ)**, **ATSI cultural-heritage areas**, City Plan **biodiversity/waterway-corridor** overlays.
- **Adelaide** — **Groundwater Prohibition Areas** (TCE/PCE plumes under whole suburbs — can't sink a bore), **Acid Sulfate Soils**, **Tree Canopy + Urban Heat** (one of the hottest capitals), **Mt Lofty Ranges Watershed priority areas**, **Hills Face Zone** (can render a block unbuildable), **Adelaide Airport ANEF**.
- **Perth** — **Acid Sulfate Soils (Swan Coastal Plain)**, **Contaminated Sites Database**, **Coastline Movements / erosion hotspots**, **Kwinana atmospheric buffer zones** (industrial), **Perth Groundwater Map / depth-to-watertable** (garden bores + foundation risk), **Aboriginal Cultural Heritage Register**.
- **Darwin** — **Storm Surge Mapping** (cyclone, drives the planning overlay), **Acid Sulfate Soils of the Darwin Region**, **NT Floodplain (Q100/PMF)**, **DEA Coastlines** (macro-tidal mobile shores), **NT Mineral Titles (STRIKE)** (tenements over rural-res blocks), **National UXO Affected Areas** (WWII — dense around Darwin).

Cross-cutting themes worth a shared layer: **acid sulfate soils** (every coastal capital), **tree canopy / urban heat** (Syd/Adl/Per), **ANEF aircraft noise** (most capitals), **contaminated land** (Syd/Per/Adl).

---

## 6. Recommended rollout order

By data readiness + market size:

1. **Sydney** — richest open data, biggest market, open cadastre. (Sun limited.)
2. **Brisbane** — open cadastre + parcel flood; accept crime-granularity gap.
3. **Adelaide** — sun works (open 3D); accept paid-cadastre gap (hide lot-size or buy).
4. **Perth** — strong hazards; resolve school-zones (digitise/buy) + cadastre.
5. **Darwin** — most gaps; national fallbacks + unique hazards. Smallest payoff.

Each city ≈ the same shape of work: 12 ABS pulls (free), OSM bbox, ACARA/ACECQA/GA national, + ~14 per-state modules. The national tier + architecture refactor is the shared up-front cost; then it's one state-module set per city.

---

## 7. Decisions needed from you

1. **Geoscape Buildings licence?** Paid, but the only way to get cast-shadow sun in Sydney/Brisbane/Perth/Darwin. Otherwise sun = Melbourne + Adelaide only (others get sun-path + shademap link).
2. **SA + WA cadastre** — pay for parcels (lot-size feature), or hide lot-size in Adelaide/Perth?
3. **Launch scope** — all five at once, or phase per the order above?
4. **Crime in Brisbane** — ship LGA-only (honest caveat) or omit until finer data?
5. **Retrofit Melbourne** to the national hospitals/police layer (GA Foundation Facilities) for consistency?

*Generated from research workflow `wysbyegdn` (11 agents). Re-verify URLs + licences at build time.*
