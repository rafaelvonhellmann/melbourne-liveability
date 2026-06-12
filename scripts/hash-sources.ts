/**
 * Computes sha256 of each raw source file and writes the hash into
 * data/generated/sources.json (ULTRAPLAN §5.9 provenance manifest).
 *
 * Derived sources (no single raw file, e.g. composite ratios) are left blank
 * and recorded in MISSING for visibility. Run after data:fetch / data:gtfs /
 * data:hazards so the local raw files exist.
 *
 * Per-region manifests (Wave 2 item 4): the default (melbourne) run updates
 * sources.json in place exactly as before; any other region emits
 * sources.{region}.json - the melbourne template filtered to the ids that
 * region's places artifact references, plus its own GTFS entry - into BOTH
 * data/generated (committed provenance) and public/data (fetched by the
 * frontend trust drawer, with melbourne fallback).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import {
  IS_DEFAULT_REGION,
  PIPELINE_REGION,
  generatedOutPath,
  outName,
  publicOutPath,
} from "./lib/pipeline-region.js";
import { GTFS_SOURCES } from "./lib/gtfs-constants.js";
import {
  buildRegionSourceEntries,
  collectSourceIds,
  type ManifestSource,
} from "./lib/region-sources.js";

/** sourceId → raw file (relative to data/raw, or data/generated for derived precompute). */
const SOURCE_FILES: Record<string, { dir: "raw" | "generated" | "public"; file: string }> = {
  "abs-sa2-income-dbr": { dir: "raw", file: "abs-sa2-income.json" },
  "abs-census-rent-2021": { dir: "raw", file: "abs-sa2-rent.json" },
  "abs-erp-sa2": { dir: "raw", file: "abs-sa2-erp.json" },
  "abs-erp-sa2-series": { dir: "raw", file: "abs-sa2-erp-series.json" },
  "vcsa-recorded-offences": { dir: "raw", file: "vcsa-lga-offences.xlsx" },
  "act-policing-crime-statistics": { dir: "raw", file: "act-crime-statistics.xlsx" },
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
  "vic-doe-school-locations": { dir: "raw", file: "vic-schools-by-sa2.json" },
};

type Source = ManifestSource;

async function sha256(file: string): Promise<string | null> {
  try {
    const buf = await readFile(file);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

function dirBase(dir: "raw" | "generated" | "public"): string {
  return dir === "raw" ? RAW : dir === "public" ? PUBLIC_DATA : GENERATED;
}

/** The default (melbourne) path, unchanged: update sources.json in place. */
async function hashDefaultManifest() {
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
    const hash = await sha256(path.join(dirBase(map.dir), map.file));
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

/**
 * Non-default regions: emit sources.{region}.json. The melbourne manifest is
 * the metadata template; entries are filtered to the source ids the region's
 * scored places artifact actually references (so a Brisbane manifest never
 * lists VIC sources), the region's GTFS feed entry is added from GTFS_SOURCES,
 * and hashes come from THIS run's raw files (the raw dir holds the last
 * region fetched - in the pipeline, this region's).
 */
async function hashRegionManifest() {
  const template = JSON.parse(
    await readFile(path.join(GENERATED, "sources.json"), "utf8")
  ) as Source[];
  // Fails loud when the region hasn't been scored yet - data:hash runs after
  // data:score in scripts/build.ts.
  const places = JSON.parse(
    await readFile(generatedOutPath("places.json"), "utf8")
  ) as unknown;
  const ids = collectSourceIds(places);

  // Region GTFS provenance: only when this region's precompute artifact exists
  // (a key-gated or feed-less region honestly has no GTFS entry).
  const gtfsMeta = GTFS_SOURCES[PIPELINE_REGION.id];
  let gtfs: { meta: typeof gtfsMeta; period?: string } | undefined;
  try {
    const g = JSON.parse(
      await readFile(generatedOutPath("gtfs-transport.json"), "utf8")
    ) as { period?: string };
    gtfs = { meta: gtfsMeta, period: g.period };
  } catch {
    /* no GTFS artifact - transit ran on the OSM fallback */
  }

  const entries = buildRegionSourceEntries(template, ids, gtfs);

  // Previous region manifest (if any) drives the fetchedAt stamping, same
  // hash-changed rule as the melbourne path.
  const outPath = generatedOutPath("sources.json");
  const prev = new Map<string, Source>();
  try {
    for (const s of JSON.parse(await readFile(outPath, "utf8")) as Source[]) {
      prev.set(s.id, s);
    }
  } catch {
    /* first bake for this region */
  }

  const today = new Date().toISOString().slice(0, 10);
  const missing: string[] = [];
  let hashed = 0;

  for (const s of entries) {
    if (s.derived) {
      s.sha256 = "";
      continue;
    }
    // The region's own GTFS id isn't in SOURCE_FILES (that table maps the
    // melbourne raw set) - hash the region-suffixed precompute artifact, the
    // exact analogue of melbourne's ptv-gtfs -> gtfs-transport.json mapping.
    const map =
      s.id === gtfsMeta.sourceId
        ? { dir: "generated" as const, file: outName("gtfs-transport.json") }
        : SOURCE_FILES[s.id];
    if (!map) {
      missing.push(`${s.id} (no file mapping)`);
      continue;
    }
    const hash = await sha256(path.join(dirBase(map.dir), map.file));
    if (hash) {
      const before = prev.get(s.id);
      s.fetchedAt =
        before?.sha256 === hash ? before.fetchedAt ?? today : today;
      s.sha256 = hash;
      hashed++;
    } else {
      missing.push(`${s.id} (${map.file} not found - run fetch first)`);
    }
  }

  const json = JSON.stringify(entries, null, 2) + "\n";
  await writeFile(outPath, json);
  // Public copy: the trust drawer fetches /data/sources.{region}.json at
  // runtime (melbourne stays a build-time import of data/generated).
  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(publicOutPath("sources.json"), json);
  console.log(
    `Wrote ${outName("sources.json")} (${entries.length} sources, ${hashed} hashed).`
  );
  if (missing.length) {
    console.warn("No hash for:\n  " + missing.join("\n  "));
  }
}

async function main() {
  if (IS_DEFAULT_REGION) {
    await hashDefaultManifest();
  } else {
    console.log(
      `hash-sources: emitting per-region manifest for ${PIPELINE_REGION.label}.`
    );
    await hashRegionManifest();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
