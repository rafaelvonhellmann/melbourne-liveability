/**
 * Real DRIVING travel time + road distance from the property pin to a buyer's
 * saved anchor (work / school / family), for the "Distance to your places"
 * section. Upgrade over the straight-line ("as the crow flies") default, which
 * understates real trips - a straight line is not a road.
 *
 * Keyless by default: uses the public OpenStreetMap Valhalla routing service (no
 * API key, CORS-open) so the feature works on the static deploy out of the box.
 * If NEXT_PUBLIC_ORS_API_KEY is set, it upgrades to OpenRouteService directions.
 *
 * Same design constraints as reachability.ts: a runtime, client-side fetch
 * (static-export safe, no server route), provider-isolated, and never throwing
 * to the caller - on any failure callers keep the straight-line distance.
 * OSM-derived routing (ODbL); attribute contributors.
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";

const ORS_DRIVE_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const VALHALLA_ROUTE_URL = "https://valhalla1.openstreetmap.de/route";

/** ORS API key (shared with the reachability feature). Public by necessity. */
function orsApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ORS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function orsDriveUrl(): string {
  const u = process.env.NEXT_PUBLIC_DRIVE_ROUTE_URL;
  return u && u.trim() ? u.trim() : ORS_DRIVE_URL;
}

function valhallaRouteUrl(): string {
  const u = process.env.NEXT_PUBLIC_VALHALLA_ROUTE_URL;
  return u && u.trim() ? u.trim() : VALHALLA_ROUTE_URL;
}

/**
 * Always true: a keyless default (public Valhalla) means driving times are
 * available on every deploy. Kept as a hook so a deployment could disable it.
 */
export function isDriveRoutingConfigured(): boolean {
  return true;
}

export type DriveRoute =
  | { ok: true; durationMin: number; distanceKm: number }
  | { ok: false; reason: string };

/**
 * Pull duration (minutes) + distance (km) out of an ORS directions GeoJSON
 * response. Pure (no network) so it is unit-testable.
 */
export function parseOrsDrive(json: unknown): { durationMin: number; distanceKm: number } | null {
  if (!json || typeof json !== "object") return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const props = (features[0] as { properties?: unknown } | null)?.properties;
  const summary = (props as { summary?: unknown } | null)?.summary as
    | { duration?: unknown; distance?: unknown }
    | undefined;
  const dur = Number(summary?.duration);
  const dist = Number(summary?.distance);
  if (!Number.isFinite(dur) || !Number.isFinite(dist)) return null;
  return {
    durationMin: Math.round(dur / 60),
    distanceKm: Math.round((dist / 1000) * 10) / 10,
  };
}

/**
 * Pull duration (minutes) + distance (km) out of a Valhalla /route response.
 * trip.summary.time is seconds; .length is kilometres (we request km units).
 * Pure (no network) so it is unit-testable.
 */
export function parseValhallaRoute(
  json: unknown
): { durationMin: number; distanceKm: number } | null {
  if (!json || typeof json !== "object") return null;
  const summary = (json as { trip?: { summary?: unknown } }).trip?.summary as
    | { time?: unknown; length?: unknown }
    | undefined;
  const time = Number(summary?.time);
  const length = Number(summary?.length);
  if (!Number.isFinite(time) || !Number.isFinite(length)) return null;
  return {
    durationMin: Math.round(time / 60),
    distanceKm: Math.round(length * 10) / 10,
  };
}

/**
 * Fetch a driving route from `from` to `to` ([lng, lat] each). Uses ORS when a
 * key is set, else the keyless public Valhalla service. Never throws: returns
 * `{ ok: false }` on any failure - callers then keep the straight-line distance.
 */
export async function fetchDriveRoute(
  from: LngLat,
  to: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<DriveRoute> {
  const key = orsApiKey();
  const t = timeoutSignal(9000, opts.signal);
  try {
    if (key) {
      const res = await fetch(orsDriveUrl(), {
        method: "POST",
        signal: t.signal,
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
          Accept: "application/geo+json, application/json",
        },
        body: JSON.stringify({ coordinates: [from, to] }),
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const parsed = parseOrsDrive(await res.json());
      if (!parsed) return { ok: false, reason: "no-route" };
      return { ok: true, ...parsed };
    }
    const res = await fetch(valhallaRouteUrl(), {
      method: "POST",
      signal: t.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [
          { lat: from[1], lon: from[0] },
          { lat: to[1], lon: to[0] },
        ],
        costing: "auto",
        units: "kilometers",
      }),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const parsed = parseValhallaRoute(await res.json());
    if (!parsed) return { ok: false, reason: "no-route" };
    return { ok: true, ...parsed };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === "AbortError" ? "aborted" : "network" };
  } finally {
    t.clear();
  }
}
