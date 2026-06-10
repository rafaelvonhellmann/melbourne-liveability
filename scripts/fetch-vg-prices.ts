/**
 * P1-6: suburb price/rent context bake. Discovers + downloads three CC BY 4.0
 * DataVic datasets, parses the (messy, merged-header) XLSX files defensively,
 * joins them to OUR Greater Melbourne suburb set via the existing crosswalk,
 * and bakes public/data/price-context.json for lib/price-context.ts.
 *
 *   1. Valuer-General "Median House by Suburb Time Series"  (annual medians)
 *   2. Valuer-General "Median Unit by Suburb Time Series"   (annual medians)
 *   3. DFFH/Homes Victoria "Rental Report - Moving Annual Rents by Suburb"
 *      (quarterly moving annual median rents; suburbs come pre-GROUPED, e.g.
 *      "Collingwood-Abbotsford" - each group median is attached to every
 *      constituent suburb we know, with the group label kept for honesty).
 *
 * Preliminary-year columns ("Prelim 2025" / a year sitting under a "Prelim"
 * header) are intentionally skipped - only final-year medians are baked.
 * Sale series are trimmed to the last 10 years, rents to the latest 8
 * quarters, and only crosswalk (metro) suburbs are kept, so the output stays
 * well under 500 KB. Context only - never enters any score.
 *
 * Also upserts the three source records (sha256 + fetchedAt + period) into
 * data/generated/sources.json for the data:verify provenance gate.
 *
 * Run: npm run data:prices   (use --offline to re-bake from existing raw files)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import XLSX from "xlsx";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import { downloadToFile } from "./lib/gov-fetch.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import { normalizeSuburbName } from "../lib/suburb-normalize.js";
import { directionalFlip } from "../lib/price-context.js";
import type { CrosswalkFile } from "../lib/crosswalk-types.js";

const UA = "MelbourneLiveability/1.0";
const CKAN = "https://discover.data.vic.gov.au/api/3/action/package_show?id=";
const DATASET_PAGE = "https://discover.data.vic.gov.au/dataset/";

const DATASETS = {
  house: {
    ckanId: "victorian-property-sales-report-median-house-by-suburb-time-series",
    raw: "vg-median-house-suburb.xlsx",
    sourceId: "vgv-median-house-suburb",
    sourceName:
      "Valuer-General Victoria - Property Sales Report, median house price by suburb (annual time series)",
  },
  unit: {
    ckanId: "victorian-property-sales-report-median-unit-by-suburb-time-series",
    raw: "vg-median-unit-suburb.xlsx",
    sourceId: "vgv-median-unit-suburb",
    sourceName:
      "Valuer-General Victoria - Property Sales Report, median unit price by suburb (annual time series)",
  },
  rent: {
    ckanId: "rental-report-quarterly-moving-annual-rents-by-suburb",
    raw: "dffh-rent-suburb.xlsx",
    sourceId: "dffh-rental-report-suburb",
    sourceName:
      "Homes Victoria / DFFH - Rental Report, moving annual median rent by suburb (quarterly)",
  },
} as const;

const SALE_YEARS_KEPT = 10;
const RENT_QUARTERS_KEPT = 8;

type CkanResource = { url?: string; format?: string; name?: string; created?: string };

async function ckanResources(datasetId: string): Promise<CkanResource[]> {
  const res = await fetch(`${CKAN}${datasetId}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CKAN ${res.status} for ${datasetId}`);
  const data = (await res.json()) as { result?: { resources?: CkanResource[] } };
  return data.result?.resources ?? [];
}

/** VG time-series: pick the XLSX whose name ends with the latest span year. */
function latestSpanXlsx(resources: CkanResource[]): CkanResource | null {
  let best: CkanResource | null = null;
  let bestYear = -1;
  for (const r of resources) {
    if (!/xlsx/i.test(r.format ?? "") || !r.url) continue;
    const m = /(\d{4})\s*$/.exec((r.name ?? "").trim());
    const year = m ? Number(m[1]) : 0;
    if (year > bestYear) {
      bestYear = year;
      best = r;
    }
  }
  return best;
}

/** Rental report: pick the most recently created XLSX (quarterly drops). */
function newestXlsx(resources: CkanResource[]): CkanResource | null {
  const xlsx = resources.filter((r) => /xlsx/i.test(r.format ?? "") && r.url);
  xlsx.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
  return xlsx[0] ?? null;
}

/** "1,250,000" / "$550" / 550 -> number, NaN for "-", "NA", blanks. */
function cellNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s || s === "-" || /^na$/i.test(s)) return NaN;
  return Number(s);
}

/**
 * Parse a VG "by suburb time series" sheet: merged multi-row header where the
 * "Locality" row carries the FINAL year columns as numbers (the preliminary
 * year is a string label or sits a row below - skipped on purpose), then one
 * row per ALL-CAPS locality, with "-"/"NA" gaps and footnote rows at the end.
 */
export function parseVgTimeSeries(sheet: XLSX.WorkSheet): {
  bySuburb: Map<string, Record<string, number>>;
  years: number[];
  skipped: string[];
} {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (String(rows[i]?.[0] ?? "").trim().toLowerCase() === "locality") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("VG sheet: no 'Locality' header row found");

  const header = rows[headerIdx];
  const yearCols: { col: number; year: number }[] = [];
  for (let c = 1; c < header.length; c++) {
    const v = header[c];
    if (typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100) {
      yearCols.push({ col: c, year: v });
    }
  }
  if (yearCols.length === 0) throw new Error("VG sheet: no year columns in header row");

  // Keep the last N final years only.
  const maxYear = Math.max(...yearCols.map((y) => y.year));
  const kept = yearCols.filter((y) => y.year > maxYear - SALE_YEARS_KEPT);

  const bySuburb = new Map<string, Record<string, number>>();
  const skipped: string[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row?.[0] ?? "").trim();
    if (!name) continue; // merged-header filler / spacer row
    const series: Record<string, number> = {};
    for (const { col, year } of kept) {
      const v = cellNumber(row[col]);
      if (Number.isFinite(v) && v > 0) series[String(year)] = v;
    }
    if (Object.keys(series).length === 0) {
      skipped.push(name); // footnote line or a locality with no usable medians
      continue;
    }
    bySuburb.set(normalizeSuburbName(name), series);
  }
  return { bySuburb, years: kept.map((y) => y.year), skipped };
}

const QUARTER_RE = /^[A-Za-z]{3} \d{4}$/;

/**
 * Parse the Rental Report "All properties" sheet: row of quarter labels (each
 * appearing twice - Count + Median columns), a Count/Median row under it, then
 * one row per suburb GROUP (col 1) with a sparse region label in col 0 and
 * "Group Total" subtotal rows to skip. Keeps the latest N quarters' medians.
 */
export function parseRentBySuburb(sheet: XLSX.WorkSheet): {
  byLabel: Map<string, Record<string, number>>;
  quarters: string[];
  skipped: string[];
} {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  let qIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    if ((rows[i] ?? []).some((c) => QUARTER_RE.test(String(c ?? "").trim()))) {
      qIdx = i;
      break;
    }
  }
  if (qIdx < 0) throw new Error("Rent sheet: no quarter-label row found");

  const qRow = rows[qIdx];
  const kindRow = rows[qIdx + 1] ?? [];
  const medianCols: { col: number; quarter: string }[] = [];
  for (let c = 0; c < qRow.length; c++) {
    const q = String(qRow[c] ?? "").trim();
    if (QUARTER_RE.test(q) && String(kindRow[c] ?? "").trim().toLowerCase() === "median") {
      medianCols.push({ col: c, quarter: q });
    }
  }
  if (medianCols.length === 0) throw new Error("Rent sheet: no Median columns found");
  const kept = medianCols.slice(-RENT_QUARTERS_KEPT); // file is chronological

  const byLabel = new Map<string, Record<string, number>>();
  const skipped: string[] = [];
  for (let i = qIdx + 2; i < rows.length; i++) {
    const row = rows[i];
    const label = String(row?.[1] ?? "").trim();
    if (!label || /group total/i.test(label)) continue;
    const series: Record<string, number> = {};
    for (const { col, quarter } of kept) {
      const v = cellNumber(row[col]);
      if (Number.isFinite(v) && v > 0) series[quarter] = v;
    }
    if (Object.keys(series).length === 0) {
      skipped.push(label);
      continue;
    }
    byLabel.set(label, series);
  }
  return { byLabel, quarters: kept.map((k) => k.quarter), skipped };
}

/** DFFH label parts that are not SAL suburb names. */
const RENT_PART_ALIASES: Record<string, string> = {
  cbd: "melbourne", // "CBD-St Kilda Rd" group
};

/**
 * Map a DFFH suburb-group label to our normalized metro suburb keys. Tries the
 * full label, then each hyphen-separated part, with directional flips
 * ("East St Kilda" -> "st kilda east") and known aliases ("CBD" -> Melbourne).
 */
export function rentLabelToKeys(label: string, metro: Set<string>): string[] {
  const parts = label.includes("-") ? [label, ...label.split("-")] : [label];
  const keys = new Set<string>();
  for (const part of parts) {
    let n = normalizeSuburbName(part);
    if (!n) continue;
    n = RENT_PART_ALIASES[n] ?? n;
    if (metro.has(n)) {
      keys.add(n);
      continue;
    }
    const flip = directionalFlip(n);
    if (flip && metro.has(flip)) keys.add(flip);
  }
  return [...keys];
}

/** Bbox midpoint of a polygonal geometry - cheap centroid for nearest-suburb. */
function bboxMid(geom: Polygon | MultiPolygon): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring as number[][]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return [NaN, NaN];
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

async function readSheet(file: string, sheetMatch?: RegExp): Promise<XLSX.WorkSheet> {
  const wb = XLSX.read(await readFile(path.join(RAW, file)));
  let name = wb.SheetNames[0];
  if (sheetMatch) {
    name = wb.SheetNames.find((n) => sheetMatch.test(n)) ?? name;
  }
  return wb.Sheets[name];
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(path.join(RAW, file))).digest("hex");
}

type SourceRecord = {
  id: string;
  name?: string;
  url?: string;
  licence?: string;
  period?: string;
  fetchedAt?: string;
  sha256?: string;
  [k: string]: unknown;
};

async function upsertSources(
  entries: { id: string; name: string; url: string; period: string; sha256: string }[]
): Promise<void> {
  const sourcesPath = path.join(GENERATED, "sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8")) as SourceRecord[];
  const today = new Date().toISOString().slice(0, 10);
  for (const e of entries) {
    const idx = sources.findIndex((s) => s.id === e.id);
    const existing = idx >= 0 ? sources[idx] : {};
    const next: SourceRecord = {
      id: e.id,
      name: e.name,
      url: e.url,
      licence: (existing.licence as string) ?? "CC BY 4.0",
      period: e.period,
      fetchedAt: today,
      sha256: e.sha256,
    };
    // Preserve hand-added fields (e.g. verifyNote) across refreshes.
    for (const [k, v] of Object.entries(existing)) {
      if (!(k in next)) next[k] = v;
    }
    if (idx >= 0) sources[idx] = next;
    else sources.push(next);
  }
  await writeFile(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
}

function logSkipped(label: string, skipped: string[]) {
  if (skipped.length === 0) return;
  console.log(
    `  ${label}: skipped ${skipped.length} row(s) without usable medians ` +
      `(footnotes / sparse localities): ${skipped.slice(0, 8).join(" | ")}` +
      (skipped.length > 8 ? " | ..." : "")
  );
}

async function main() {
  const offline = process.argv.includes("--offline");

  if (!offline) {
    const [houseRes, unitRes, rentRes] = await Promise.all([
      ckanResources(DATASETS.house.ckanId).then(latestSpanXlsx),
      ckanResources(DATASETS.unit.ckanId).then(latestSpanXlsx),
      ckanResources(DATASETS.rent.ckanId).then(newestXlsx),
    ]);
    for (const [ds, res] of [
      [DATASETS.house, houseRes],
      [DATASETS.unit, unitRes],
      [DATASETS.rent, rentRes],
    ] as const) {
      if (!res?.url) throw new Error(`No XLSX resource found for ${ds.ckanId}`);
      console.log(`Downloading ${res.name ?? res.url}`);
      await downloadToFile(res.url, path.join(RAW, ds.raw));
    }
  } else {
    console.log("--offline: baking from existing raw files");
  }

  // Parse the three workbooks (defensively - structures drift year to year).
  const house = parseVgTimeSeries(await readSheet(DATASETS.house.raw));
  const unit = parseVgTimeSeries(await readSheet(DATASETS.unit.raw));
  const rent = parseRentBySuburb(await readSheet(DATASETS.rent.raw, /all propert/i));
  console.log(
    `Parsed: ${house.bySuburb.size} house localities (${Math.min(...house.years)}-${Math.max(...house.years)}), ` +
      `${unit.bySuburb.size} unit localities (${Math.min(...unit.years)}-${Math.max(...unit.years)}), ` +
      `${rent.byLabel.size} rent groups (latest ${rent.quarters.length} qtrs to ${rent.quarters[rent.quarters.length - 1]})`
  );
  logSkipped("house", house.skipped);
  logSkipped("unit", unit.skipped);
  logSkipped("rent", rent.skipped);

  // Metro suburb set + display names + SAL codes from the existing crosswalk.
  const cw = JSON.parse(
    await readFile(path.join(GENERATED, "crosswalk.json"), "utf8")
  ) as CrosswalkFile;
  const displayByKey = new Map<string, { display: string; salCode: string }>();
  for (const entry of Object.values(cw.sa2ToSuburb)) {
    for (const s of entry.suburbs) {
      const key = normalizeSuburbName(s.suburb);
      // SAL names carry disambiguators ("Abbotsford (Vic.)") - strip for display.
      const display = s.suburb.replace(/\s*\(.+\)\s*$/, "").trim();
      if (!displayByKey.has(key)) displayByKey.set(key, { display, salCode: s.salCode });
    }
  }
  const metro = new Set(displayByKey.keys());

  // Suburb centroids (bbox midpoints) from the raw SAL boundaries, if present.
  const centroidBySal = new Map<string, [number, number]>();
  try {
    const salFc = JSON.parse(
      await readFile(path.join(RAW, "sal-vic.geojson"), "utf8")
    ) as FeatureCollection;
    const wanted = new Set([...displayByKey.values()].map((v) => v.salCode));
    for (const f of salFc.features) {
      const salCode = getProp(f, ["SAL_CODE_2021", "SAL_CODE21"]);
      if (!salCode || !wanted.has(salCode)) continue;
      const g = featureGeometry(f);
      if (!g) continue;
      const [lng, lat] = bboxMid(g);
      if (Number.isFinite(lng)) centroidBySal.set(salCode, [lng, lat]);
    }
  } catch {
    console.warn("  sal-vic.geojson not available - baking without suburb centroids");
  }

  // Rent: attach each group's series to every constituent metro suburb.
  const rentByKey = new Map<string, { series: Record<string, number>; area: string }>();
  const rentUnmatched: string[] = [];
  for (const [label, series] of rent.byLabel) {
    const keys = rentLabelToKeys(label, metro);
    if (keys.length === 0) {
      rentUnmatched.push(label);
      continue;
    }
    for (const key of keys) {
      // Only label a true multi-suburb GROUP ("Collingwood-Abbotsford") as the
      // rent area; a single-suburb label (incl. directional spellings) is not
      // a coarser geography worth flagging on the card.
      const area = label.includes("-") ? label : "";
      if (!rentByKey.has(key)) rentByKey.set(key, { series, area });
    }
  }
  if (rentUnmatched.length) {
    console.log(
      `  rent: ${rentUnmatched.length} group label(s) match no metro suburb ` +
        `(regional/unsplittable): ${rentUnmatched.slice(0, 8).join(" | ")}` +
        (rentUnmatched.length > 8 ? " | ..." : "")
    );
  }

  // Assemble: one record per metro suburb that has at least one series.
  type Baked = {
    suburb: string;
    lng?: number;
    lat?: number;
    houseMedianByYear?: Record<string, number>;
    unitMedianByYear?: Record<string, number>;
    rentMedianByQuarter?: Record<string, number>;
    rentArea?: string;
  };
  const suburbs: Record<string, Baked> = {};
  let nHouse = 0, nUnit = 0, nRent = 0;
  for (const key of [...metro].sort()) {
    const { display, salCode } = displayByKey.get(key)!;
    const rec: Baked = { suburb: display };
    const centroid = centroidBySal.get(salCode);
    if (centroid) {
      rec.lng = Math.round(centroid[0] * 1e4) / 1e4;
      rec.lat = Math.round(centroid[1] * 1e4) / 1e4;
    }
    const h = house.bySuburb.get(key);
    if (h) { rec.houseMedianByYear = h; nHouse++; }
    const u = unit.bySuburb.get(key);
    if (u) { rec.unitMedianByYear = u; nUnit++; }
    const r = rentByKey.get(key);
    if (r) {
      rec.rentMedianByQuarter = r.series;
      if (r.area && r.area !== display) rec.rentArea = r.area;
      nRent++;
    }
    if (h || u || r) suburbs[key] = rec;
  }

  const housePeriod = `${Math.min(...house.years)}-${Math.max(...house.years)}`;
  const unitPeriod = `${Math.min(...unit.years)}-${Math.max(...unit.years)}`;
  const rentPeriod = `year to ${rent.quarters[rent.quarters.length - 1]}`;

  const sourcesMeta = {
    house: {
      id: DATASETS.house.sourceId,
      name: DATASETS.house.sourceName,
      url: `${DATASET_PAGE}${DATASETS.house.ckanId}`,
      licence: "CC BY 4.0",
      period: housePeriod,
    },
    unit: {
      id: DATASETS.unit.sourceId,
      name: DATASETS.unit.sourceName,
      url: `${DATASET_PAGE}${DATASETS.unit.ckanId}`,
      licence: "CC BY 4.0",
      period: unitPeriod,
    },
    rent: {
      id: DATASETS.rent.sourceId,
      name: DATASETS.rent.sourceName,
      url: `${DATASET_PAGE}${DATASETS.rent.ckanId}`,
      licence: "CC BY 4.0",
      period: rentPeriod,
    },
  };

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: sourcesMeta,
    suburbs,
  };
  await mkdir(PUBLIC_DATA, { recursive: true });
  const outPath = path.join(PUBLIC_DATA, "price-context.json");
  const json = JSON.stringify(out);
  await writeFile(outPath, json);
  console.log(
    `Wrote price-context.json: ${Object.keys(suburbs).length} suburbs ` +
      `(house ${nHouse}, unit ${nUnit}, rent ${nRent}), ${(json.length / 1024).toFixed(0)} KB`
  );

  await upsertSources([
    { ...sourcesMeta.house, sha256: await sha256(DATASETS.house.raw) },
    { ...sourcesMeta.unit, sha256: await sha256(DATASETS.unit.raw) },
    { ...sourcesMeta.rent, sha256: await sha256(DATASETS.rent.raw) },
  ]);
  console.log("Updated sources.json (vgv house/unit + dffh rent records)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
