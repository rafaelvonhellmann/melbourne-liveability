import { MEL_BBOX } from "./gtfs-constants.js";

const UA = "MelbourneLiveability/1.0";
/** Vicmap Emergency Services FOI (hospitals + police stations etc.). */
const EMERGENCY_FOI_URL =
  "https://enterprise.mapshare.vic.gov.au/server/rest/services/Hosted/Emergency_Services__VMFEAT_FOI_POINT_/FeatureServer/0/query";
const HOSPITALS_URL = EMERGENCY_FOI_URL;
/** Vicmap Features of Interest — general points layer (child care, education…). */
const VICMAP_FOI_POINT_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Features_of_Interest/FeatureServer/1/query";

export type NamedPoint = { name: string; coord: [number, number] };

function inMelbourne(lat: number, lon: number): boolean {
  return (
    lat >= MEL_BBOX.south &&
    lat <= MEL_BBOX.north &&
    lon >= MEL_BBOX.west &&
    lon <= MEL_BBOX.east
  );
}

/**
 * Paged ArcGIS query for named point features within Greater Melbourne. Handles
 * both point geometry ({x,y}) and the multipoint shape ({points:[[lon,lat]]})
 * the hosted Vicmap layers sometimes return.
 */
async function fetchFoiNamedPoints(
  queryUrl: string,
  where: string,
  fields = "name,feature_subtype"
): Promise<NamedPoint[]> {
  const out: NamedPoint[] = [];
  let offset = 0;
  for (;;) {
    const url = new URL(queryUrl);
    url.searchParams.set("where", where);
    url.searchParams.set("outFields", fields);
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "2000");

    const res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Vic FOI ${res.status}`);
    const data = (await res.json()) as {
      features?: {
        attributes?: Record<string, string | number | null>;
        geometry?: { x?: number; y?: number; points?: [number, number][] };
      }[];
      exceededTransferLimit?: boolean;
    };
    const batch = data.features ?? [];
    for (const f of batch) {
      const g = f.geometry ?? {};
      const name = String(f.attributes?.name ?? "").trim();
      const coords: [number, number][] = Array.isArray(g.points)
        ? g.points
        : typeof g.x === "number" && typeof g.y === "number"
          ? [[g.x, g.y]]
          : [];
      for (const [lon, lat] of coords) {
        if (inMelbourne(lat, lon)) out.push({ name: name || "Unnamed", coord: [lon, lat] });
      }
    }
    if (!data.exceededTransferLimit && batch.length < 2000) break;
    offset += 2000;
  }
  return out;
}

/** Vicmap police stations (authoritative VIC, CC BY 4.0) within Greater Melbourne. */
export function fetchVicPoliceStations(): Promise<NamedPoint[]> {
  return fetchFoiNamedPoints(EMERGENCY_FOI_URL, "feature_subtype='police station'");
}

/** Vicmap child-care centres (authoritative VIC, CC BY 4.0) within Greater Melbourne. */
export function fetchVicChildcare(): Promise<NamedPoint[]> {
  return fetchFoiNamedPoints(VICMAP_FOI_POINT_URL, "feature_subtype='child care'");
}

/** Vicmap / MapShare emergency services — general hospitals (CC BY 4.0 Vic). */
export async function fetchVicHospitalPoints(): Promise<[number, number][]> {
  const pts: [number, number][] = [];
  let offset = 0;
  for (;;) {
    const url = new URL(HOSPITALS_URL);
    url.searchParams.set(
      "where",
      "feature_subtype IN ('general hospital','general hospital (emergency)')"
    );
    url.searchParams.set("outFields", "name,feature_subtype");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "2000");

    const res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Vic hospitals ${res.status}`);
    const data = (await res.json()) as {
      features?: {
        geometry?: { points?: [number, number][] };
      }[];
      exceededTransferLimit?: boolean;
    };
    const batch = data.features ?? [];
    for (const f of batch) {
      for (const [lon, lat] of f.geometry?.points ?? []) {
        if (inMelbourne(lat, lon)) pts.push([lon, lat]);
      }
    }
    if (!data.exceededTransferLimit && batch.length < 2000) break;
    offset += 2000;
  }
  return pts;
}
