/**
 * NSW Beachwatch public data feed -> Festra beach-quality artifact.
 *
 * Source:
 *   https://api.beachwatch.nsw.gov.au/public/sites/geojson
 *   https://api.beachwatch.nsw.gov.au/trend/enterococci?id={siteGuid}&start_period=0&end_period=253385374611
 *
 * The Beachwatch app documents these as public "Beachwatch data feeds", updated
 * twice daily, for use in web/mobile applications. The app's data-feed page
 * links the Creative Commons Attribution 4.0 International licence:
 *   https://creativecommons.org/licenses/by/4.0/deed.en
 *
 * Normalisation mirrors scripts/fetch-beach-quality.ts: keep monitored sites
 * inside Greater Sydney, take the median of the latest 30 enterococci samples,
 * and emit the same public/data/beach-quality*.json row shape used by the
 * Melbourne card. NSW Beachwatch has a 4-band display (Good, Fair, Poor, Bad);
 * Festra's existing card has 3 bands, so Bad collapses into Poor.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Beach } from "../../lib/beach-quality.js";
import { getRegion, regionDataFile, type Region } from "../../lib/regions.js";
import { browserFetch } from "./gov-fetch.js";
import { PUBLIC_DATA } from "./paths.js";

export const NSW_BEACHWATCH_SOURCE_ID = "nsw-beachwatch";
export const NSW_BEACHWATCH_GEOJSON_URL =
  "https://api.beachwatch.nsw.gov.au/public/sites/geojson";
export const NSW_BEACHWATCH_ENTEROCOCCI_URL =
  "https://api.beachwatch.nsw.gov.au/trend/enterococci";
export const NSW_BEACHWATCH_LICENCE = "CC BY 4.0";

const TREND_END_PERIOD = "253385374611";
const DEFAULT_RECENT_SAMPLES = 30;

type BeachwatchProperties = {
  id?: unknown;
  siteName?: unknown;
  latestResult?: unknown;
  latestResultObservationDate?: unknown;
};

type BeachwatchFeature = {
  type?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
  properties?: BeachwatchProperties;
};

type BeachwatchFeatureCollection = {
  type?: unknown;
  features?: unknown;
};

export type BeachwatchSite = {
  id: string;
  name: string;
  lng: number;
  lat: number;
};

export type EnterococciSample = {
  ms: number;
  value: number;
};

type TrendRow = {
  MeasurementDt?: unknown;
  EntPer100Ml?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRegion(region: Region, lng: number, lat: number): boolean {
  const { west, east, south, north } = region.bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function gradeEnterococci(value: number): Beach["grade"] {
  if (value <= 40) return "Good";
  if (value <= 200) return "Fair";
  return "Poor";
}

function parseMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function isoDate(ms: number): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

export function parseBeachwatchSites(
  geojson: BeachwatchFeatureCollection,
  region: Region = getRegion("sydney")
): BeachwatchSite[] {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const sites: BeachwatchSite[] = [];

  for (const raw of features) {
    const feature = raw as BeachwatchFeature;
    const coords = feature.geometry?.coordinates;
    if (
      feature.type !== "Feature" ||
      feature.geometry?.type !== "Point" ||
      !Array.isArray(coords) ||
      coords.length < 2
    ) {
      continue;
    }
    const [lng, lat] = coords;
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) continue;
    if (!inRegion(region, lng, lat)) continue;

    const id =
      typeof feature.properties?.id === "string"
        ? feature.properties.id.trim()
        : "";
    const name =
      typeof feature.properties?.siteName === "string"
        ? feature.properties.siteName.trim()
        : "";
    if (!id || !name) continue;
    sites.push({ id, name, lng, lat });
  }

  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseEnterococciTrend(rows: unknown): EnterococciSample[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const r = row as TrendRow;
      const value = Number(r.EntPer100Ml);
      return {
        ms: parseMs(r.MeasurementDt),
        value,
      };
    })
    .filter((s) => s.ms > 0 && Number.isFinite(s.value))
    .sort((a, b) => b.ms - a.ms);
}

export function normalizeNswBeachwatch(
  sites: BeachwatchSite[],
  samplesBySite: Map<string, EnterococciSample[]>,
  recentSamples = DEFAULT_RECENT_SAMPLES
): Beach[] {
  return sites
    .map((site) => {
      const recent = (samplesBySite.get(site.id) ?? []).slice(0, recentSamples);
      if (recent.length === 0) return null;
      const value = Math.round(median(recent.map((sample) => sample.value)));
      return {
        name: site.name,
        lng: site.lng,
        lat: site.lat,
        grade: gradeEnterococci(value),
        value,
        n: recent.length,
        date: isoDate(recent[0].ms),
      } satisfies Beach;
    })
    .filter((row): row is Beach => row != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await browserFetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Beachwatch fetch ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchEnterococciTrend(
  siteId: string
): Promise<EnterococciSample[]> {
  const url = new URL(NSW_BEACHWATCH_ENTEROCOCCI_URL);
  url.searchParams.set("id", siteId);
  url.searchParams.set("start_period", "0");
  url.searchParams.set("end_period", TREND_END_PERIOD);
  return parseEnterococciTrend(await fetchJson<unknown>(url.toString()));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        out[index] = await fn(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

export async function fetchNswBeachwatchSydney(
  recentSamples = DEFAULT_RECENT_SAMPLES
): Promise<Beach[]> {
  const region = getRegion("sydney");
  const geojson = await fetchJson<BeachwatchFeatureCollection>(
    NSW_BEACHWATCH_GEOJSON_URL
  );
  const sites = parseBeachwatchSites(geojson, region);
  const trends = await mapWithConcurrency(sites, 8, async (site) => [
    site.id,
    await fetchEnterococciTrend(site.id),
  ] as const);
  return normalizeNswBeachwatch(sites, new Map(trends), recentSamples);
}

export async function writeNswBeachwatchSydney(
  dest = path.join(PUBLIC_DATA, regionDataFile("sydney", "beach-quality.json"))
): Promise<Beach[]> {
  const rows = await fetchNswBeachwatchSydney();
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(rows));
  return rows;
}

function isMain(): boolean {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return fileURLToPath(import.meta.url) === entry;
}

if (isMain()) {
  writeNswBeachwatchSydney()
    .then((rows) => {
      console.log(
        `Wrote ${regionDataFile("sydney", "beach-quality.json")} (${rows.length} Beachwatch sites)`
      );
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
