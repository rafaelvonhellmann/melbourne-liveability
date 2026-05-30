/** Official PTV / DTP GTFS Schedule (CC BY 4.0). */
export const PTV_GTFS_URL =
  "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip";

/** Greater Melbourne bbox (same as Overpass queries). */
export const MEL_BBOX = {
  south: -38.35,
  west: 144.45,
  north: -37.45,
  east: 145.65,
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
