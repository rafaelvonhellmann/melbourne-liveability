import { MEL_BBOX } from "./gtfs-constants.js";

const UA = "MelbourneLiveability/1.0";

/**
 * Page a Victorian GeoServer WFS 2.0 layer to GeoJSON, clipped to the Melbourne
 * bbox. Sibling of arcgis-plan-vic's fetchPlanLayerGeoJson, for opendata.maps.vic
 * GeoServer (which is WFS, not Esri REST).
 *
 * GOTCHA (verified): in WFS 2.0 the BBOX filter axis order is LAT,LON, i.e.
 * BBOX(geom, minLat, minLon, maxLat, maxLon). Passing lon,lat silently returns
 * zero features. srsName=EPSG:4326 makes GeoServer reproject server-side, so no
 * client-side EPSG:3111 reprojection is needed.
 */
export async function fetchWfsLayerGeoJson(
  baseUrl: string,
  typeName: string,
  opts: { geomField?: string; propertyName?: string; pageSize?: number; maxPages?: number } = {}
): Promise<GeoJSON.FeatureCollection> {
  const geom = opts.geomField ?? "geom";
  const pageSize = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 60;
  const features: GeoJSON.Feature[] = [];
  let startIndex = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", typeName);
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("srsName", "EPSG:4326");
    url.searchParams.set("count", String(pageSize));
    url.searchParams.set("startIndex", String(startIndex));
    // LAT,LON axis order (lon,lat -> 0 features).
    url.searchParams.set(
      "cql_filter",
      `BBOX(${geom},${MEL_BBOX.south},${MEL_BBOX.west},${MEL_BBOX.north},${MEL_BBOX.east})`
    );
    if (opts.propertyName) url.searchParams.set("propertyName", opts.propertyName);

    let res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    if (!res.ok && res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(url.toString(), { headers: { "User-Agent": UA } });
    }
    if (!res.ok) throw new Error(`WFS ${typeName} ${res.status}`);
    const fc = (await res.json()) as GeoJSON.FeatureCollection;
    const batch = fc.features ?? [];
    features.push(...batch);
    if (batch.length < pageSize) break;
    startIndex += pageSize;
  }

  return { type: "FeatureCollection", features };
}
