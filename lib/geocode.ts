/**
 * Client-side full-address geocoding via OpenStreetMap Nominatim. Free, no API
 * key, runs entirely in the browser at runtime -> static-export safe (no server
 * route, no build-time dependency). Results are biased + restricted to Greater
 * Melbourne.
 *
 * Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * at most 1 request/second and clear attribution. We satisfy the rate limit by
 * only ever calling this on an explicit submit (never per keystroke) and we show
 * NOMINATIM_ATTRIBUTION wherever results appear. The suburb / SA2 / map-click
 * flows remain the primary path; this is an additive convenience.
 */

export const NOMINATIM_ATTRIBUTION =
  "Address search (c) OpenStreetMap contributors, via Nominatim";

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** Full human-readable address (Nominatim display_name) - good for a title. */
  label: string;
  /** Compact "12 Smith St, Brunswick East" line for the result row. */
  shortLabel: string;
  category?: string;
  type?: string;
};

// Greater Melbourne bounding box: west,north,east,south (lng/lat). Used to both
// bias and (bounded=1) restrict results so a bare "High St" lands locally.
const MELB_VIEWBOX = "144.30,-37.40,145.65,-38.55";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

type NominatimAddress = {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
};

type NominatimRow = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  category?: string;
  type?: string;
  address?: NominatimAddress;
};

function shortLabelOf(row: NominatimRow): string {
  const a = row.address ?? {};
  const line1 =
    [a.house_number, a.road].filter(Boolean).join(" ") || row.name || "";
  const locality =
    a.suburb || a.neighbourhood || a.city || a.town || a.municipality || "";
  const parts = [line1, locality].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return (row.display_name ?? "").split(",").slice(0, 2).join(",").trim();
}

function toResult(row: NominatimRow): GeocodeResult | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = (row.display_name ?? "").trim();
  return {
    lat,
    lng,
    label,
    shortLabel: shortLabelOf(row) || label,
    category: row.category,
    type: row.type,
  };
}

/**
 * Strip a leading Australian unit/apartment prefix so Nominatim can resolve the
 * building. Handles "5/12 Smith St", "Unit 5, 12 Smith St", "Apt 5 12 ...",
 * "Flat 5 ...". Falls back to the original if stripping would leave too little.
 */
export function stripUnitPrefix(query: string): string {
  let s = query.trim();
  s = s.replace(
    /^\s*(?:unit|apartment|apt|flat|u)\s*\.?\s*\d+[a-z]?\s*[,/\-]?\s*/i,
    ""
  );
  s = s.replace(/^\s*\d+[a-z]?\s*\/\s*/, "");
  s = s.trim();
  return s.length >= 3 ? s : query.trim();
}

/**
 * Geocode a free-text address within Greater Melbourne. Returns [] for queries
 * under 3 chars. Pass an AbortSignal to cancel a superseded request (the caller
 * should abort the previous in-flight lookup before starting a new one).
 * Throws on network / non-2xx so the caller can surface an error state.
 */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeResult[]> {
  // Nominatim resolves a building, not a unit — and an Australian unit prefix
  // ("5/12 Smith St", "Unit 5, ...", "Apt 5 ...") makes it fail. Strip it so the
  // pin still lands on the building; the unit doesn't change the SA2 or what's
  // nearby.
  const q = stripUnitPrefix(query);
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    countrycodes: "au",
    viewbox: MELB_VIEWBOX,
    bounded: "1",
    addressdetails: "1",
    limit: "6",
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { "Accept-Language": "en-AU" },
  });
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const raw = (await res.json()) as NominatimRow[];
  if (!Array.isArray(raw)) return [];
  const out: GeocodeResult[] = [];
  for (const row of raw) {
    const r = toResult(row);
    if (r) out.push(r);
  }
  return out;
}
