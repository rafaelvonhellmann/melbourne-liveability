import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection } from "geojson";
import { RAW } from "./paths.js";
import { getProp } from "./abs-geo.js";
import { sa1RawName, sa2RawName } from "./pipeline-region.js";

/** SA2 codes from the active region's raw boundary file (data:fetch output).
 * Defaults to the pipeline region's file (melbourne -> sa2-melbourne.geojson). */
export async function loadSa2Codes(
  fileName: string = sa2RawName()
): Promise<string[]> {
  const raw = await readFile(path.join(RAW, fileName), "utf8");
  const fc = JSON.parse(raw) as FeatureCollection;
  return fc.features
    .map((f) => getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]))
    .filter((c): c is string => !!c);
}

/** SA1 codes from the active region's raw boundary file (data:fetch output). */
export async function loadSa1Codes(
  fileName: string = sa1RawName()
): Promise<string[]> {
  const raw = await readFile(path.join(RAW, fileName), "utf8");
  const fc = JSON.parse(raw) as FeatureCollection;
  return fc.features
    .map((f) => getProp(f, ["SA1_CODE_2021", "sa1_code_2021"]))
    .filter((c): c is string => !!c);
}

/** Alias kept for existing callers; now region-aware via loadSa2Codes. */
export async function loadMelbourneSa2Codes(): Promise<string[]> {
  return loadSa2Codes();
}

export function inClause(codes: string[], field: string): string {
  const chunk = codes.slice(0, 200);
  return `${field} IN (${chunk.map((c) => `'${c}'`).join(",")})`;
}
