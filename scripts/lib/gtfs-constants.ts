import REGIONS from "../../lib/regions.js";

/** Official PTV / DTP GTFS Schedule (CC BY 4.0). Sourced from the region
 * registry's melbourne entry (lib/regions.ts); export name kept. */
const gtfsUrl = REGIONS.melbourne.stateSources?.gtfsUrl;
if (!gtfsUrl) {
  throw new Error("region registry: melbourne entry missing stateSources.gtfsUrl");
}
export const PTV_GTFS_URL = gtfsUrl;

/** Greater Melbourne bbox (same as Overpass queries). Derived from the region
 * registry's melbourne data bbox; values unchanged. */
export const MEL_BBOX = {
  south: REGIONS.melbourne.bbox.south,
  west: REGIONS.melbourne.bbox.west,
  north: REGIONS.melbourne.bbox.north,
  east: REGIONS.melbourne.bbox.east,
};

/** Weekday AM peak window (local time). */
export const AM_PEAK_START = 7 * 3600;
export const AM_PEAK_END = 10 * 3600 - 1;

export const ROUTE_TYPE_LABEL: Record<number, string> = {
  0: "tram",
  1: "metro",
  2: "train",
  3: "bus",
  4: "ferry",
};
