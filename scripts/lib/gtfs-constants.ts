import REGIONS, { type RegionId } from "../../lib/regions.js";

/** Official PTV / DTP GTFS Schedule (CC BY 4.0). Sourced from the region
 * registry's melbourne entry (lib/regions.ts); export name kept. */
const gtfsUrl = REGIONS.melbourne.stateSources?.gtfsUrls?.[0];
if (!gtfsUrl) {
  throw new Error("region registry: melbourne entry missing stateSources.gtfsUrls");
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

/**
 * Provenance metadata for each region's GTFS feed (the zip URLs themselves
 * live on the registry: lib/regions.ts stateSources.gtfsUrls). sourceId is
 * what normalize stamps into places' transport sub-indicators and what the
 * per-region sources manifest (hash-sources.ts) records; url is the human
 * landing page for the trust drawer, NOT the zip.
 */
export type GtfsSourceMeta = {
  /** Manifest id, e.g. "ptv-gtfs", "translink-gtfs". */
  sourceId: string;
  /** Display name for the trust drawer / methodology. */
  name: string;
  /** Human landing page (dataset page), not the zip itself. */
  url: string;
  licence: string;
  /** Env var holding a required API key. When set but absent from the
   * environment, precompute-gtfs skips the region gracefully (OSM fallback). */
  keyEnv?: string;
};

export const GTFS_SOURCES: Record<RegionId, GtfsSourceMeta> = {
  melbourne: {
    // Pre-existing melbourne manifest entry - id must stay "ptv-gtfs".
    sourceId: "ptv-gtfs",
    name: "PTV GTFS Schedule - stops, routes, weekday AM-peak trips",
    url: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
    licence: "CC BY 4.0",
  },
  sydney: {
    sourceId: "tfnsw-gtfs",
    name: "Transport for NSW - complete GTFS schedule",
    url: "https://opendata.transport.nsw.gov.au/data/dataset/timetables-complete-gtfs",
    licence: "CC BY 4.0",
    // Free key: sign up at opendata.transport.nsw.gov.au, header `apikey`.
    keyEnv: "TFNSW_API_KEY",
  },
  brisbane: {
    sourceId: "translink-gtfs",
    name: "Translink - South East Queensland GTFS schedule",
    url: "https://www.data.qld.gov.au/dataset/general-transit-feed-specification-gtfs-translink",
    licence: "CC BY 4.0",
  },
  adelaide: {
    sourceId: "adelaide-metro-gtfs",
    name: "Adelaide Metro GTFS schedule",
    url: "https://data.sa.gov.au/data/dataset/https-gtfs-adelaidemetro-com-au",
    licence: "CC BY 4.0",
  },
  perth: {
    sourceId: "transperth-gtfs",
    name: "Transperth (PTA WA) GTFS schedule",
    url: "https://www.transperth.wa.gov.au/About/Spatial-Data-Access",
    licence: "CC BY 4.0",
  },
  hobart: {
    sourceId: "tas-gtfs",
    name: "Tasmania statewide GTFS schedule (Metro Tasmania + regional operators)",
    url: "https://www.transport.tas.gov.au/public_transport/gtfs-data",
    licence: "CC BY 4.0",
  },
  darwin: {
    sourceId: "nt-gtfs",
    name: "NT Government GTFS schedule - Darwin bus network",
    url: "https://data.nt.gov.au/dataset/bus-timetable-data-and-geographic-information-darwin",
    licence: "CC BY 4.0",
  },
  canberra: {
    sourceId: "transport-canberra-gtfs",
    name: "Transport Canberra GTFS schedule (bus + light rail)",
    url: "https://www.transport.act.gov.au/contact-us/information-for-developers",
    licence: "CC BY 4.0",
  },
};
