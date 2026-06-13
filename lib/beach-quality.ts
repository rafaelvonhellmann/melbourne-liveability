/**
 * Nearest monitored bay-beach swim quality to a dropped pin - the second half of
 * the v2 Water-quality lens. Loads the pre-built beach-quality.json (EPA Beach
 * Report enterococci, graded on the median of recent samples) and returns the
 * nearest beach within a radius. Pure client-side (no runtime API); never throws.
 * Context only - never scored.
 *
 * Honest scope: "typical recent" measured sampling (summer-only, weekly), NOT
 * EPA's live rain-driven daily forecast. CC BY 4.0 (EPA Victoria / DataVic).
 */
import type { LngLat } from "./buyer-location";
import { withBase } from "./asset-path";
import {
  DEFAULT_REGION,
  dataPath,
  sanitizeRegionId,
  type RegionId,
} from "./regions";

export const BEACH_SOURCE_ID = "epa-beach-report";

export type Beach = {
  name: string;
  lng: number;
  lat: number;
  grade: "Good" | "Fair" | "Poor";
  value: number;
  n: number;
  date: string;
};
export type NearestBeach = Beach & { distanceKm: number };

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLng = (b[0] - a[0]) * toR;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Pure: nearest beach to `pin` within `maxKm`, or null. Unit-testable. */
export function nearestBeach(beaches: Beach[], pin: LngLat, maxKm = 6): NearestBeach | null {
  let best: NearestBeach | null = null;
  for (const b of beaches) {
    const d = haversineKm(pin, [b.lng, b.lat]);
    if (d <= maxKm && (!best || d < best.distanceKm)) {
      best = { ...b, distanceKm: Math.round(d * 10) / 10 };
    }
  }
  return best;
}

function activeRegionId(): RegionId {
  if (typeof window === "undefined") return DEFAULT_REGION;
  return sanitizeRegionId(new URLSearchParams(window.location.search).get("region"));
}

const cache = new Map<RegionId, Beach[]>();
async function loadBeaches(region: RegionId = activeRegionId()): Promise<Beach[]> {
  const cached = cache.get(region);
  if (cached) return cached;
  try {
    const res = await fetch(withBase(dataPath(region, "beach-quality.json")));
    // Guard the shape, not just the status: a non-array body (error page, junk
    // JSON) must degrade to "no beaches", never throw downstream (never-throw).
    const body: unknown = res.ok ? await res.json() : null;
    const beaches = Array.isArray(body) ? (body as Beach[]) : [];
    cache.set(region, beaches);
    return beaches;
  } catch {
    cache.set(region, []);
    return [];
  }
}

/** Nearest monitored beach within ~6 km of `pin`, or null (not near the bay). */
export async function fetchNearestBeach(
  pin: LngLat,
  maxKm = 6,
  region: RegionId = activeRegionId()
): Promise<NearestBeach | null> {
  return nearestBeach(await loadBeaches(region), pin, maxKm);
}
