/**
 * Curated flagship VIC "Big Build" transport projects -> data/generated/major-projects.json.
 *
 * There is no clean open GeoJSON of Big Build sites, so we curate a small, named
 * set (Metro Tunnel + Suburban Rail Loop East stations) and resolve each to a
 * coordinate via OSM Nominatim rather than hand-typing them (sourced, not
 * fabricated). Every result is sanity-checked to be inside Greater Melbourne and
 * near its expected suburb; anything that fails is dropped + reported, never
 * guessed. Re-run when the curated list changes.
 *
 * Display use is a proximity NUDGE in the buyer report ("a major project is ~Xm
 * away"), with a generous threshold + the official project link — so ~100-300 m
 * of geocode error is immaterial and the user verifies specifics at the source.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED } from "./lib/paths.js";

const UA = "MelbourneLiveability/1.0 (liveable.melbourne; data build)";
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MELB = { west: 144.3, east: 145.7, south: -38.55, north: -37.4 };

type Curated = {
  id: string;
  name: string;
  kind: "metro-tunnel" | "srl-east";
  status: string;
  /** Free-text query + a [lng,lat] we expect it near, for sanity-checking. */
  query: string;
  near: [number, number];
  sourceUrl: string;
};

const PROJECT = {
  "metro-tunnel": {
    label: "Metro Tunnel (new underground station)",
    sourceUrl: "https://bigbuild.vic.gov.au/projects/metro-tunnel",
    period: "opening 2025",
  },
  "srl-east": {
    label: "Suburban Rail Loop East (new station)",
    sourceUrl: "https://bigbuild.vic.gov.au/projects/suburban-rail-loop",
    period: "under construction, opening ~2035",
  },
} as const;

const CURATED: Curated[] = [
  { id: "mt-arden", name: "Arden", kind: "metro-tunnel", status: "opening 2025", query: "Arden railway station, North Melbourne, Victoria", near: [144.945, -37.806], sourceUrl: PROJECT["metro-tunnel"].sourceUrl },
  { id: "mt-parkville", name: "Parkville", kind: "metro-tunnel", status: "opening 2025", query: "Parkville railway station, Parkville, Victoria", near: [144.961, -37.799], sourceUrl: PROJECT["metro-tunnel"].sourceUrl },
  { id: "mt-state-library", name: "State Library", kind: "metro-tunnel", status: "opening 2025", query: "State Library railway station, Melbourne, Victoria", near: [144.965, -37.810], sourceUrl: PROJECT["metro-tunnel"].sourceUrl },
  { id: "mt-town-hall", name: "Town Hall", kind: "metro-tunnel", status: "opening 2025", query: "Town Hall railway station, Melbourne, Victoria", near: [144.967, -37.815], sourceUrl: PROJECT["metro-tunnel"].sourceUrl },
  { id: "mt-anzac", name: "Anzac", kind: "metro-tunnel", status: "opening 2025", query: "Anzac railway station, Melbourne, Victoria", near: [144.979, -37.834], sourceUrl: PROJECT["metro-tunnel"].sourceUrl },
  { id: "srl-cheltenham", name: "Cheltenham", kind: "srl-east", status: "under construction", query: "Cheltenham railway station, Victoria, Australia", near: [145.052, -37.954], sourceUrl: PROJECT["srl-east"].sourceUrl },
  { id: "srl-clayton", name: "Clayton", kind: "srl-east", status: "under construction", query: "Clayton railway station, Victoria, Australia", near: [145.121, -37.924], sourceUrl: PROJECT["srl-east"].sourceUrl },
  { id: "srl-monash", name: "Monash", kind: "srl-east", status: "under construction", query: "Monash University, Clayton, Victoria", near: [145.134, -37.911], sourceUrl: PROJECT["srl-east"].sourceUrl },
  { id: "srl-glen-waverley", name: "Glen Waverley", kind: "srl-east", status: "under construction", query: "Glen Waverley railway station, Victoria, Australia", near: [145.163, -37.879], sourceUrl: PROJECT["srl-east"].sourceUrl },
  { id: "srl-burwood", name: "Burwood", kind: "srl-east", status: "under construction", query: "Deakin University, Burwood, Victoria", near: [145.115, -37.847], sourceUrl: PROJECT["srl-east"].sourceUrl },
  { id: "srl-box-hill", name: "Box Hill", kind: "srl-east", status: "under construction", query: "Box Hill railway station, Victoria, Australia", near: [145.122, -37.819], sourceUrl: PROJECT["srl-east"].sourceUrl },
];

const km = (a: number[], b: number[]) => {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]), dLng = r(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

async function geocode(q: string): Promise<[number, number] | null> {
  const params = new URLSearchParams({ format: "jsonv2", q, countrycodes: "au", limit: "1" });
  const res = await fetch(`${ENDPOINT}?${params}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const r = rows[0];
  if (!r?.lat || !r?.lon) return null;
  const lat = Number(r.lat), lng = Number(r.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
}

async function main() {
  const out: Record<string, unknown>[] = [];
  for (const c of CURATED) {
    const coord = await geocode(c.query);
    await new Promise((r) => setTimeout(r, 1200)); // Nominatim: <= 1 req/sec
    if (!coord) { console.warn(`DROP ${c.id}: no geocode for "${c.query}"`); continue; }
    const inMelb = coord[0] >= MELB.west && coord[0] <= MELB.east && coord[1] <= MELB.north && coord[1] >= MELB.south;
    const d = km(coord, c.near);
    if (!inMelb || d > 3) { console.warn(`DROP ${c.id}: geocode ${coord} is ${d.toFixed(1)}km from expected / outside Melbourne`); continue; }
    console.log(`OK   ${c.id.padEnd(18)} ${coord[1].toFixed(5)},${coord[0].toFixed(5)}  (${d.toFixed(2)}km from expected)`);
    out.push({ id: c.id, name: c.name, kind: c.kind, label: PROJECT[c.kind].label, status: c.status, lat: coord[1], lng: coord[0], sourceUrl: c.sourceUrl, period: PROJECT[c.kind].period });
  }
  const file = path.join(GENERATED, "major-projects.json");
  await writeFile(file, JSON.stringify({ generatedAt: "build", source: "Curated VIC Big Build list; coordinates resolved via OSM Nominatim", projects: out }, null, 2));
  console.log(`\nWrote ${out.length}/${CURATED.length} projects -> ${file}`);
}

main();
