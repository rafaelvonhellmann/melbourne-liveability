/**
 * Government vs Catholic vs Independent school MIX per SA2, from the Victorian
 * Department of Education "School Locations" open dataset (CC-BY 4.0). We take
 * each OPEN school's sector + coordinate, point-in-polygon it into its SA2, and
 * count the sector split per area. Context only, never scored.
 *
 * Writes data/raw/vic-schools-by-sa2.json = { period, places: { sa2: {gov,
 * catholic, independent} } }. Run `npm run data:schools`, then
 * `npm run data:apply-schools` (or data:normalize). Counts only (not enrolment-
 * weighted) - enough for the public/private mix; enrolments are a later add.
 *
 * Annual refresh: the dv### file prefix increments each year - if the URL 404s,
 * find the live resource at discover.data.vic.gov.au/dataset/school-locations-<year>.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import * as turf from "@turf/turf";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW } from "./lib/paths.js";

const execFileAsync = promisify(execFile);

const PERIOD = "2025";
const CSV_URL =
  "https://www.education.vic.gov.au/Documents/about/research/datavic/dv402-SchoolLocations2025.csv";
const UA = "MelbourneLiveability/1.0 (+https://liveable.melbourne)";

export type SchoolMix = { government: number; catholic: number; independent: number };

/** Parse one CSV line into fields, honouring double-quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchCsv(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return await res.text();
    console.warn(`  undici ${res.status}; falling back to curl`);
  } catch (e) {
    console.warn(`  undici failed (${(e as Error).message}); curl fallback`);
  }
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-L", "-f", "--retry", "2", "--max-time", "120", "-H", `User-Agent: ${UA}`, url],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout;
}

function sectorKey(raw: string): keyof SchoolMix | null {
  const s = raw.trim().toLowerCase();
  if (s === "government") return "government";
  if (s === "catholic") return "catholic";
  if (s === "independent") return "independent";
  return null;
}

async function main() {
  console.log("VIC DoE school locations (sector mix per SA2)...");
  const text = (await fetchCsv(CSV_URL)).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, "").trim());
  const col = (name: string) => header.indexOf(name);
  const iSector = col("Education_Sector");
  const iStatus = col("School_Status");
  const iX = col("X");
  const iY = col("Y");
  if ([iSector, iStatus, iX, iY].some((i) => i < 0)) {
    throw new Error(`VIC schools CSV: missing a needed column (have: ${header.join(", ")})`);
  }

  const geo = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
  ) as FeatureCollection<Polygon | MultiPolygon, { sa2_code_2021: string }>;

  const bySa2: Record<string, SchoolMix> = {};
  let matched = 0;
  let rows = 0;
  for (let r = 1; r < lines.length; r++) {
    const f = parseCsvLine(lines[r]);
    if (f[iStatus]?.trim() !== "O") continue; // open schools only
    const sector = sectorKey(f[iSector] ?? "");
    const lng = Number(f[iX]);
    const lat = Number(f[iY]);
    if (!sector || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    rows++;
    const pt = turf.point([lng, lat]);
    for (const feat of geo.features) {
      if (turf.booleanPointInPolygon(pt, feat)) {
        const code = feat.properties.sa2_code_2021;
        const m = (bySa2[code] ??= { government: 0, catholic: 0, independent: 0 });
        m[sector]++;
        matched++;
        break;
      }
    }
  }

  await mkdir(RAW, { recursive: true });
  const dest = path.join(RAW, "vic-schools-by-sa2.json");
  await writeFile(dest, JSON.stringify({ period: PERIOD, places: bySa2 }));
  console.log(
    `Wrote ${dest}: ${Object.keys(bySa2).length} SA2s, ${matched}/${rows} open schools matched to a Greater-Melbourne SA2`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
