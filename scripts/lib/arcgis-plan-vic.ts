import { MEL_BBOX } from "./gtfs-constants.js";

const UA = "MelbourneLiveability/1.0";
const MEL_ENVELOPE = `${MEL_BBOX.west},${MEL_BBOX.south},${MEL_BBOX.east},${MEL_BBOX.north}`;

export async function fetchPlanLayerGeoJson(
  baseUrl: string,
  layerId: number,
  maxPages = 80
): Promise<GeoJSON.FeatureCollection> {
  const features: GeoJSON.Feature[] = [];
  let offset = 0;
  const pageSize = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${baseUrl}/${layerId}/query`);
    url.searchParams.set("where", "1=1");
    url.searchParams.set("geometry", MEL_ENVELOPE);
    url.searchParams.set("geometryType", "esriGeometryEnvelope");
    url.searchParams.set("inSR", "4326");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("outFields", "OBJECTID");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));
    url.searchParams.set("f", "geojson");

    let res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    if (!res.ok && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    }
    if (!res.ok) throw new Error(`Plan layer ${layerId} ${res.status}`);
    const fc = (await res.json()) as GeoJSON.FeatureCollection;
    const batch = fc.features ?? [];
    features.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return { type: "FeatureCollection", features };
}
