/**
 * QLD Bushfire Prone Area via QSpatial's prepackaged bulk download.
 *
 * WHY: the QFD AGOL service proxy
 * (utility.arcgis.com/usrsvcs/servers/8ac1.../Hosted/BPA/FeatureServer/0)
 * 504s so often under paged envelope queries that ~120-page region pulls die
 * even with backoff + page-halving (CI runs 27411672860 / 27413366356).
 * QSpatial publishes the SAME dataset vintage (the live layer's SEQ rows are
 * version "July 2017", identical to BPA_SouthEastQueenslandRegion_July2017 in
 * the prepackaged zip) as a single whole-region download - one big HTTP GET
 * instead of ~120 fragile queries.
 *
 * FLOW (verified by hand 2026-06-12):
 *   1. submitJob to the public QSC/ClipZipShip GPServer (async GP task,
 *      exposed through the spatial.information.qld.gov.au sharing proxy the
 *      QSpatial portal itself uses) with Prepackaged_Data_URLs = "<zip>:<uuid>".
 *   2. Poll the job; on success read results/prepackagedDataUrls - a tokenized
 *      DownloadService/Download.aspx URL.
 *   3. Stream the zip (~434 MB for SEQ) to data/raw (gitignored).
 *   4. Extract the .shp/.dbf with unzipper and parse them here (no shapefile
 *      dep in package.json, and the pack has no GeoJSON variant - the format
 *      is fixed). The shapefile is GDA94 Australia Albers; the exact inverse
 *      projection below is the standard Snyder ellipsoidal Albers.
 *   5. Keep only records whose bbox intersects the region envelope (same
 *      esriSpatialRelIntersects whole-feature semantics the old server-side
 *      clip had) and emit features with {fid, lga, class} properties - the
 *      raw-file shape the QLD hazards normalize step already reads.
 */
import path from "node:path";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import type { Feature, Polygon, MultiPolygon, Position } from "geojson";
import type { RegionBbox } from "../../lib/regions.js";

const UA = "MelbourneLiveability/1.0";
const REFERER = "https://qldspatial.information.qld.gov.au/";

/** Public ClipZipShip GP task behind the QSpatial portal (no auth needed -
 * the sharing/servers id is the portal's own public proxy registration). */
export const QSPATIAL_CLIPZIPSHIP_URL =
  "https://spatial.information.qld.gov.au/arcgis/sharing/servers/370fdcd7a9aa42148d497d06e6accdd1/rest/services/QSC/ClipZipShip/GPServer/ClipZipShip";

/** The GP task requires a syntactically valid To_Email (it ALSO emails the
 * link); the job result carries the URL so the mailbox never matters. */
const QSPATIAL_ORDER_EMAIL = "data@festra.au";

export type QspatialBpaPack = {
  /** Prepackaged zip filename (ISO metadata alternateTitle). */
  file: string;
  /** QSpatial catalogue record uuid (braces included). */
  uuid: string;
  /** Basename of the shapefile inside the zip. */
  shpBase: string;
  /** Generous lon/lat coverage envelope - must CONTAIN the region bbox.
   * (The catalogue bbox is approximate, so these are padded outward.) */
  bbox: RegionBbox;
};

/** Regional BPA download packs ("Bushfire prone area - Queensland series").
 * Only packs whose zip contents were verified are listed; add more from the
 * catalogue (rest/find/document?searchText=bushfire+prone+area) as QLD
 * regions are onboarded. */
export const QLD_BPA_PACKS: QspatialBpaPack[] = [
  {
    // Brisbane, Gold Coast, Ipswich, Lockyer Valley, Logan, Moreton Bay,
    // Scenic Rim, Sunshine Coast, Noosa, Redland (per the record abstract).
    file: "DP_SouthEastQueensland_BPA.zip",
    uuid: "{8712BDE4-27D1-49A2-83F1-AE7A692B816D}",
    shpBase: "BPA_SouthEastQueenslandRegion_July2017",
    bbox: { west: 151.6, south: -28.7, east: 153.8, north: -26.0 },
  },
];

export function bpaPackForBbox(bbox: RegionBbox): QspatialBpaPack | null {
  return (
    QLD_BPA_PACKS.find(
      (p) =>
        bbox.west >= p.bbox.west &&
        bbox.east <= p.bbox.east &&
        bbox.south >= p.bbox.south &&
        bbox.north <= p.bbox.north
    ) ?? null
  );
}

/* ---------------- GDA94 Australia Albers (EPSG:3577) <-> lon/lat --------- */
// Snyder (1987) ellipsoidal Albers equal-area conic on GRS80.
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const D2R = Math.PI / 180;
const LAM0 = 132 * D2R;
const PHI1 = -18 * D2R;
const PHI2 = -36 * D2R;

function qOf(phi: number): number {
  const s = Math.sin(phi);
  return (
    (1 - E2) *
    (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)))
  );
}
function mOf(phi: number): number {
  const s = Math.sin(phi);
  return Math.cos(phi) / Math.sqrt(1 - E2 * s * s);
}
const M1 = mOf(PHI1);
const M2 = mOf(PHI2);
const Q1 = qOf(PHI1);
const Q2 = qOf(PHI2);
const N = (M1 * M1 - M2 * M2) / (Q2 - Q1);
const C = M1 * M1 + N * Q1;
const RHO0 = (A * Math.sqrt(C - N * qOf(0))) / N;

/** lon/lat (deg) -> Australian Albers x/y (m). */
export function albersForward(lon: number, lat: number): [number, number] {
  const rho = (A * Math.sqrt(C - N * qOf(lat * D2R))) / N;
  const theta = N * (lon * D2R - LAM0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

/** Australian Albers x/y (m) -> lon/lat (deg). */
export function albersInverse(x: number, y: number): [number, number] {
  let yy = RHO0 - y;
  let xx = x;
  let rho = Math.hypot(xx, yy);
  if (N < 0) {
    rho = -rho;
    xx = -xx;
    yy = -yy;
  }
  const theta = Math.atan2(xx, yy);
  const q = (C - ((rho * N) / A) ** 2) / N;
  let phi = Math.asin(Math.min(1, Math.max(-1, q / 2)));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(phi);
    const oneMinus = 1 - E2 * s * s;
    phi +=
      ((oneMinus * oneMinus) / (2 * Math.cos(phi))) *
      (q / (1 - E2) -
        s / oneMinus +
        (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
  }
  return [(LAM0 + theta / N) / D2R, phi / D2R];
}

/* ------------------------- ClipZipShip ordering ------------------------- */

async function gpJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: REFERER },
  });
  if (!res.ok) throw new Error(`QSpatial GP ${res.status}: ${url}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Order a prepackaged pack and return the tokenized download URL. */
export async function orderPrepackagedUrl(pack: QspatialBpaPack): Promise<string> {
  const body = new URLSearchParams({
    f: "json",
    Prepackaged_Data_URLs: `${pack.file}:${pack.uuid}`,
    To_Email: QSPATIAL_ORDER_EMAIL,
    Output_Title: "Extract",
  });
  const res = await fetch(`${QSPATIAL_CLIPZIPSHIP_URL}/submitJob`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: REFERER,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`QSpatial submitJob ${res.status}`);
  const job = (await res.json()) as { jobId?: string; jobStatus?: string };
  if (!job.jobId) throw new Error(`QSpatial submitJob returned no jobId`);

  const deadline = Date.now() + 5 * 60_000;
  let status = job.jobStatus ?? "esriJobSubmitted";
  while (status !== "esriJobSucceeded") {
    if (["esriJobFailed", "esriJobCancelled", "esriJobTimedOut"].includes(status)) {
      throw new Error(`QSpatial ClipZipShip job ${job.jobId} ${status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`QSpatial ClipZipShip job ${job.jobId} timed out polling`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const st = await gpJson(`${QSPATIAL_CLIPZIPSHIP_URL}/jobs/${job.jobId}?f=json`);
    status = String(st.jobStatus);
  }
  const result = (await gpJson(
    `${QSPATIAL_CLIPZIPSHIP_URL}/jobs/${job.jobId}/results/prepackagedDataUrls?f=json`
  )) as { value?: string[] };
  const url = result.value?.find((u) => u.includes("Download.aspx"));
  if (!url) {
    throw new Error("QSpatial job succeeded but returned no Download.aspx URL");
  }
  return url;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`QSpatial download ${res.status}`);
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(dest)
  );
}

/* --------------------------- SHP / DBF parsing -------------------------- */

type DbfRow = { class: string; lga: string };

function parseDbf(buf: Buffer): DbfRow[] {
  const nrec = buf.readUInt32LE(4);
  const hlen = buf.readUInt16LE(8);
  const rlen = buf.readUInt16LE(10);
  const fields: { name: string; offset: number; len: number }[] = [];
  let off = 1; // record deletion flag
  for (let i = 32; buf[i] !== 0x0d; i += 32) {
    const name = buf
      .subarray(i, i + 11)
      .toString("ascii")
      .replace(/\0.*$/, "");
    const len = buf[i + 16];
    fields.push({ name: name.toUpperCase(), offset: off, len });
    off += len;
  }
  const cls = fields.find((f) => f.name === "CLASS");
  const lga = fields.find((f) => f.name === "LGA");
  if (!cls || !lga) {
    throw new Error("QSpatial BPA dbf is missing CLASS/LGA fields");
  }
  const rows: DbfRow[] = [];
  for (let r = 0; r < nrec; r++) {
    const base = hlen + r * rlen;
    rows.push({
      class: buf
        .subarray(base + cls.offset, base + cls.offset + cls.len)
        .toString("ascii")
        .trim(),
      lga: buf
        .subarray(base + lga.offset, base + lga.offset + lga.len)
        .toString("ascii")
        .trim(),
    });
  }
  return rows;
}

/** Iterative Douglas-Peucker on an open polyline (endpoints kept). */
function dpSimplify(pts: Position[], tol: number): Position[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD2 = tol2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2: number;
      if (len2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const cross = dx * (py - ay) - dy * (px - ax);
        d2 = (cross * cross) / len2;
      }
      if (d2 > worstD2) {
        worstD2 = d2;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/** Simplify a CLOSED ring (first == last) with tolerance `tol` (same units as
 * coords). Splits at the vertex farthest from the start so Douglas-Peucker
 * has two non-degenerate chords; returns a closed ring. */
function simplifyRing(ring: Position[], tol: number): Position[] {
  if (ring.length <= 5) return ring;
  const [sx, sy] = ring[0];
  let far = 1;
  let farD = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = (ring[i][0] - sx) ** 2 + (ring[i][1] - sy) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const first = dpSimplify(ring.slice(0, far + 1), tol);
  const second = dpSimplify(ring.slice(far), tol);
  return [...first, ...second.slice(1)];
}

function ringSignedArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function pointInRing(pt: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shapefile rings (outer = clockwise) -> Polygon/MultiPolygon. */
export function assembleRings(rings: Position[][]): Polygon | MultiPolygon {
  const outers: Position[][][] = [];
  const holes: Position[][] = [];
  for (const ring of rings) {
    if (ringSignedArea(ring) < 0) outers.push([ring]);
    else holes.push(ring);
  }
  if (outers.length === 0) {
    // Degenerate orientation - treat every ring as its own outer.
    for (const h of holes.splice(0)) outers.push([h]);
  }
  for (const hole of holes) {
    const home = outers.find((o) => pointInRing(hole[0], o[0]));
    if (home) home.push(hole);
    // Orphan hole: promote to an outer rather than dropping area silently.
    else outers.push([hole]);
  }
  return outers.length === 1
    ? { type: "Polygon", coordinates: outers[0] }
    : { type: "MultiPolygon", coordinates: outers };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Geometry simplification tolerance (metres, applied in Albers space). */
export const SIMPLIFY_TOLERANCE_M = 10;

/**
 * Parse polygon records from a .shp buffer, keeping only records whose bbox
 * intersects `env` (Albers metres), reprojected to lon/lat (6 dp ~ 0.1 m).
 */
function parseShpPolygons(
  buf: Buffer,
  env: { minX: number; minY: number; maxX: number; maxY: number },
  dbf: DbfRow[]
): Feature<Polygon | MultiPolygon>[] {
  const features: Feature<Polygon | MultiPolygon>[] = [];
  let off = 100;
  while (off + 8 <= buf.length) {
    const recNum = buf.readInt32BE(off);
    const contentBytes = buf.readInt32BE(off + 4) * 2;
    const body = off + 8;
    off = body + contentBytes;
    const shapeType = buf.readInt32LE(body);
    if (shapeType === 0) continue; // null shape
    if (shapeType !== 5) {
      throw new Error(`QSpatial BPA shp: unexpected shape type ${shapeType}`);
    }
    const minX = buf.readDoubleLE(body + 4);
    const minY = buf.readDoubleLE(body + 12);
    const maxX = buf.readDoubleLE(body + 20);
    const maxY = buf.readDoubleLE(body + 28);
    if (minX > env.maxX || maxX < env.minX || minY > env.maxY || maxY < env.minY) {
      continue;
    }
    const numParts = buf.readInt32LE(body + 36);
    const numPoints = buf.readInt32LE(body + 40);
    const partsOff = body + 44;
    const pointsOff = partsOff + numParts * 4;
    const rings: Position[][] = [];
    for (let p = 0; p < numParts; p++) {
      const start = buf.readInt32LE(partsOff + p * 4);
      const end = p + 1 < numParts ? buf.readInt32LE(partsOff + (p + 1) * 4) : numPoints;
      const raw: Position[] = [];
      for (let i = start; i < end; i++) {
        raw.push([
          buf.readDoubleLE(pointsOff + i * 16),
          buf.readDoubleLE(pointsOff + i * 16 + 8),
        ]);
      }
      // Simplify in Albers METRES (exact metric tolerance), then reproject.
      // 10 m at SA2 area-share scale is immaterial (cf. sa2-overlay-pct's
      // 150 m simplify for the fire-history scars) and is what keeps the raw
      // GeoJSON under V8's string limits - the unsimplified SEQ pull is
      // ~36M vertices.
      const ring = simplifyRing(raw, SIMPLIFY_TOLERANCE_M).map(([x, y]) => {
        const [lon, lat] = albersInverse(x, y);
        return [round6(lon), round6(lat)] as Position;
      });
      if (ring.length >= 4) rings.push(ring);
    }
    if (rings.length === 0) continue;
    const row = dbf[recNum - 1];
    features.push({
      type: "Feature",
      properties: {
        fid: recNum,
        lga: row?.lga ?? null,
        class: row?.class ?? null,
      },
      geometry: assembleRings(rings),
    });
  }
  return features;
}

/** Region lon/lat bbox -> covering envelope in Albers metres (edge-sampled,
 * +2 km pad - the conic's curved parallels make corner-only projection
 * under-cover). */
export function regionEnvelopeAlbers(bbox: RegionBbox): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const STEPS = 64;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const lon = bbox.west + t * (bbox.east - bbox.west);
    const lat = bbox.south + t * (bbox.north - bbox.south);
    for (const [x, y] of [
      albersForward(lon, bbox.south),
      albersForward(lon, bbox.north),
      albersForward(bbox.west, lat),
      albersForward(bbox.east, lat),
    ]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const PAD = 2000;
  return { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD };
}

/**
 * Fetch the QLD Bushfire Prone Area for `bbox` via the QSpatial prepackaged
 * bulk download (see module header) and stream-write it to `outFile` as a
 * FeatureCollection with the raw-file shape the old paged ArcGIS fetch
 * produced ({fid, lga, class} properties). Returns the feature count.
 * (Streamed because a near-whole-pack region pull is too large for a single
 * JSON.stringify string.) The zip is staged in `rawDir` and deleted after.
 */
export async function fetchQspatialBpaToFile(
  bbox: RegionBbox,
  rawDir: string,
  outFile: string
): Promise<number> {
  const pack = bpaPackForBbox(bbox);
  if (!pack) {
    throw new Error(
      "No QSpatial BPA pack covers this region bbox - add the region's pack to QLD_BPA_PACKS (scripts/lib/qspatial-bpa.ts)"
    );
  }
  console.log(`  ordering ${pack.file} from QSpatial ClipZipShip...`);
  const url = await orderPrepackagedUrl(pack);
  const zipPath = path.join(rawDir, pack.file);
  console.log("  downloading prepackaged zip (~430 MB for SEQ)...");
  await downloadToFile(url, zipPath);

  const dir = await unzipper.Open.file(zipPath);
  const entry = (suffix: string) => {
    const f = dir.files.find((e) => e.path === `${pack.shpBase}${suffix}`);
    if (!f) throw new Error(`QSpatial BPA zip missing ${pack.shpBase}${suffix}`);
    return f.buffer();
  };
  console.log("  extracting + parsing shapefile...");
  const dbf = parseDbf(await entry(".dbf"));
  const shp = await entry(".shp");
  const features = parseShpPolygons(shp, regionEnvelopeAlbers(bbox), dbf);
  await rm(zipPath, { force: true });
  console.log(`  ${dbf.length} records in pack, ${features.length} intersect region bbox`);

  const out = createWriteStream(outFile);
  const write = (chunk: string) =>
    out.write(chunk) || new Promise<void>((r) => out.once("drain", () => r()));
  await write('{"type":"FeatureCollection","features":[');
  for (let i = 0; i < features.length; i++) {
    await write((i > 0 ? "," : "") + JSON.stringify(features[i]));
  }
  await write("]}");
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });
  return features.length;
}
