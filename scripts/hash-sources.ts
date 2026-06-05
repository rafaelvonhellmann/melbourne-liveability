/**
 * Computes sha256 of each raw source file and writes the hash into
 * data/generated/sources.json (ULTRAPLAN §5.9 provenance manifest).
 *
 * Derived sources (no single raw file, e.g. composite ratios) are left blank
 * and recorded in MISSING for visibility. Run after data:fetch / data:gtfs /
 * data:hazards so the local raw files exist.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";

/** sourceId → raw file (relative to data/raw, or data/generated for derived precompute). */
const SOURCE_FILES: Record<string, { dir: "raw" | "generated" | "public"; file: string }> = {
  "abs-sa2-income-dbr": { dir: "raw", file: "abs-sa2-income.json" },
  "abs-census-rent-2021": { dir: "raw", file: "abs-sa2-rent.json" },
  "abs-erp-sa2": { dir: "raw", file: "abs-sa2-erp.json" },
  "abs-erp-sa2-series": { dir: "raw", file: "abs-sa2-erp-series.json" },
  "vcsa-recorded-offences": { dir: "raw", file: "vcsa-lga-offences.xlsx" },
  "ptv-gtfs": { dir: "generated", file: "gtfs-transport.json" },
  "osm-pt": { dir: "raw", file: "osm-pt.json" },
  "vic-mapshare-hospitals": { dir: "raw", file: "vic-hospitals.json" },
  "vicmap-police": { dir: "raw", file: "vic-police.json" },
  "vicmap-foi": { dir: "raw", file: "vic-childcare.json" },
  "osm-health": { dir: "raw", file: "osm-health.json" },
  "osm-post": { dir: "raw", file: "osm-post.json" },
  "osm-clinical-social": { dir: "raw", file: "osm-clinical-social.json" },
  "abs-census-labour-2016": { dir: "raw", file: "abs-sa2-employment.json" },
  "abs-census-preschool-2021": { dir: "raw", file: "abs-sa2-employment.json" },
  "vic-planning-bpa": { dir: "raw", file: "vic-bpa.geojson" },
  "vic-planning-flood": { dir: "raw", file: "vic-lsio.geojson" },
  "vic-planning-heritage": { dir: "raw", file: "vic-ho.geojson" },
  "vic-planning-overlays": { dir: "raw", file: "vic-conservation-overlays.geojson" },
  "vic-coastal-inundation": { dir: "raw", file: "vic-sea-level.geojson" },
  "vic-fire-history": { dir: "raw", file: "vic-fire-history.geojson" },
  "vif2023-sa2": { dir: "raw", file: "vif2023-sa2.xlsx" },
  "abs-building-approvals": { dir: "raw", file: "abs-sa2-approvals.json" },
  "vic-school-zones": { dir: "public", file: "school-zones.json" },
  "dtp-aadt": { dir: "public", file: "traffic-aadt.json" },
  "vic-water-corp": { dir: "raw", file: "water-corp.geojson" },
  "epa-air": { dir: "public", file: "epa-air-sites.json" },
  "abs-census-tsp-sa2": { dir: "raw", file: "abs-sa2-affordability.json" },
  "vic-activity-centres": { dir: "public", file: "activity-centres.json" },
  "osm-noise-corridors": { dir: "public", file: "noise-lines.json" },
  "osm-nuisance-points": { dir: "public", file: "nuisance-points.json" },
  "osm-train-stations": { dir: "public", file: "train-stations.json" },
  "osm-schools": { dir: "raw", file: "osm-schools.json" },
  "osm-amenities": { dir: "raw", file: "osm-amenities.json" },
  "osm-cycleways": { dir: "raw", file: "osm-cycleways.json" },
  "osm-aged-care": { dir: "raw", file: "osm-aged-care.json" },
  "abs-seifa-2021": { dir: "raw", file: "abs-sa2-seifa.json" },
  "abs-census-community-2021": { dir: "raw", file: "abs-sa2-community.json" },
  "abs-census-g49-sa2": { dir: "raw", file: "abs-sa2-qualifications.json" },
  "osm-future-transport": { dir: "public", file: "future-transport.json" },
};

type Source = {
  id: string;
  sha256?: string;
  derived?: boolean;
  fetchedAt?: string;
  [k: string]: unknown;
};

async function sha256(file: string): Promise<string | null> {
  try {
    const buf = await readFile(file);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

async function main() {
  const sourcesPath = path.join(GENERATED, "sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8")) as Source[];
  const today = new Date().toISOString().slice(0, 10);

  const missing: string[] = [];
  let hashed = 0;

  for (const s of sources) {
    if (s.derived) {
      s.sha256 = "";
      continue;
    }
    const map = SOURCE_FILES[s.id];
    if (!map) {
      missing.push(`${s.id} (no file mapping)`);
      continue;
    }
    const base = map.dir === "raw" ? RAW : map.dir === "public" ? PUBLIC_DATA : GENERATED;
    const hash = await sha256(path.join(base, map.file));
    if (hash) {
      if (s.sha256 !== hash) {
        // Hash changed (or first run) → the raw file was (re)fetched: stamp it.
        s.fetchedAt = today;
      }
      s.sha256 = hash;
      hashed++;
    } else {
      missing.push(`${s.id} (${map.file} not found - run fetch first)`);
    }
  }

  await writeFile(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
  console.log(`Hashed ${hashed}/${sources.length} sources.`);
  if (missing.length) {
    console.warn("No hash for:\n  " + missing.join("\n  "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
