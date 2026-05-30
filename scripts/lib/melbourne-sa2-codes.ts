import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection } from "geojson";
import { RAW } from "./paths.js";
import { getProp } from "./abs-geo.js";

export async function loadMelbourneSa2Codes(): Promise<string[]> {
  const raw = await readFile(
    path.join(RAW, "sa2-melbourne.geojson"),
    "utf8"
  );
  const fc = JSON.parse(raw) as FeatureCollection;
  return fc.features
    .map((f) => getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]))
    .filter((c): c is string => !!c);
}

export function inClause(codes: string[], field: string): string {
  const chunk = codes.slice(0, 200);
  return `${field} IN (${chunk.map((c) => `'${c}'`).join(",")})`;
}
