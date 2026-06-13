import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

export const ASGS_EDITION = "2021" as const;
// ABS_BASE hard-pins ASGS Edition 3 (2021). ASGS Ed.4 is a future migration,
// not a runtime switch, so keep the service path fixed.
const ABS_BASE = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021";

type ArcGisQueryParams = {
  layerPath: string;
  where: string;
  outFields?: string;
};

// geo.abs.gov.au rate-scores datacenter IPs: a burst of requests (e.g. two CI
// runs in close succession) draws transient 403s that clear within minutes.
// Retry those patiently before failing loud (the refresh has a 90-min budget).
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);
const BACKOFF_MS = [30_000, 90_000, 180_000];

async function fetchWithBackoff(
  url: string,
  layerPath: string,
  offset: number
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    await res.body?.cancel().catch(() => {});
    if (attempt >= BACKOFF_MS.length || !RETRYABLE.has(res.status)) {
      throw new Error(`ABS API ${res.status}: ${layerPath} offset=${offset}`);
    }
    const wait = BACKOFF_MS[attempt];
    console.warn(
      `ABS API ${res.status} on ${layerPath} offset=${offset} - retrying in ${wait / 1000}s (attempt ${attempt + 1}/${BACKOFF_MS.length})`
    );
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Paginated GeoJSON fetch from ABS ArcGIS FeatureServer (max 2000 per page). */
export async function fetchAbsGeoJson(
  params: ArcGisQueryParams
): Promise<FeatureCollection> {
  const { layerPath, where, outFields = "*" } = params;
  const baseUrl = `${ABS_BASE}/${layerPath}/query`;
  const features: Feature[] = [];
  let offset = 0;
  const pageSize = 2000;

  for (;;) {
    const url = new URL(baseUrl);
    url.searchParams.set("where", where);
    url.searchParams.set("outFields", outFields);
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "geojson");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));

    const res = await fetchWithBackoff(url.toString(), layerPath, offset);
    const data = (await res.json()) as FeatureCollection & {
      properties?: { exceededTransferLimit?: boolean };
    };
    const batch = data.features ?? [];
    features.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return { type: "FeatureCollection", features };
}

export function getProp<T = string>(
  feature: Feature,
  keys: string[]
): T | undefined {
  const props = feature.properties ?? {};
  const lowerMap = new Map(
    Object.entries(props).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of keys) {
    const direct = props[key];
    if (direct != null && direct !== "") return direct as T;
    const lower = lowerMap.get(key.toLowerCase());
    if (lower != null && lower !== "") return lower as T;
  }
  return undefined;
}

export function featureGeometry(
  f: Feature
): Polygon | MultiPolygon | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Polygon" || g.type === "MultiPolygon") return g;
  return null;
}
