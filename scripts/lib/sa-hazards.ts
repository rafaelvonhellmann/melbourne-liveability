/**
 * SA Planning and Design Code hazard overlays (PlanSA / data.sa.gov.au).
 *
 * Source service used by SAPPA:
 *   https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV18/MapServer
 *
 * Data SA catalogue: "Planning and Design Code Overlays" (CC BY 4.0). The
 * catalogue notes all overlays are combined in one dataset; SAPPA exposes the
 * same Code overlays as separate ArcGIS sublayers. The service WAF blocks
 * plain Node ArcGIS requests, so this adapter uses browser-like headers from
 * gov-fetch and the same honest paged-query semantics as arcgis-geojson.ts.
 *
 * Bushfire pct semantics: QLD's adapter collapses all QFES BPA classes into
 * one "area covered by any bushfire-prone planning overlay" share. SA's Code
 * has graduated bushfire classes, so we preserve the class in raw feature
 * properties but map every class below to the same positive-coverage pct:
 * High Risk, Medium Risk, General Risk, Outback, Regional, Urban Interface.
 */
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Region, RegionBbox } from "../../lib/regions.js";
import type {
  HazardAdapter,
  HazardNormalizeCtx,
  HazardPlace,
} from "./hazard-adapters.js";
import { browserFetch } from "./gov-fetch.js";
import { buildHazardIndex, overlayPctInSa2 } from "./sa2-overlay-pct.js";

export const SA_PLANSA_ATLAS_MAPSERVER =
  "https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV18/MapServer";

export const SA_BUSHFIRE_SOURCE_ID = "sa-plansa-bushfire-hazards";
export const SA_FLOOD_SOURCE_ID = "sa-plansa-flood-hazards";

export const SA_BUSHFIRE_RAW_FILE = "sa-plansa-bushfire.geojson";
export const SA_FLOOD_RAW_FILE = "sa-plansa-flood.geojson";

export type SaPctClass = "positive-coverage";
export type SaHazardKind = "bushfire" | "flood";

export type SaHazardLayer = {
  id: number;
  name: string;
  kind: SaHazardKind;
  hazardClass: string;
  pctClass: SaPctClass;
};

export const SA_BUSHFIRE_PCT_CLASS_MAPPING = {
  "High Risk": "positive-coverage",
  "Medium Risk": "positive-coverage",
  "General Risk": "positive-coverage",
  Outback: "positive-coverage",
  Regional: "positive-coverage",
  "Urban Interface": "positive-coverage",
} as const satisfies Record<string, SaPctClass>;

export const SA_BUSHFIRE_LAYERS: readonly SaHazardLayer[] = [
  {
    id: 135,
    name: "Hazards (Bushfire - High Risk)",
    kind: "bushfire",
    hazardClass: "High Risk",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING["High Risk"],
  },
  {
    id: 136,
    name: "Hazards (Bushfire - Medium Risk)",
    kind: "bushfire",
    hazardClass: "Medium Risk",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING["Medium Risk"],
  },
  {
    id: 137,
    name: "Hazards (Bushfire - General Risk)",
    kind: "bushfire",
    hazardClass: "General Risk",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING["General Risk"],
  },
  {
    id: 138,
    name: "Hazards (Bushfire - Outback)",
    kind: "bushfire",
    hazardClass: "Outback",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING.Outback,
  },
  {
    id: 139,
    name: "Hazards (Bushfire - Regional)",
    kind: "bushfire",
    hazardClass: "Regional",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING.Regional,
  },
  {
    id: 140,
    name: "Hazards (Bushfire - Urban Interface)",
    kind: "bushfire",
    hazardClass: "Urban Interface",
    pctClass: SA_BUSHFIRE_PCT_CLASS_MAPPING["Urban Interface"],
  },
] as const;

export const SA_FLOOD_LAYERS: readonly SaHazardLayer[] = [
  {
    id: 141,
    name: "Hazards (Flooding High)",
    kind: "flood",
    hazardClass: "High",
    pctClass: "positive-coverage",
  },
  {
    id: 372,
    name: "Hazards (Flooding General)",
    kind: "flood",
    hazardClass: "General",
    pctClass: "positive-coverage",
  },
  {
    id: 403,
    name: "Hazards (Flooding Evidence Required)",
    kind: "flood",
    hazardClass: "Evidence Required",
    pctClass: "positive-coverage",
  },
] as const;

export function saHazardLayerUrl(layer: SaHazardLayer): string {
  return `${SA_PLANSA_ATLAS_MAPSERVER}/${layer.id}`;
}

export type SaArcGisGeoJsonOptions = {
  envelope: RegionBbox;
  where?: string;
  outFields?: string;
  pageSize?: number;
  maxPages?: number;
  maxAllowableOffset?: number;
  geometryPrecision?: number;
};

function withSappaHeaders(init: RequestInit = {}): RequestInit {
  const headers = {
    Accept: "application/geo+json,application/json,text/plain,*/*",
    Referer: "https://sappa.plan.sa.gov.au/",
    ...(init.headers as Record<string, string> | undefined),
  };
  return { ...init, headers };
}

function queryUrl(layerUrl: string, opts: SaArcGisGeoJsonOptions, offset: number): string {
  const url = new URL(`${layerUrl}/query`);
  const { west, south, east, north } = opts.envelope;
  url.searchParams.set("where", opts.where ?? "1=1");
  url.searchParams.set("geometry", `${west},${south},${east},${north}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", opts.outFields ?? "objectid,name,value");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  if (opts.maxAllowableOffset != null) {
    url.searchParams.set("maxAllowableOffset", String(opts.maxAllowableOffset));
  }
  if (opts.geometryPrecision != null) {
    url.searchParams.set("geometryPrecision", String(opts.geometryPrecision));
  }
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(opts.pageSize ?? 2000));
  url.searchParams.set("f", "geojson");
  return url.toString();
}

/**
 * SAPPA-compatible ArcGIS layer fetcher. Kept local because the generic
 * ArcGIS fetcher deliberately uses a project UA only, while this service
 * rejects that transport with 403.
 */
export async function fetchSaArcGisGeoJson(
  layerUrl: string,
  opts: SaArcGisGeoJsonOptions
): Promise<FeatureCollection> {
  const pageSize = opts.pageSize ?? 2000;
  const maxPages = opts.maxPages ?? 400;
  const features: Feature[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = queryUrl(layerUrl, opts, offset);
    const backoffsMs = [5_000, 15_000, 45_000];
    let res = await browserFetch(url, withSappaHeaders());
    for (let attempt = 0; !res.ok && res.status >= 500 && attempt < backoffsMs.length; attempt++) {
      console.warn(
        `ArcGIS ${res.status} on page ${page} - retrying in ${backoffsMs[attempt] / 1000}s (${layerUrl})`
      );
      await new Promise((r) => setTimeout(r, backoffsMs[attempt]));
      res = await browserFetch(url, withSappaHeaders());
    }
    if (!res.ok) throw new Error(`SA ArcGIS layer ${res.status}: ${layerUrl}`);

    const fc = (await res.json()) as FeatureCollection & {
      error?: { message?: string };
      properties?: { exceededTransferLimit?: boolean };
    };
    if (fc.error) {
      throw new Error(`SA ArcGIS layer error: ${fc.error.message ?? "unknown"} (${layerUrl})`);
    }
    if (!Array.isArray(fc.features)) {
      throw new Error(`SA ArcGIS layer returned no feature array: ${layerUrl}`);
    }
    features.push(...fc.features);

    const more =
      fc.features.length === pageSize ||
      fc.properties?.exceededTransferLimit === true;
    if (!more || fc.features.length === 0) {
      return { type: "FeatureCollection", features };
    }
    offset += fc.features.length;
  }

  throw new Error(
    `SA ArcGIS layer pagination exhausted ${maxPages} pages with data remaining - ` +
      `refusing to return a truncated overlay: ${layerUrl}`
  );
}

export async function fetchSaHazardObjectIds(
  layer: SaHazardLayer,
  envelope: RegionBbox,
  where = "1=1"
): Promise<number[]> {
  const url = new URL(`${saHazardLayerUrl(layer)}/query`);
  const { west, south, east, north } = envelope;
  url.searchParams.set("where", where);
  url.searchParams.set("geometry", `${west},${south},${east},${north}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("returnIdsOnly", "true");
  url.searchParams.set("f", "json");

  const res = await browserFetch(url.toString(), withSappaHeaders({ headers: { Accept: "application/json,*/*" } }));
  if (!res.ok) throw new Error(`SA ArcGIS object-id query ${res.status}: ${saHazardLayerUrl(layer)}`);
  const body = (await res.json()) as {
    objectIds?: number[];
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(`SA ArcGIS object-id query error: ${body.error.message ?? "unknown"} (${saHazardLayerUrl(layer)})`);
  }
  return body.objectIds ?? [];
}

export async function fetchSaHazardLayerGeoJson(
  layer: SaHazardLayer,
  envelope: RegionBbox,
  opts: Partial<Omit<SaArcGisGeoJsonOptions, "envelope">> = {}
): Promise<FeatureCollection> {
  const fc = await fetchSaArcGisGeoJson(saHazardLayerUrl(layer), {
    envelope,
    outFields: "objectid,name,value",
    geometryPrecision: 5,
    ...opts,
  });
  for (const f of fc.features) {
    f.properties = {
      ...(f.properties ?? {}),
      sourceLayer: layer.name,
      hazardKind: layer.kind,
      hazardClass: layer.hazardClass,
      pctClass: layer.pctClass,
    };
  }
  return fc;
}

async function fetchLayerSet(
  layers: readonly SaHazardLayer[],
  bbox: RegionBbox
): Promise<FeatureCollection> {
  const features: Feature[] = [];
  for (const layer of layers) {
    console.log(`PlanSA ${layer.name}...`);
    const fc = await fetchSaHazardLayerGeoJson(layer, bbox);
    features.push(...fc.features);
    console.log(`  ${fc.features.length} polygons`);
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

export function applySaHazardsToPlaces(
  places: Iterable<HazardPlace>,
  geomByCode: Map<string, Polygon | MultiPolygon>,
  bushfire: FeatureCollection | null,
  flood: FeatureCollection | null
): { bushfireSa2: number; floodSa2: number } {
  const bushfireIdx =
    bushfire && bushfire.features.length > 0 ? buildHazardIndex(bushfire) : null;
  const floodIdx =
    flood && flood.features.length > 0 ? buildHazardIndex(flood) : null;
  let bushfireSa2 = 0;
  let floodSa2 = 0;

  for (const p of places) {
    const geom = geomByCode.get(p.sa2Code);
    if (!geom) continue;
    if (bushfireIdx) {
      p.bushfirePct = overlayPctInSa2(geom, bushfireIdx);
      bushfireSa2++;
    }
    if (floodIdx) {
      p.floodPct = overlayPctInSa2(geom, floodIdx);
      floodSa2++;
    }
  }
  return { bushfireSa2, floodSa2 };
}

export const saHazardsAdapter: HazardAdapter = {
  bushfireSourceId: SA_BUSHFIRE_SOURCE_ID,
  floodSourceId: SA_FLOOD_SOURCE_ID,

  async fetch(region: Region, rawDir: string) {
    console.log("SA Planning and Design Code bushfire hazard overlays (PlanSA/SAPPA, clipped to region bbox)...");
    const bushfire = await fetchLayerSet(SA_BUSHFIRE_LAYERS, region.bbox);
    await writeFile(path.join(rawDir, SA_BUSHFIRE_RAW_FILE), JSON.stringify(bushfire));

    try {
      console.log("SA Planning and Design Code flooding hazard overlays (PlanSA/SAPPA, clipped to region bbox)...");
      const flood = await fetchLayerSet(SA_FLOOD_LAYERS, region.bbox);
      await writeFile(path.join(rawDir, SA_FLOOD_RAW_FILE), JSON.stringify(flood));
    } catch (e) {
      console.warn(
        "  SA flooding overlays skipped (floodPct will be missing):",
        (e as Error).message
      );
    }
  },

  async normalize({ rawDir, places, geomByCode }: HazardNormalizeCtx) {
    const bushfire = await loadOverlayFile(rawDir, SA_BUSHFIRE_RAW_FILE);
    const flood = await loadOverlayFile(rawDir, SA_FLOOD_RAW_FILE);
    if (!bushfire) {
      console.warn(
        "Hazards: sa-plansa-bushfire.geojson missing - run npm run data:hazards (bushfirePct will be missing)"
      );
    }
    if (!flood) {
      console.warn(
        "Hazards: sa-plansa-flood.geojson missing - floodPct stays missing everywhere"
      );
    }
    if (!bushfire && !flood) return;
    const stats = applySaHazardsToPlaces(places, geomByCode, bushfire, flood);
    console.log(
      `Hazards: SA bushfire=${bushfire?.features.length ?? 0} flood=${flood?.features.length ?? 0} polygons; ` +
        `bushfire covered ${stats.bushfireSa2} SA2, flood covered ${stats.floodSa2} SA2`
    );
  },
};
