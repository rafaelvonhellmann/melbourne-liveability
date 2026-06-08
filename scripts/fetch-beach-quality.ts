/**
 * Builds public/data/beach-quality.json = [{ name, lng, lat, grade, value, date }]
 * from the EPA Victoria Beach Report enterococci file (raw bacterial counts, no
 * coordinates). We normalise the 59 messy site labels (typos, "...LSC", renamed
 * sites) to canonical beaches, attach hand-curated coordinates for the well-known
 * monitored bay beaches, take the latest sample per beach, and derive a
 * swim-safety grade from the single-sample enterococci count (NHMRC/EPA triggers:
 * <=40 Good, 41-200 Fair, >200 Poor). The runtime lens (lib/beach-quality.ts)
 * shows the nearest beach to a dropped pin. Context only, never scored.
 *
 * Honest scope: "latest measured" sample (sampling is summer-only + weekly), NOT
 * EPA's live rain-driven forecast (no open API). Coverage = the curated beaches
 * below (the populous bay beaches); obscure sites without a coordinate are
 * dropped. CC BY 4.0 (EPA Victoria / DataVic). Run: npm run data:beach.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const XLSX_URL =
  "https://apps.epa.vic.gov.au/datavic/Data_Vic/BeachReport/Beach_Report_enterococci_data.xlsx";
const PUBLIC_DATA = path.join(process.cwd(), "public", "data");

/** Canonical monitored beaches -> [lng, lat]. Curated from EPA Beach Report sites. */
const BEACH_COORDS: Record<string, [number, number]> = {
  Altona: [144.83, -37.868],
  Williamstown: [144.894, -37.872],
  "Port Melbourne": [144.94, -37.84],
  Sandridge: [144.935, -37.843],
  "South Melbourne": [144.955, -37.846],
  "St Kilda": [144.974, -37.868],
  Elwood: [144.978, -37.884],
  Brighton: [144.984, -37.918],
  Hampton: [144.997, -37.937],
  Sandringham: [145.003, -37.951],
  "Half Moon Bay": [145.015, -37.965],
  "Black Rock": [145.015, -37.973],
  Beaumaris: [145.04, -37.987],
  Mentone: [145.066, -37.983],
  Mordialloc: [145.087, -37.99],
  Aspendale: [145.099, -38.027],
  Carrum: [145.12, -38.075],
  Seaford: [145.13, -38.1],
  Frankston: [145.123, -38.143],
  "Canadian Bay": [145.05, -38.25],
  Mornington: [145.038, -38.218],
  "Mount Martha": [145.01, -38.28],
  "Safety Beach": [144.99, -38.31],
  Dromana: [144.96, -38.33],
  Rosebud: [144.9, -38.36],
  Rye: [144.83, -38.37],
  Blairgowrie: [144.78, -38.36],
  Sorrento: [144.74, -38.34],
  Portsea: [144.72, -38.32],
  Portarlington: [144.65, -38.11],
  "St Leonards": [144.72, -38.17],
  "Werribee South": [144.69, -37.97],
  "Eastern Beach": [144.366, -38.146],
};

/** Normalise a raw EPA site label to a canonical beach key in BEACH_COORDS. */
function canonical(raw: string): string | null {
  let s = raw.toLowerCase();
  s = s
    .replace(/surf life saving club|life saving club|coast guard|\blsc\b/g, "")
    .replace(/\(new site\)|\(previous site\)|harbour/g, "")
    .replace(/\bbeach\b/g, "")
    .replace(/\bsth\b/g, "south")
    .replace(/\bmt\b/g, "mount")
    .replace(/frankson/g, "frankston")
    .replace(/wiliamstown/g, "williamstown")
    .replace(/\s+/g, " ")
    .trim();
  for (const key of Object.keys(BEACH_COORDS)) {
    if (key.toLowerCase() === s) return key;
  }
  return null;
}

// Grade the TYPICAL (median) recent reading - a single post-rain spike shouldn't
// brand a usually-clean beach "Poor". NHMRC/EPA single-sample triggers as bands.
function grade(value: number): "Good" | "Fair" | "Poor" {
  if (value <= 40) return "Good";
  if (value <= 200) return "Fair";
  return "Poor";
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Excel-serial or Date cell -> epoch ms (0 if unparseable). */
function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? (n - 25569) * 86400000 : 0;
}

type Row = {
  "Site Name"?: string;
  "Sample datetime"?: string | number | Date;
  "Enterococci value (orgs/100 mL)"?: number;
};

async function main() {
  const buf = Buffer.from(
    await (await fetch(XLSX_URL, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer()
  );
  const wb = XLSX.read(buf, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]]);

  // Collect (ms, value) samples per canonical beach.
  const samples = new Map<string, { ms: number; value: number }[]>();
  for (const r of rows) {
    const key = r["Site Name"] ? canonical(String(r["Site Name"])) : null;
    if (!key) continue;
    const value = Number(r["Enterococci value (orgs/100 mL)"]);
    if (!Number.isFinite(value)) continue;
    (samples.get(key) ?? samples.set(key, []).get(key)!).push({ ms: toMs(r["Sample datetime"]), value });
  }

  const out = Object.entries(BEACH_COORDS)
    .filter(([name]) => (samples.get(name)?.length ?? 0) > 0)
    .map(([name, [lng, lat]]) => {
      const recent = [...samples.get(name)!].sort((a, b) => b.ms - a.ms).slice(0, 30);
      const med = median(recent.map((s) => s.value));
      const latestMs = recent[0].ms;
      return {
        name,
        lng,
        lat,
        grade: grade(med),
        value: Math.round(med),
        n: recent.length,
        date: latestMs ? new Date(latestMs).toISOString().slice(0, 10) : "",
      };
    });

  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(path.join(PUBLIC_DATA, "beach-quality.json"), JSON.stringify(out));
  console.log(`Wrote beach-quality.json (${out.length} beaches with coords + latest grade)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
