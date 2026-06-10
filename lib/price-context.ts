/**
 * Suburb price/rent context at a dropped pin - P1-6. Loads the pre-baked
 * public/data/price-context.json (Valuer-General Victoria suburb sale medians +
 * DFFH/Homes Victoria Rental Report moving annual rents, joined to our metro
 * suburb set at bake time by scripts/fetch-vg-prices.ts). Pure client-side,
 * load-once cache, never throws. Context only - NOT a valuation, never scored.
 *
 * Resolution at the pin: try the area/suburb name first (SA2 names are usually
 * suburb names; compound "A - B" SA2 names are tried part by part, and
 * directional names are flipped: "East St Kilda" <-> "St Kilda East"), then
 * fall back to the nearest suburb centroid within a few km.
 */
import { withBase } from "./asset-path";
import { normalizeSuburbName } from "./suburb-normalize";
import { haversineKm, type LngLat } from "./buyer-location";

export type PriceSourceMeta = {
  id: string;
  name: string;
  url: string;
  licence: string;
  period: string;
};

export type SuburbPriceContext = {
  suburb: string;
  /** Suburb centroid (bbox midpoint) for the nearest-suburb fallback. */
  lng?: number;
  lat?: number;
  houseMedianByYear?: Record<string, number>;
  unitMedianByYear?: Record<string, number>;
  /** Moving annual median rent, latest quarters (e.g. "Sep 2025": 550). */
  rentMedianByQuarter?: Record<string, number>;
  /** DFFH groups small suburbs (e.g. "Collingwood-Abbotsford"); kept for honesty. */
  rentArea?: string;
};

export type PriceContextFile = {
  generatedAt: string;
  sources: { house: PriceSourceMeta; unit: PriceSourceMeta; rent: PriceSourceMeta };
  suburbs: Record<string, SuburbPriceContext>;
};

/** "east st kilda" -> "st kilda east" (and back), or null if not directional. */
export function directionalFlip(norm: string): string | null {
  const lead = /^(north|south|east|west) (.+)$/.exec(norm);
  if (lead) return `${lead[2]} ${lead[1]}`;
  const trail = /^(.+) (north|south|east|west)$/.exec(norm);
  if (trail) return `${trail[2]} ${trail[1]}`;
  return null;
}

/** Direct name lookup incl. compound "A - B" names + directional flips. */
export function lookupSuburb(
  file: PriceContextFile,
  name: string
): SuburbPriceContext | null {
  if (!name) return null;
  // Compound SA2 names ("Carlton North - Princes Hill"): try each part in order.
  const parts = name.includes(" - ") ? [name, ...name.split(" - ")] : [name];
  for (const part of parts) {
    const n = normalizeSuburbName(part);
    if (!n) continue;
    const direct = file.suburbs[n];
    if (direct) return direct;
    const flip = directionalFlip(n);
    if (flip && file.suburbs[flip]) return file.suburbs[flip];
  }
  return null;
}

/** Nearest suburb (by baked centroid) within `maxKm` of the pin. */
export function nearestSuburb(
  file: PriceContextFile,
  pin: LngLat,
  maxKm = 5
): { entry: SuburbPriceContext; distanceKm: number } | null {
  let best: { entry: SuburbPriceContext; distanceKm: number } | null = null;
  for (const entry of Object.values(file.suburbs)) {
    if (typeof entry.lng !== "number" || typeof entry.lat !== "number") continue;
    const d = haversineKm(pin, [entry.lng, entry.lat]);
    if (d <= maxKm && (!best || d < best.distanceKm)) {
      best = { entry, distanceKm: Math.round(d * 10) / 10 };
    }
  }
  return best;
}

let cache: PriceContextFile | null = null;

/** Load-once cache of the baked file. Returns null on any failure (never throws). */
export async function loadPriceContext(): Promise<PriceContextFile | null> {
  if (cache) return cache;
  try {
    const res = await fetch(withBase("/data/price-context.json"));
    if (!res.ok) return null;
    const data = (await res.json()) as PriceContextFile;
    if (!data || typeof data !== "object" || !data.suburbs) return null;
    cache = data;
  } catch {
    return null;
  }
  return cache;
}

export type ResolvedPriceContext = {
  entry: SuburbPriceContext;
  matchedBy: "name" | "nearest";
  distanceKm?: number;
  file: PriceContextFile;
};

/** Resolve the price context for a pin: name match first, else nearest centroid. */
export async function resolvePriceContext(
  pin: LngLat,
  areaName?: string | null
): Promise<ResolvedPriceContext | null> {
  const file = await loadPriceContext();
  if (!file) return null;
  if (areaName) {
    const entry = lookupSuburb(file, areaName);
    if (entry) return { entry, matchedBy: "name", file };
  }
  const near = nearestSuburb(file, pin);
  if (near) return { entry: near.entry, matchedBy: "nearest", distanceKm: near.distanceKm, file };
  return null;
}

export type TrendPoint = { period: string; value: number };

/** Sorted yearly points, trimmed to the last `lastN` years; junk values dropped. */
export function yearTrend(
  byYear: Record<string, number> | undefined,
  lastN = 5
): TrendPoint[] {
  if (!byYear) return [];
  return Object.entries(byYear)
    .map(([period, value]) => ({ period, value: Number(value) }))
    .filter((p) => /^\d{4}$/.test(p.period) && Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => Number(a.period) - Number(b.period))
    .slice(-lastN);
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Chronological order key for a "Sep 2025"-style quarter label (NaN if junk). */
function quarterOrder(label: string): number {
  const m = /^([A-Za-z]{3})\w* (\d{4})$/.exec(label.trim());
  if (!m) return NaN;
  const month = MONTH_INDEX[m[1].toLowerCase()];
  return month === undefined ? NaN : Number(m[2]) * 12 + month;
}

/** Latest quarter's rent median, or null. */
export function latestQuarter(
  byQuarter: Record<string, number> | undefined
): TrendPoint | null {
  if (!byQuarter) return null;
  let best: TrendPoint | null = null;
  let bestOrder = -Infinity;
  for (const [period, raw] of Object.entries(byQuarter)) {
    const value = Number(raw);
    const order = quarterOrder(period);
    if (!Number.isFinite(value) || value <= 0 || Number.isNaN(order)) continue;
    if (order > bestOrder) {
      bestOrder = order;
      best = { period, value };
    }
  }
  return best;
}

/** $1,250,000 -> "$1.25m"; $925,000 -> "$925k". "-" for junk. */
export function formatPriceShort(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "-";
  if (v >= 1_000_000) {
    const m = (v / 1_000_000).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
    return `$${m}m`;
  }
  return `$${Math.round(v / 1000)}k`;
}

/** Weekly rent: 550 -> "$550/wk". "-" for junk. */
export function formatRentWeekly(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "-";
  return `$${Math.round(v)}/wk`;
}

/** Percent change first -> last, rounded; null when not computable. */
export function trendChangePct(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) return null;
  return Math.round(((last - first) / first) * 100);
}
