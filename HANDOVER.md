# Handover — Melbourne Liveability MVP

**Workflow:** Composer 2.5 implements; Opus reviews at each DoD. Plan of record is `ULTRAPLAN.md`.

**Last updated:** 2026-05-29 (Composer: v1.x seven-domain product complete).

---

## Status: v1.x product SHIPPED (pending Opus review)

Seven scored domains (weights 30/18/14/14/8/8/8), context panels, persona presets, sitemap.

| Area | State |
|------|-------|
| Transport | PTV GTFS precompute (`data:gtfs`) |
| Crime | VCSA Table 03 + crosswalk |
| Health | Vic MapShare hospitals + OSM GP (NDIS not scored) |
| Income | ABS DHI + Census 2016 labour |
| Hazards | Vic planning BPA + flood overlays (`data:hazards`) |
| Education | OSM schools 2 km + ABS preschool enrolment |
| Context | SEIFA, tenure/dwelling, First Nations % (display-only) |
| UI | Persona presets, `ContextPanels`, `app/sitemap.ts`, OG metadata |

### Commands
```bash
npm run data:fetch      # boundaries + indicators (incl. SEIFA, schools, community)
npm run data:gtfs       # PTV transport precompute
npm run data:hazards    # Vic planning overlays (slow; paginated ArcGIS)
npm run data:normalize && npm run data:score && npm run data:geo
# or: npm run data:build
npm test && npm run build
```

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
- Commit `public/data/*` and `data/generated/sources.json` after pipeline runs.
