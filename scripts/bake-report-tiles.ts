/**
 * Bake the buyer report's big point/line inputs into static z14 tiles
 * (SPIKE-B / P1-7 payload diet). Inputs are the already-committed files in
 * public/data (no network):
 *
 *   pois.geojson      (~7.8 MB, 37,982 points)  -> pois/14/x/y.json    { p: [[lng,lat,pinType,name]] }
 *   traffic-aadt.json (~1.1 MB,  9,738 segments) -> traffic/14/x/y.json { t: [{r,v,h,c}] }
 *   noise-lines.json  (~1.0 MB, 20,895 ways)     -> noise/14/x/y.json   { n: {rail,tram,freeway} }
 *   bus-stops.json    (~0.44 MB, 18,597 stops)   -> bus/14/x/y.json     { s: [[lng,lat,routes]] }
 *
 * Output: public/data/report-tiles/{kind}/14/{x}/{y}.json + manifest.json
 * (committed). The ORIGINAL big files stay in public/data - the map's lazy POI
 * layer (MelbourneMap), BuyerHereCard and the server-rendered sample report
 * still read them; the tiles serve the report path only.
 *
 * Bucketing: points go in the tile that contains them. Line geometries
 * (traffic segments, noise ways) are bucketed PER EDGE into every tile the
 * edge's bbox touches, then consecutive edges are stitched back into runs per
 * tile - NOT by way midpoint, because the data has multi-km ways (max traffic
 * segment span ~34 km) whose midpoint can sit far outside the pin's 3x3 block
 * while the way passes within metres of the pin. Edge-bbox bucketing
 * guarantees: any edge within ~1.9 km of a pin is present in at least one of
 * the pin's 3x3 tiles, so the report's 150 m / 250 m proximity scans are
 * exact. Duplicated runs across tiles are harmless to the consumers (they take
 * a min distance / busiest match).
 *
 * Run: npm run data:report-tiles
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { Feature, Point } from "geojson";
import { lngLatToTile } from "../lib/building-tiles";
import {
  REPORT_TILE_Z,
  type BakedPoi,
  type ReportTileKind,
} from "../lib/report-tiles";
import type { NoiseKind } from "../lib/noise";
import type { TrafficSegment } from "../lib/traffic";
import type { BusStop } from "../lib/transit";

const PUBLIC_DATA = path.join(process.cwd(), "public", "data");
const OUT_DIR = path.join(PUBLIC_DATA, "report-tiles");

/**
 * Rolling sha256 over the raw bytes of every input file read, in read order
 * (deterministic: pois -> traffic -> noise -> bus). The manifest's `generated`
 * stamp derives from this digest instead of today's date, so a re-bake over
 * byte-identical inputs produces a byte-identical manifest and the monthly
 * data-refresh no-op short-circuit (git sees no diff) actually short-circuits.
 */
const inputsHash = createHash("sha256");

function readJson<T>(file: string): T {
  const text = readFileSync(path.join(PUBLIC_DATA, file), "utf8");
  inputsHash.update(text);
  return JSON.parse(text) as T;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

type TileKey = string; // "x/y"
const key = (x: number, y: number): TileKey => `${x}/${y}`;

function bucketOf<T>(map: Map<TileKey, T[]>, k: TileKey): T[] {
  let b = map.get(k);
  if (!b) {
    b = [];
    map.set(k, b);
  }
  return b;
}

/**
 * All z14 tiles an edge (a->b) bbox touches: the rectangle of tiles spanned by
 * the two endpoint tiles (endpoints are the bbox corners of a 2-point edge).
 */
function edgeTiles(a: [number, number], b: [number, number]): TileKey[] {
  const ta = lngLatToTile(a[0], a[1], REPORT_TILE_Z);
  const tb = lngLatToTile(b[0], b[1], REPORT_TILE_Z);
  const keys: TileKey[] = [];
  for (let x = Math.min(ta.x, tb.x); x <= Math.max(ta.x, tb.x); x++) {
    for (let y = Math.min(ta.y, tb.y); y <= Math.max(ta.y, tb.y); y++) {
      keys.push(key(x, y));
    }
  }
  return keys;
}

/**
 * Split one polyline into per-tile RUNS: for each tile any edge touches, the
 * maximal slices of consecutive touching edges. A run keeps its original
 * vertices, so per-segment min-distance maths over the runs equals the maths
 * over the whole way.
 */
function polylineRunsByTile(coords: [number, number][]): Map<TileKey, [number, number][][]> {
  const out = new Map<TileKey, [number, number][][]>();
  if (coords.length === 1) {
    const t = lngLatToTile(coords[0][0], coords[0][1], REPORT_TILE_Z);
    out.set(key(t.x, t.y), [coords]);
    return out;
  }
  // tile -> sorted list of edge indices that touch it.
  const edgesByTile = new Map<TileKey, number[]>();
  for (let i = 0; i < coords.length - 1; i++) {
    for (const k of edgeTiles(coords[i], coords[i + 1])) bucketOf(edgesByTile, k).push(i);
  }
  for (const [k, idxs] of edgesByTile) {
    const runs: [number, number][][] = [];
    let start = idxs[0];
    let prev = idxs[0];
    for (let j = 1; j <= idxs.length; j++) {
      const cur = idxs[j];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      runs.push(coords.slice(start, prev + 2));
      if (cur == null) break;
      start = cur;
      prev = cur;
    }
    out.set(k, runs);
  }
  return out;
}

type KindStats = { tiles: number; count: number; bytes: number };

function writeTiles(
  kind: ReportTileKind,
  tiles: Map<TileKey, unknown>,
  sizes: Map<TileKey, Map<ReportTileKind, number>>
): KindStats {
  const dir = path.join(OUT_DIR, kind, String(REPORT_TILE_Z));
  let bytes = 0;
  for (const [k, payload] of tiles) {
    const [x, y] = k.split("/");
    const tileDir = path.join(dir, x);
    mkdirSync(tileDir, { recursive: true });
    const body = JSON.stringify(payload);
    writeFileSync(path.join(tileDir, `${y}.json`), body);
    bytes += Buffer.byteLength(body);
    let perKind = sizes.get(k);
    if (!perKind) {
      perKind = new Map();
      sizes.set(k, perKind);
    }
    perKind.set(kind, Buffer.byteLength(body));
  }
  return { tiles: tiles.size, count: 0, bytes };
}

/** Worst-case 3x3 pin load across all baked centre tiles (raw + gzip bytes). */
function worst3x3(sizes: Map<TileKey, Map<ReportTileKind, number>>): {
  centre: TileKey;
  raw: number;
  gz: number;
} {
  let worst = { centre: "", raw: 0, gz: 0 };
  for (const centre of sizes.keys()) {
    const [cx, cy] = centre.split("/").map(Number);
    let raw = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const perKind = sizes.get(key(cx + dx, cy + dy));
        if (perKind) for (const b of perKind.values()) raw += b;
      }
    }
    if (raw > worst.raw) worst = { centre, raw, gz: 0 };
  }
  // gzip only the winning neighbourhood (per-file gzip, like static hosting).
  const [cx, cy] = worst.centre.split("/").map(Number);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const k = key(cx + dx, cy + dy);
      const perKind = sizes.get(k);
      if (!perKind) continue;
      for (const kind of perKind.keys()) {
        const file = path.join(OUT_DIR, kind, String(REPORT_TILE_Z), `${k}.json`);
        worst.gz += gzipSync(readFileSync(file)).length;
      }
    }
  }
  return worst;
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });

  // --- pois: slim [lng, lat, pinType, name], 6 dp, point-in-tile bucketing.
  const poisFc = readJson<{ features?: Feature<Point>[] }>("pois.geojson");
  const poisTiles = new Map<TileKey, BakedPoi[]>();
  let poiCount = 0;
  for (const f of poisFc.features ?? []) {
    const c = f.geometry?.coordinates;
    const props = (f.properties ?? {}) as { pinType?: string; name?: string };
    const pinType = String(props.pinType ?? "").trim();
    if (!c || c.length < 2 || !pinType) continue;
    const t = lngLatToTile(c[0], c[1], REPORT_TILE_Z);
    bucketOf(poisTiles, key(t.x, t.y)).push([
      round6(c[0]),
      round6(c[1]),
      pinType,
      String(props.name ?? "").trim(),
    ]);
    poiCount++;
  }

  // --- traffic: existing {r,v,h,c} entries, c split into per-tile runs.
  const segments = readJson<TrafficSegment[]>("traffic-aadt.json");
  const trafficTiles = new Map<TileKey, TrafficSegment[]>();
  let trafficCount = 0;
  for (const s of segments) {
    if (!s?.c || s.c.length === 0) continue;
    trafficCount++;
    for (const [k, runs] of polylineRunsByTile(s.c)) {
      const bucket = bucketOf(trafficTiles, k);
      for (const run of runs) bucket.push({ r: s.r, v: s.v, h: s.h, c: run });
    }
  }

  // --- noise: {rail,tram,freeway} way arrays, split into per-tile runs.
  const noise = readJson<Record<NoiseKind, [number, number][][]>>("noise-lines.json");
  const noiseTiles = new Map<TileKey, Partial<Record<NoiseKind, [number, number][][]>>>();
  let noiseCount = 0;
  for (const kind of ["rail", "tram", "freeway"] as const) {
    for (const way of noise[kind] ?? []) {
      if (!way || way.length === 0) continue;
      noiseCount++;
      for (const [k, runs] of polylineRunsByTile(way)) {
        let tile = noiseTiles.get(k);
        if (!tile) {
          tile = {};
          noiseTiles.set(k, tile);
        }
        (tile[kind] ??= []).push(...runs);
      }
    }
  }

  // --- bus: already-slim [lng, lat, routeCount] stops, point-in-tile.
  const stops = readJson<BusStop[]>("bus-stops.json");
  const busTiles = new Map<TileKey, BusStop[]>();
  let busCount = 0;
  for (const s of stops) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const t = lngLatToTile(s[0], s[1], REPORT_TILE_Z);
    bucketOf(busTiles, key(t.x, t.y)).push(s);
    busCount++;
  }

  // --- write tiles + manifest.
  const sizes = new Map<TileKey, Map<ReportTileKind, number>>();
  const wrap = <T>(m: Map<TileKey, T>, f: (v: T) => unknown): Map<TileKey, unknown> =>
    new Map([...m].map(([k, v]) => [k, f(v)]));
  const stats: Record<ReportTileKind, KindStats> = {
    pois: writeTiles("pois", wrap(poisTiles, (p) => ({ p })), sizes),
    traffic: writeTiles("traffic", wrap(trafficTiles, (t) => ({ t })), sizes),
    noise: writeTiles("noise", wrap(noiseTiles, (n) => ({ n })), sizes),
    bus: writeTiles("bus", wrap(busTiles, (s) => ({ s })), sizes),
  };
  stats.pois.count = poiCount;
  stats.traffic.count = trafficCount;
  stats.noise.count = noiseCount;
  stats.bus.count = busCount;

  const odbl = {
    attribution: "(c) OpenStreetMap contributors",
    licence: "ODbL 1.0",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/",
    attributionUrl: "https://www.openstreetmap.org/copyright",
  };
  const manifest = {
    z: REPORT_TILE_Z,
    // Deterministic content stamp (sha256 of the four inputs), NOT a date:
    // identical inputs must yield an identical manifest. See inputsHash.
    generated: `inputs-sha256-${inputsHash.digest("hex").slice(0, 16)}`,
    bakedWith: "scripts/bake-report-tiles.ts",
    kinds: {
      pois: {
        tiles: stats.pois.tiles,
        count: stats.pois.count,
        source:
          "OpenStreetMap amenities + Vicmap/MapShare facility points (police, childcare, hospitals) via scripts/build-poi.ts",
        ...odbl,
      },
      noise: {
        tiles: stats.noise.tiles,
        count: stats.noise.count,
        source:
          "OpenStreetMap rail / tram / freeway corridors (transport-noise proximity proxy) via scripts/fetch-noise.ts",
        ...odbl,
      },
      traffic: {
        tiles: stats.traffic.tiles,
        count: stats.traffic.count,
        source: "DTP Annual Average Daily Traffic Volume via scripts/fetch-traffic-aadt.ts",
        attribution: "(c) State of Victoria (Department of Transport and Planning)",
        licence: "CC BY 4.0",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        attributionUrl:
          "https://discover.data.vic.gov.au/dataset/historical-annual-average-daily-traffic-volume",
      },
      bus: {
        tiles: stats.bus.tiles,
        count: stats.bus.count,
        source: "PTV GTFS Schedule weekday bus stops via scripts/precompute-gtfs.ts",
        attribution: "(c) Public Transport Victoria (DTP)",
        licence: "CC BY 4.0",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        attributionUrl: "https://opendata.transport.vic.gov.au/dataset/gtfs-schedule",
      },
    },
  };
  writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest));

  for (const kind of ["pois", "traffic", "noise", "bus"] as const) {
    const s = stats[kind];
    console.log(
      `${kind}: ${s.count} features -> ${s.tiles} tiles, ${(s.bytes / 1024).toFixed(0)} KB total`
    );
  }
  const w = worst3x3(sizes);
  console.log(
    `worst 3x3 pin load: centre ${w.centre} = ${(w.raw / 1024).toFixed(1)} KB raw / ${(
      w.gz / 1024
    ).toFixed(1)} KB gz (all kinds)`
  );
}

main();
