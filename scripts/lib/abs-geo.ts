import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

const ABS_BASE = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021";

type ArcGisQueryParams = {
  layerPath: string;
  where: string;
  outFields?: string;
};

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

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`ABS API ${res.status}: ${layerPath} offset=${offset}`);
    }
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
