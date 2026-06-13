/**
 * Builds the separate SA1 pocket artifact family.
 *
 * Reads SA1 raw geometry only to derive centroids; ships no SA1 geometry and
 * never reads or writes SA2 public artifacts beyond places.json as a parent set.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Pocket, PocketsFile } from "../lib/types.js";
import type { RegionId } from "../lib/regions.js";
import { ASGS_EDITION, featureGeometry, getProp } from "./lib/abs-geo.js";
import { GENERATED, PUBLIC_DATA, RAW } from "./lib/paths.js";
import {
  PIPELINE_REGION,
  generatedOutPath,
  publicOutPath,
  sa1RawName,
} from "./lib/pipeline-region.js";
import { SEIFA_SA1_RAW_FILE } from "./fetch-seifa-sa1.js";

export const POCKETS_GZIP_LIMIT_BYTES = 100 * 1024;
export const POCKET_SEIFA_SOURCE_ID = "abs-seifa-sa1-2021" as const;

export type SeifaSa1Value = {
  irsadDecile: number | null;
  irsdDecile: number | null;
};

type Sa2Parent = { sa2Code: string };

function toFeature(geom: Polygon | MultiPolygon): Feature {
  return { type: "Feature", properties: {}, geometry: geom };
}

function code(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value ?? "").trim().replace(/\.0$/, "");
}

function decile(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const d = Math.trunc(n);
  return d >= 1 && d <= 10 ? d : null;
}

function roundCoord(n: number): number {
  return Number(n.toFixed(6));
}

function centroidOf(geom: Polygon | MultiPolygon): [number, number] {
  const [lng, lat] = turf.centroid(toFeature(geom)).geometry.coordinates as [
    number,
    number,
  ];
  return [roundCoord(lng), roundCoord(lat)];
}

export function applyWithinSa2Ranks(pockets: Pocket[]): Pocket[] {
  const byParent = new Map<string, Pocket[]>();
  for (const p of pockets) {
    const group = byParent.get(p.sa2Code) ?? [];
    group.push(p);
    byParent.set(p.sa2Code, group);
  }
  for (const group of byParent.values()) {
    const valid = group.filter((p) => p.seifa.irsadDecile != null);
    if (valid.length <= 1) continue;
    for (const p of valid) {
      const value = p.seifa.irsadDecile as number;
      const others = valid.filter((other) => other !== p);
      const less = others.filter((other) => (other.seifa.irsadDecile as number) < value).length;
      const equal = others.filter((other) => other.seifa.irsadDecile === value).length;
      p.withinSa2Rank = Math.round(((less + equal * 0.5) / others.length) * 100);
    }
  }
  return pockets;
}

export function buildPocketsFile(params: {
  sa1: FeatureCollection;
  places: Sa2Parent[];
  seifaBySa1?: Map<string, SeifaSa1Value>;
  generatedAt?: string;
  region?: RegionId;
}): PocketsFile {
  const validParents = new Set(params.places.map((p) => p.sa2Code));
  const seifaBySa1 = params.seifaBySa1 ?? new Map<string, SeifaSa1Value>();
  const pockets: Pocket[] = [];

  for (const f of params.sa1.features) {
    const sa1Code = code(getProp(f, ["SA1_CODE_2021", "sa1_code_2021"]));
    const featureSa2 = code(getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]));
    const geom = featureGeometry(f);
    if (!/^\d{11}$/.test(sa1Code)) {
      throw new Error(`Invalid SA1_CODE_2021 '${sa1Code || "<missing>"}'`);
    }
    if (!/^\d{9}$/.test(featureSa2)) {
      throw new Error(`Invalid SA2_CODE_2021 for SA1 ${sa1Code}: '${featureSa2 || "<missing>"}'`);
    }
    if (!geom) throw new Error(`SA1 ${sa1Code} has no Polygon/MultiPolygon geometry`);
    const parent = sa1Code.slice(0, 9);
    if (parent !== featureSa2) {
      throw new Error(
        `SA1 ${sa1Code} prefix ${parent} does not match feature SA2_CODE_2021 ${featureSa2}`
      );
    }
    if (!validParents.has(parent)) {
      throw new Error(
        `SA1 ${sa1Code} parent ${parent} is not present in places.json SA2 parents`
      );
    }
    const seifa = seifaBySa1.get(sa1Code);
    pockets.push({
      sa1Code,
      sa2Code: parent,
      centroid: centroidOf(geom),
      population: null,
      seifa: {
        irsadDecile: decile(seifa?.irsadDecile),
        irsdDecile: decile(seifa?.irsdDecile),
        sourceId: POCKET_SEIFA_SOURCE_ID,
        period: ASGS_EDITION,
      },
    });
  }

  pockets.sort((a, b) => a.sa2Code.localeCompare(b.sa2Code) || a.sa1Code.localeCompare(b.sa1Code));
  applyWithinSa2Ranks(pockets);

  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    asgsEdition: ASGS_EDITION,
    region: params.region ?? PIPELINE_REGION.id,
    pockets,
  };
}

export async function loadSeifaSa1(
  file = path.join(RAW, SEIFA_SA1_RAW_FILE)
): Promise<Map<string, SeifaSa1Value>> {
  let rows: unknown;
  try {
    rows = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      console.warn(`${SEIFA_SA1_RAW_FILE} missing - SA1 pocket SEIFA deciles will be null`);
      return new Map();
    }
    throw e;
  }
  const list = Array.isArray(rows)
    ? rows
    : Array.isArray((rows as { rows?: unknown[] }).rows)
      ? (rows as { rows: unknown[] }).rows
      : [];
  const out = new Map<string, SeifaSa1Value>();
  for (const row of list as Record<string, unknown>[]) {
    const sa1Code = code(row.sa1Code ?? row.SA1_CODE_2021 ?? row.sa1_code_2021);
    if (!/^\d{11}$/.test(sa1Code)) continue;
    out.set(sa1Code, {
      irsadDecile: decile(row.irsadDecile ?? row.irsad_aus_decile),
      irsdDecile: decile(row.irsdDecile ?? row.irsd_aus_decile),
    });
  }
  return out;
}

export async function buildAndWritePockets(): Promise<PocketsFile | null> {
  const rawSa1 = path.join(RAW, sa1RawName());
  if (!existsSync(rawSa1)) {
    console.warn(`${sa1RawName()} missing - skipping data:pockets`);
    return null;
  }
  const sa1 = JSON.parse(await readFile(rawSa1, "utf8")) as FeatureCollection;
  const { places } = JSON.parse(
    await readFile(generatedOutPath("places.json"), "utf8")
  ) as { places: Sa2Parent[] };
  const seifaBySa1 = await loadSeifaSa1();
  const pocketsFile = buildPocketsFile({
    sa1,
    places,
    seifaBySa1,
    region: PIPELINE_REGION.id,
  });

  const json = JSON.stringify(pocketsFile);
  const gzipBytes = gzipSync(Buffer.from(json)).length;
  if (gzipBytes > POCKETS_GZIP_LIMIT_BYTES) {
    throw new Error(
      `pockets.json gzip size ${gzipBytes} bytes exceeds ${POCKETS_GZIP_LIMIT_BYTES} byte limit`
    );
  }

  await mkdir(GENERATED, { recursive: true });
  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(generatedOutPath("pockets.json"), json, "utf8");
  await writeFile(publicOutPath("pockets.json"), json, "utf8");
  console.log(
    `Wrote ${path.basename(publicOutPath("pockets.json"))} (${pocketsFile.pockets.length} SA1 pockets, gzip ${gzipBytes} bytes)`
  );
  return pocketsFile;
}

const invokedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  buildAndWritePockets().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
