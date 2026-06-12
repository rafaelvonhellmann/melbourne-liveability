/**
 * Generic paged ArcGIS REST layer -> GeoJSON fetcher (hazard adapters, Wave 3).
 *
 * The VIC overlay fetcher (arcgis-plan-vic.ts) is hardwired to the Melbourne
 * envelope and is left untouched so the Melbourne pipeline stays byte-identical.
 * This is the region-generic equivalent the per-state hazard adapters use:
 * envelope clip server-side (so a statewide layer only ships the region's
 * polygons), optional server-side simplification (maxAllowableOffset /
 * geometryPrecision) for very fragmented layers, and resultOffset pagination.
 *
 * HONESTY: unlike arcgis-plan-vic's silent `maxPages` stop, exhausting
 * `maxPages` while the server still reports more data THROWS - a truncated
 * hazard layer would silently shrink every SA2's overlay share, which is worse
 * than a loud failed fetch.
 */
import type { RegionBbox } from "../../lib/regions.js";

const UA = "MelbourneLiveability/1.0";

export type ArcGisGeoJsonOptions = {
  /** Clip envelope (lon/lat). Strongly recommended for statewide layers. */
  envelope?: RegionBbox;
  where?: string;
  outFields?: string;
  /** Server page size; capped by the layer's maxRecordCount (commonly 2000). */
  pageSize?: number;
  /** Pagination guard - throws if exhausted with more data remaining. */
  maxPages?: number;
  /** Server-side simplification tolerance in degrees (~0.001 = 100 m). */
  maxAllowableOffset?: number;
  /** Decimal places for output coordinates (5 = ~1 m). */
  geometryPrecision?: number;
};

/**
 * Fetch every feature of `layerUrl` (".../FeatureServer/0" or
 * ".../MapServer/15") as a single FeatureCollection. Retries each page once on
 * HTTP 5xx, mirroring fetchPlanLayerGeoJson; any other failure throws.
 */
export async function fetchArcGisGeoJson(
  layerUrl: string,
  opts: ArcGisGeoJsonOptions = {}
): Promise<GeoJSON.FeatureCollection> {
  let pageSize = opts.pageSize ?? 2000;
  const maxPages = opts.maxPages ?? 400;
  const features: GeoJSON.Feature[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const buildUrl = () => {
      const url = new URL(`${layerUrl}/query`);
      url.searchParams.set("where", opts.where ?? "1=1");
      if (opts.envelope) {
        const { west, south, east, north } = opts.envelope;
        url.searchParams.set("geometry", `${west},${south},${east},${north}`);
        url.searchParams.set("geometryType", "esriGeometryEnvelope");
        url.searchParams.set("inSR", "4326");
        url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
      }
      url.searchParams.set("outFields", opts.outFields ?? "OBJECTID");
      url.searchParams.set("returnGeometry", "true");
      url.searchParams.set("outSR", "4326");
      if (opts.maxAllowableOffset != null) {
        url.searchParams.set("maxAllowableOffset", String(opts.maxAllowableOffset));
      }
      if (opts.geometryPrecision != null) {
        url.searchParams.set("geometryPrecision", String(opts.geometryPrecision));
      }
      url.searchParams.set("resultOffset", String(offset));
      url.searchParams.set("resultRecordCount", String(pageSize));
      url.searchParams.set("f", "geojson");
      return url.toString();
    };

    // Slow utility-proxy layers (e.g. QFES BPA) intermittently 504 on heavy
    // polygon pages: back off and halve the page size rather than dying -
    // a 20-minute fetch failing on one gateway timeout wastes a whole bake.
    const backoffsMs = [5_000, 15_000, 45_000];
    let res = await fetch(buildUrl(), { headers: { "User-Agent": UA } });
    for (let attempt = 0; !res.ok && res.status >= 500 && attempt < backoffsMs.length; attempt++) {
      if (res.status === 504 && pageSize > 250) {
        pageSize = Math.max(250, Math.floor(pageSize / 2));
        console.warn(
          `ArcGIS ${res.status} on page ${page} - halving page size to ${pageSize}, ` +
            `retrying in ${backoffsMs[attempt] / 1000}s (${layerUrl})`
        );
      } else {
        console.warn(
          `ArcGIS ${res.status} on page ${page} - retrying in ${backoffsMs[attempt] / 1000}s (${layerUrl})`
        );
      }
      await new Promise((r) => setTimeout(r, backoffsMs[attempt]));
      res = await fetch(buildUrl(), { headers: { "User-Agent": UA } });
    }
    if (!res.ok) throw new Error(`ArcGIS layer ${res.status}: ${layerUrl}`);
    const fc = (await res.json()) as GeoJSON.FeatureCollection & {
      error?: { message?: string };
      properties?: { exceededTransferLimit?: boolean };
    };
    // ArcGIS reports query errors inside a 200 body.
    if (fc.error) {
      throw new Error(`ArcGIS layer error: ${fc.error.message ?? "unknown"} (${layerUrl})`);
    }
    if (!Array.isArray(fc.features)) {
      throw new Error(`ArcGIS layer returned no feature array: ${layerUrl}`);
    }
    features.push(...fc.features);

    // Servers may return fewer than pageSize while still having more data
    // (transfer-limit caps), so trust exceededTransferLimit too.
    const more =
      fc.features.length === pageSize ||
      fc.properties?.exceededTransferLimit === true;
    if (!more || fc.features.length === 0) {
      return { type: "FeatureCollection", features };
    }
    offset += fc.features.length;
  }

  throw new Error(
    `ArcGIS layer pagination exhausted ${maxPages} pages with data remaining - ` +
      `refusing to return a truncated overlay: ${layerUrl}`
  );
}
