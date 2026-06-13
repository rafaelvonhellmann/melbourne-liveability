/**
 * WA hazards adapter candidate (not registered here).
 *
 * Bushfire:
 *   DFES / Office of Bushfire Risk Management "Bush Fire Prone Areas 2025
 *   (OBRM-024)", DataWA / SLIP public MapServer layer 22. The DataWA catalogue
 *   marks the dataset Open under Creative Commons Attribution 4.0. The layer is
 *   statewide; fetch() clips the Perth-region result to lib/regions.ts bbox.
 *
 * Flood:
 *   DWER "FPM 1 in 100 (1%) AEP Floodway and Flood Fringe Area (DWER-014)",
 *   SLIP public Water MapServer layer 23. This is the only verified open
 *   Perth-metro floodplain polygon layer found in the DataWA checks:
 *     - covers Swan River, Canning River and tributaries around Perth;
 *     - describes major river flooding only, not stormwater/drainage flooding;
 *     - DataWA access is Open but licence is Custom (Active Acceptance), while
 *       the ArcGIS layer description says Creative Commons Non-Commercial.
 *   Water Corporation and Main Roads publish open drainage asset layers, not
 *   floodplain hazard polygons. Department of Transport DataWA results did not
 *   expose a floodplain layer. If the licence is not acceptable for production,
 *   do not register the flood source; normalize() leaves floodPct null when the
 *   raw flood file is absent.
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Region, RegionBbox } from "../../lib/regions.js";
import type {
  HazardAdapter,
  HazardNormalizeCtx,
  HazardPlace,
} from "./hazard-adapters.js";
import { fetchArcGisGeoJson } from "./arcgis-geojson.js";
import { buildHazardIndex, overlayPctInSa2 } from "./sa2-overlay-pct.js";

export const WA_BUSHFIRE_SOURCE_ID = "wa-dfes-bushfire-prone-areas-2025";
export const WA_FLOOD_SOURCE_ID = "wa-dwer-fpm-100aep-floodway-fringe";

export const WA_BPA_RAW_FILE = "wa-bpa.geojson";
export const WA_FLOOD_RAW_FILE = "wa-dwer-floodway-fringe.geojson";

export const WA_BPA_LAYER_URL =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer/22";
export const WA_FLOOD_LAYER_URL =
  "https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Water/MapServer/23";

type PolyFeature = Feature<Polygon | MultiPolygon>;

export type WaHazardStats = {
  bushfireSa2: number;
  floodSa2: number;
};

function bboxArray(bbox: RegionBbox): [number, number, number, number] {
  return [bbox.west, bbox.south, bbox.east, bbox.north];
}

function sanitizeClipped(
  geom: Polygon | MultiPolygon | null | undefined
): Polygon | MultiPolygon | null {
  if (!geom) return null;
  if (geom.type === "Polygon") {
    const rings = geom.coordinates.filter((r) => r.length >= 4);
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }
  const polys = geom.coordinates
    .map((p) => p.filter((r) => r.length >= 4))
    .filter((p) => p.length > 0);
  return polys.length > 0 ? { type: "MultiPolygon", coordinates: polys } : null;
}

function isPolyFeature(f: Feature): f is PolyFeature {
  return (
    !!f.geometry &&
    (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
  );
}

/**
 * ArcGIS envelope queries filter intersecting features but do not guarantee the
 * returned geometry is clipped. Keep raw artifacts region-sized so later area
 * work does not carry statewide polygon tails.
 */
export function clipFeatureCollectionToBbox(
  fc: FeatureCollection,
  bbox: RegionBbox
): FeatureCollection {
  const clipBbox = bboxArray(bbox);
  const features: Feature[] = [];
  for (const f of fc.features) {
    if (!isPolyFeature(f)) continue;
    try {
      const clipped = turf.bboxClip(f, clipBbox) as PolyFeature;
      const clean = sanitizeClipped(clipped.geometry);
      if (!clean) continue;
      features.push({ ...f, geometry: clean });
    } catch {
      /* Ignore invalid source polygons; other features still carry the layer. */
    }
  }
  return { type: "FeatureCollection", features };
}

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

export async function fetchWaHazardOverlays(
  region: Region,
  rawDir: string
): Promise<{ bushfireFeatures: number; floodFeatures: number }> {
  await mkdir(rawDir, { recursive: true });

  console.log("WA Bush Fire Prone Areas 2025 (DFES/OBRM via SLIP, clipped to Perth bbox)...");
  const bpa = clipFeatureCollectionToBbox(
    await fetchArcGisGeoJson(WA_BPA_LAYER_URL, {
      envelope: region.bbox,
      outFields: "objectid,lga,designation,type,designationdate",
      pageSize: 5000,
      geometryPrecision: 5,
    }),
    region.bbox
  );
  await writeFile(path.join(rawDir, WA_BPA_RAW_FILE), JSON.stringify(bpa));
  console.log(`  ${bpa.features.length} polygons`);

  let floodFeatures = 0;
  try {
    console.log("WA DWER 1% AEP floodway/fringe (SLIP, clipped to Perth bbox)...");
    const flood = clipFeatureCollectionToBbox(
      await fetchArcGisGeoJson(WA_FLOOD_LAYER_URL, {
        envelope: region.bbox,
        outFields: "objectid,ext_type,status,location",
        pageSize: 5000,
        geometryPrecision: 5,
      }),
      region.bbox
    );
    floodFeatures = flood.features.length;
    await writeFile(path.join(rawDir, WA_FLOOD_RAW_FILE), JSON.stringify(flood));
    console.log(`  ${floodFeatures} polygons`);
  } catch (e) {
    console.warn(
      "  WA DWER floodway/fringe skipped (floodPct will be missing):",
      (e as Error).message
    );
  }

  return { bushfireFeatures: bpa.features.length, floodFeatures };
}

export function applyWaHazardsToPlaces(
  places: Iterable<HazardPlace>,
  geomByCode: Map<string, Polygon | MultiPolygon>,
  bpa: FeatureCollection | null,
  flood: FeatureCollection | null
): WaHazardStats {
  const bpaIdx = bpa && bpa.features.length > 0 ? buildHazardIndex(bpa) : null;
  const floodIdx =
    flood && flood.features.length > 0 ? buildHazardIndex(flood) : null;
  let bushfireSa2 = 0;
  let floodSa2 = 0;

  for (const p of places) {
    const geom = geomByCode.get(p.sa2Code);
    if (!geom) continue;
    if (bpaIdx) {
      p.bushfirePct = overlayPctInSa2(geom, bpaIdx);
      bushfireSa2++;
    }
    if (floodIdx) {
      p.floodPct = overlayPctInSa2(geom, floodIdx);
      floodSa2++;
    }
  }

  return { bushfireSa2, floodSa2 };
}

async function normalizeWaHazards({
  rawDir,
  places,
  geomByCode,
}: HazardNormalizeCtx): Promise<void> {
  const bpa = await loadOverlayFile(rawDir, WA_BPA_RAW_FILE);
  const flood = await loadOverlayFile(rawDir, WA_FLOOD_RAW_FILE);

  if (!bpa) {
    console.warn(
      "Hazards: wa-bpa.geojson missing - run npm run data:hazards (bushfirePct will be missing)"
    );
  }
  if (!flood) {
    console.warn(
      "Hazards: wa-dwer-floodway-fringe.geojson missing - floodPct stays missing everywhere"
    );
  }
  if (!bpa && !flood) return;

  const stats = applyWaHazardsToPlaces(places, geomByCode, bpa, flood);
  console.log(
    `Hazards WA: BPA=${bpa?.features.length ?? 0} flood(DWER)=${flood?.features.length ?? 0} polygons; ` +
      `bushfire ${stats.bushfireSa2} SA2, flood ${stats.floodSa2} SA2`
  );
}

export const waHazardsAdapter: HazardAdapter = {
  bushfireSourceId: WA_BUSHFIRE_SOURCE_ID,
  floodSourceId: WA_FLOOD_SOURCE_ID,
  async fetch(region, rawDir) {
    await fetchWaHazardOverlays(region, rawDir);
  },
  normalize: normalizeWaHazards,
};
