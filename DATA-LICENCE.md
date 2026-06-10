# Data licences and attribution

This repository compiles open data into a liveability map and pin-level buyer
report for Greater Melbourne. **We charge (or plan to charge) for tooling and
presentation only - never for the underlying data itself.** Every dataset we
hold remains under its original open licence, listed below and per-dataset in
`data/generated/sources.json` (rendered at `/methodology#attribution` on the
live site, which is the canonical user-facing attribution page).

## 1. OpenStreetMap-derived files (ODbL 1.0)

The following files in this repository are **derivative databases** of
OpenStreetMap data, licensed under the Open Database License (ODbL) 1.0:

- `public/data/buildings/**` - baked building-footprint tiles (z14 JSON) for
  the sun/shadow view, extracted from the Geofabrik `australia/victoria`
  extract with osmium (see `.github/workflows/bake-buildings.yml` and
  `scripts/build-building-tiles.ts`).
- POI layers (`pois.geojson` and the OSM-sourced point sets behind it:
  schools, GP/clinics, post offices, pathology/NDIS, aged care, everyday
  amenities, train stations, future PT stations).
- Noise/nuisance proximity proxies (rail/tram/freeway corridors, industrial/
  waste/sewage/quarry points).
- Walk/cycle inputs (cycling-infrastructure density, walkability inputs) and
  the Overpass public-transport fallback.

Attribution: **(c) OpenStreetMap contributors**. Licence:
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/) - see also
[osm.org/copyright](https://www.openstreetmap.org/copyright).

As required by ODbL 1.0, these derivative databases are publicly available:
they are committed to this public repository
(https://github.com/rafaelvonhellmann/melbourne-liveability), which is also
where to obtain them. If you reuse them, you must attribute OpenStreetMap and
share any adapted database under ODbL.

## 2. CC BY sources and required attribution wording

Per-dataset licence, vintage and provenance live in
`data/generated/sources.json`. Required attribution by licensor:

| Licensor | Datasets (classes) | Licence | Required attribution |
|---|---|---|---|
| Australian Bureau of Statistics | Census 2021/2016, Data by Region, SEIFA, ERP, Building Approvals, SA2 boundaries | CC BY 4.0 | "Based on Australian Bureau of Statistics data" / (c) Commonwealth of Australia (ABS) |
| State of Victoria (DTP) | Vicmap (planning overlays, FOI, admin, parcels), VicPlan, PTV GTFS, VIF2023, AADT, activity centres, school zones | CC BY 4.0 | (c) State of Victoria (Department of Transport and Planning) |
| State of Victoria (DEECA) | Fire history, coastal inundation (CoastKit), urban heat / tree canopy | CC BY 4.0 | (c) State of Victoria (Department of Energy, Environment and Climate Action) |
| Victorian Department of Education | School locations, school zones | CC BY 4.0 | (c) State of Victoria (Department of Education) |
| Crime Statistics Agency Victoria | Recorded offences (suburb/LGA tables) | CC BY 3.0 AU | (c) State of Victoria (Crime Statistics Agency) |
| EPA Victoria | AirWatch air quality, Beach Report | CC BY 4.0 | (c) EPA Victoria |
| Melbourne Water | Healthy Waterways Strategy 2018 habitat-suitability | CC BY-SA 4.0 | (c) Melbourne Water. ShareAlike: adapted material from this layer must carry the same licence |
| Australian Electoral Commission | 2022 federal election results CSVs | CC BY 4.0 | (c) Commonwealth of Australia (Australian Electoral Commission) |
| Bureau of Meteorology | Solar-exposure climatology | BoM copyright - verify before commercial use | (c) Commonwealth of Australia (Bureau of Meteorology); no CC notice verified on the product page |
| CARTO / OpenStreetMap | Positron basemap tiles | CARTO terms | (c) CARTO, (c) OpenStreetMap contributors (until a basemap swap) |

Where a dataset's licence could not be verified, `sources.json` carries a
`verifyNote` recording what was checked and when - resolve those notes before
any commercial launch.

## 3. The data-vs-product line

Scores, percentiles and report findings are presentation over the data above.
The data itself is not resold, paywalled, or relicensed: anyone can fetch the
same sources (or this repo's baked derivatives, under their original
licences) for free. What this product sells is tooling - compilation,
verification, presentation, and provenance.
