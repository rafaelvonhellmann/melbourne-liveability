import type { DomainId, ScoreWeights } from "./types";
import { V1_SCORED_DOMAINS } from "./domains";
import { parseWeightsFromSearchParams, serializeWeights } from "./weights";
import {
  parseInterestView,
  legacyPersonaToView,
  type InterestViewId,
} from "./interest-views";
import { BASE_PATH } from "./asset-path";
import REGIONS from "./regions";

export type MapUrlState = {
  weights: ScoreWeights | null;
  shortlist: string[];
  view: InterestViewId | null;
  /** Optional one-shot deep-link to activate a specific choropleth domain. */
  layer: DomainId | null;
  /** Optional one-shot deep-link to focus a place by slug (?select=<slug>). */
  select: string | null;
  /** Buyer "Location Check" mode active (?buyer=1). */
  buyer: boolean;
  /** Dropped buyer pin as [lng, lat], or null. Restored from ?lat=&lng=. */
  pin: [number, number] | null;
};

// Generous Greater-Melbourne bounding box - rejects junk / out-of-region coords
// so a crafted URL cannot drop a pin in the ocean or interstate. Derived from
// the region registry's melbourne pinBbox (lib/regions.ts); values unchanged.
const PIN_BBOX = REGIONS.melbourne.pinBbox;
const MEL_BBOX = {
  minLng: PIN_BBOX.west,
  maxLng: PIN_BBOX.east,
  minLat: PIN_BBOX.south,
  maxLat: PIN_BBOX.north,
};

/**
 * Whether a coordinate falls inside the Greater-Melbourne bounding box. Exported
 * so the geocode/address path can enforce the same hard bound that URL pins get
 * (Nominatim's bounded=1 is a preference, not a guarantee).
 */
export function inMelbourneBBox(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= MEL_BBOX.minLat &&
    lat <= MEL_BBOX.maxLat &&
    lng >= MEL_BBOX.minLng &&
    lng <= MEL_BBOX.maxLng
  );
}

function parsePin(latRaw: string | null, lngRaw: string | null): [number, number] | null {
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < MEL_BBOX.minLat || lat > MEL_BBOX.maxLat) return null;
  if (lng < MEL_BBOX.minLng || lng > MEL_BBOX.maxLng) return null;
  return [lng, lat];
}

function parseLayer(raw: string | null): DomainId | null {
  if (!raw) return null;
  return (V1_SCORED_DOMAINS as string[]).includes(raw)
    ? (raw as DomainId)
    : null;
}

// Place slugs are kebab-case name + numeric SA2 code (e.g. "brunswick-east-206011106").
// Constrain the deep-link to that alphabet so a crafted ?select= can only ever
// match a real slug lookup, never inject anything else.
function parseSelect(raw: string | null): string | null {
  if (!raw) return null;
  return /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null;
}

export function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function serializeList(slugs: string[]): string {
  return slugs.join(",");
}

export function parseMapUrlState(search: string): MapUrlState {
  const params = new URLSearchParams(search);
  return {
    weights: parseWeightsFromSearchParams(search),
    shortlist: parseListParam(params.get("list")),
    // Legacy ?persona= links resolve to the lens each retired preset folded into.
    view:
      parseInterestView(params.get("view")) ??
      legacyPersonaToView(params.get("persona")),
    layer: parseLayer(params.get("layer")),
    select: parseSelect(params.get("select")),
    buyer: params.get("buyer") === "1",
    pin: parsePin(params.get("lat"), params.get("lng")),
  };
}

export function buildMapUrl(
  base: string,
  state: Partial<MapUrlState>
): string {
  const params = new URLSearchParams();
  if (state.weights && Object.keys(state.weights).length > 0) {
    params.set("w", serializeWeights(state.weights));
  }
  if (state.shortlist && state.shortlist.length > 0) {
    params.set("list", serializeList(state.shortlist));
  }
  if (state.view && state.view !== "general") params.set("view", state.view);
  if (state.layer) params.set("layer", state.layer);
  if (state.select) params.set("select", state.select);
  if (state.buyer) params.set("buyer", "1");
  if (state.pin) {
    // URL exposes lat/lng (human-readable); pin is stored [lng, lat] internally.
    params.set("lat", state.pin[1].toFixed(6));
    params.set("lng", state.pin[0].toFixed(6));
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function buildCompareUrl(slugs: string[], weights?: ScoreWeights): string {
  const params = new URLSearchParams();
  if (slugs.length > 0) params.set("list", serializeList(slugs.slice(0, 4)));
  if (weights) params.set("w", serializeWeights(weights));
  const q = params.toString();
  return q ? `/compare?${q}` : "/compare";
}

/**
 * Absolute, sub-path-safe href for copy/share. buildMapUrl/buildCompareUrl return
 * root-relative paths ("/", "/compare?...") for in-app router nav; copying them
 * to the clipboard needs origin + the deploy base path, or the link 404s on a
 * GitHub Pages project site (e.g. /melbourne-liveability). basePath is injectable
 * for tests; defaults to the build-time BASE_PATH.
 */
export function shareHref(origin: string, path: string, basePath: string = BASE_PATH): string {
  const prefixed = path.startsWith("/") ? `${basePath}${path}` : `${basePath}/${path}`;
  return `${origin}${prefixed}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
