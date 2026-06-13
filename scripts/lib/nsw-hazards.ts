/**
 * NSW hazards adapter (unregistered in this lane).
 *
 * Verified open 2026-06-13:
 *   bushfire - NSW Spatial hosted "NSW BushFire Prone Land"
 *     FeatureServer/0, statewide RFS BFPL polygons. Portal item terms say
 *     "CC by NSW RFS" with attribution "NSW Rural Fire Service 2026".
 *   flood - NSW Planning Portal / ePlanning "Flood Planning Map"
 *     (Environmental Planning Instrument - Flood), Creative Commons
 *     Attribution via the Planning Portal CKAN package `epi-flood`.
 *
 * Both layers are queried through ArcGIS REST with a Sydney/region envelope.
 * If a raw file is absent, normalize leaves that sub-indicator null: missing
 * data is never treated as zero exposure.
 */
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  HazardAdapter,
  HazardNormalizeCtx,
  HazardPlace,
} from "./hazard-adapters.js";
import { fetchArcGisGeoJson } from "./arcgis-geojson.js";
import { buildHazardIndex, overlayPctInSa2 } from "./sa2-overlay-pct.js";
import { assertBakeable, registryId } from "./source-registry.js";

export const NSW_BFPL_LAYER_URL =
  "https://portal.spatial.nsw.gov.au/server/rest/services/Hosted/NSW_BushFire_Prone_Land/FeatureServer/0";

export const NSW_EPI_FLOOD_LAYER_URL =
  "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Hazard/MapServer/230";

export const NSW_BFPL_RAW_FILE = "nsw-bfpl.geojson";
export const NSW_EPI_FLOOD_RAW_FILE = "nsw-epi-flood.geojson";
export const NSW_BUSHFIRE_SOURCE_ID = registryId("nsw-rfs-bush-fire-prone-land");
export const NSW_FLOOD_SOURCE_ID = registryId("nsw-epi-flood-planning-area");

/** Flood-related classes from the EPI Flood layer. The renderer also contains
 * a few non-flood strays (for example Cultural Heritage Landscape Area and
 * Transitional Land); those are deliberately excluded from floodPct. */
export const NSW_EPI_FLOOD_CLASSES = [
  "1 in 100 AEP Flood Extent",
  "1 in 100 year flood extents",
  "Flood Planning Area",
  "Flood Prone and Major Creeks Land",
  "Land subject to flooding",
  "Level of Probable Maximum Flood",
  "Probable Maximum Flood Line",
  "Dungog Tailwater Area",
] as const;

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

export const NSW_EPI_FLOOD_WHERE = `LAY_CLASS IN (${NSW_EPI_FLOOD_CLASSES.map(
  sqlString
).join(",")})`;

async function loadOverlayFile(
  rawDir: string,
  name: string
): Promise<FeatureCollection | null> {
  try {
    return JSON.parse(
      await readFile(path.join(rawDir, name), "utf8")
    ) as FeatureCollection;
  } catch {
    return null;
  }
}

/**
 * Pure pct-math core: area-weighted BFPL/flood overlay shares per SA2.
 * When a layer is present, every SA2 with geometry gets a real 0..100 value.
 * When a layer is missing, that pct stays null for honest missingness.
 */
export function applyNswHazardsToPlaces(
  places: Iterable<HazardPlace>,
  geomByCode: Map<string, Polygon | MultiPolygon>,
  bfpl: FeatureCollection | null,
  flood: FeatureCollection | null
): { bushfireSa2: number; floodSa2: number } {
  const bfplIdx = bfpl && bfpl.features.length > 0 ? buildHazardIndex(bfpl) : null;
  const floodIdx =
    flood && flood.features.length > 0 ? buildHazardIndex(flood) : null;
  let bushfireSa2 = 0;
  let floodSa2 = 0;

  for (const p of places) {
    const geom = geomByCode.get(p.sa2Code);
    if (!geom) continue;
    if (bfplIdx) {
      p.bushfirePct = overlayPctInSa2(geom, bfplIdx);
      bushfireSa2++;
    }
    if (floodIdx) {
      p.floodPct = overlayPctInSa2(geom, floodIdx);
      floodSa2++;
    }
  }

  return { bushfireSa2, floodSa2 };
}

export const nswHazardsAdapter: HazardAdapter = {
  bushfireSourceId: NSW_BUSHFIRE_SOURCE_ID,
  floodSourceId: NSW_FLOOD_SOURCE_ID,

  async fetch(region, rawDir) {
    assertBakeable(NSW_BUSHFIRE_SOURCE_ID);
    assertBakeable(NSW_FLOOD_SOURCE_ID);
    console.log(
      "NSW Bush Fire Prone Land (RFS BFPL, clipped to region bbox)..."
    );
    const bfpl = await fetchArcGisGeoJson(NSW_BFPL_LAYER_URL, {
      envelope: region.bbox,
      outFields: "fid,d_category,category",
      pageSize: 2000,
      geometryPrecision: 5,
    });
    await writeFile(path.join(rawDir, NSW_BFPL_RAW_FILE), JSON.stringify(bfpl));
    console.log(`  ${bfpl.features.length} polygons`);

    try {
      console.log("NSW EPI flood planning area (Planning Portal, clipped to region bbox)...");
      const flood = await fetchArcGisGeoJson(NSW_EPI_FLOOD_LAYER_URL, {
        envelope: region.bbox,
        where: NSW_EPI_FLOOD_WHERE,
        outFields: "OBJECTID,LAY_CLASS,EPI_NAME,LGA_NAME",
        pageSize: 2000,
        geometryPrecision: 5,
      });
      await writeFile(
        path.join(rawDir, NSW_EPI_FLOOD_RAW_FILE),
        JSON.stringify(flood)
      );
      console.log(`  ${flood.features.length} polygons`);
    } catch (e) {
      console.warn(
        "  NSW EPI flood layer skipped (floodPct will be missing):",
        (e as Error).message
      );
    }
  },

  async normalize({ rawDir, places, geomByCode }: HazardNormalizeCtx) {
    const bfpl = await loadOverlayFile(rawDir, NSW_BFPL_RAW_FILE);
    const flood = await loadOverlayFile(rawDir, NSW_EPI_FLOOD_RAW_FILE);
    if (!bfpl) {
      console.warn(
        "Hazards: nsw-bfpl.geojson missing - run npm run data:hazards (bushfirePct will be missing)"
      );
    }
    if (!flood) {
      console.warn(
        "Hazards: nsw-epi-flood.geojson missing - floodPct stays missing everywhere"
      );
    }
    if (!bfpl && !flood) return;

    const stats = applyNswHazardsToPlaces(places, geomByCode, bfpl, flood);
    console.log(
      `Hazards: BFPL=${bfpl?.features.length ?? 0} flood(EPI)=${flood?.features.length ?? 0} polygons; ` +
        `bushfire ${stats.bushfireSa2} SA2, flood ${stats.floodSa2} SA2`
    );
  },
};
