/**
 * Single entry point for the data pipeline's region selection (P4.1 Phase A).
 *
 * Every fetch/build script scopes itself via PIPELINE_REGION, resolved once
 * per process from (in order): a `--region <id>` / `--region=<id>` CLI arg,
 * the REGION env var, else DEFAULT_REGION (melbourne). Unknown ids throw at
 * import time - a typo must never silently produce Melbourne output labelled
 * as another city.
 *
 * With no arg/env the constants below are byte-for-byte what the pipeline
 * hardcoded pre-registry (2GMEL, the Melbourne Overpass bbox, the
 * sa2-melbourne/sal-vic/lga-vic raw filenames).
 */
import {
  getRegion,
  resolveRegionId,
  overpassBbox,
  type Region,
} from "../../lib/regions.js";

/** Pure argv/env extraction - unit-testable without touching process state. */
export function regionIdFromArgs(
  argv: string[],
  env: Record<string, string | undefined>
): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--region=")) return a.slice("--region=".length);
    if (a === "--region" && argv[i + 1]) return argv[i + 1];
  }
  return env.REGION;
}

/** The region this pipeline run is scoped to (default: melbourne). */
export const PIPELINE_REGION: Region = getRegion(
  resolveRegionId(regionIdFromArgs(process.argv.slice(2), process.env))
);

/** Overpass bbox clause "(south,west,north,east)" for the active region. */
export const OVERPASS_BBOX = overpassBbox(PIPELINE_REGION);

/** Raw ABS boundary filenames, parameterized by region. Melbourne resolves to
 * the historical names (sa2-melbourne / sal-vic / lga-vic .geojson). */
export function sa2RawName(region: Region = PIPELINE_REGION): string {
  return `sa2-${region.id}.geojson`;
}
export function salRawName(region: Region = PIPELINE_REGION): string {
  return `sal-${region.stateSlug}.geojson`;
}
export function lgaRawName(region: Region = PIPELINE_REGION): string {
  return `lga-${region.stateSlug}.geojson`;
}
