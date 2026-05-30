import { MEL_BBOX } from "./gtfs-constants.js";

const UA = "MelbourneLiveability/1.0";
const HOSPITALS_URL =
  "https://enterprise.mapshare.vic.gov.au/server/rest/services/Hosted/Emergency_Services__VMFEAT_FOI_POINT_/FeatureServer/0/query";

function inMelbourne(lat: number, lon: number): boolean {
  return (
    lat >= MEL_BBOX.south &&
    lat <= MEL_BBOX.north &&
    lon >= MEL_BBOX.west &&
    lon <= MEL_BBOX.east
  );
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
