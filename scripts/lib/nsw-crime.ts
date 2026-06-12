/**
 * BOCSAR (NSW Bureau of Crime Statistics and Research) recorded criminal
 * incidents by NSW suburb by month.
 *
 * Dataset: "Recorded Criminal Incidents by month - by suburb" on data.nsw
 * (BOCSAR open data, licence CC BY 4.0):
 *   https://data.nsw.gov.au/data/dataset/crime-by-offence-by-nsw-suburb
 * ZIP (Azure blob, reissued quarterly - Last-Modified 2026-03-17 when wired
 * up; the 2026Q1 inner CSV was SuburbData25Q4.csv):
 *   https://bocsarblob.blob.core.windows.net/bocsar-open-data/SuburbData.zip
 *
 * Shape: ONE wide CSV inside the zip - one row per Suburb x Offence category
 * x Subcategory, one column per month (Jan 1995 .. latest quarter end; 375
 * columns, ~280k rows, ~430 MB unzipped). Values are INCIDENT COUNTS, so we
 * divide by SA2 ERP population ourselves - the exact per-100k convention the
 * VIC/ACT suburb adapters use (QLD's QPS rates arrive pre-divided by the
 * same ABS ERP).
 *
 * Because the full history is huge, fetch() CLIPS the file while streaming
 * out of the zip: it keeps the three identifier columns plus the LATEST
 * TWELVE month columns and writes that (~15 MB) as the raw artifact. The
 * provenance hash therefore covers exactly the window normalize consumes.
 * parse() re-derives "latest 12 months" by month rank, so it reads the
 * clipped file and the full export identically.
 *
 * Offence classification (category column; subcategories are members of
 * their category, never summed separately - no double counting):
 *   violent  = Homicide, Assault, Sexual offences, Robbery, Abduction and
 *              kidnapping, Blackmail and extortion, Intimidation stalking
 *              and harassment, Coercive Control, Other offences against the
 *              person
 *              (the ANZSOC person divisions - matches VCSA division A, the
 *              ACT person blocks and QPS "Offences Against the Person")
 *   property = Theft (incl. break and enter, MV theft, steal-from-*, fraud,
 *              receiving/handling stolen goods), Arson, Malicious damage to
 *              property
 *              (matches VCSA division B and QPS "Offences Against Property")
 *   excluded = Drug offences, Against justice procedures, Disorderly
 *              conduct, Betting and gaming offences, Liquor offences,
 *              Pornography offences, Prohibited and regulated weapons
 *              offences, Transport regulatory offences and the catch-all
 *              "Other offences" - mirrors VIC (divisions C-F), ACT
 *              (TINs/CINs/"Other offences") and QLD ("Other Offences").
 *
 * Time window: sum of the LATEST TWELVE monthly counts per suburb - a
 * rolling year, comparable to VCSA's "year ending" counts, the ACT's latest
 * four quarters and QPS's latest twelve monthly rates.
 *
 * Suburb join: BOCSAR disambiguates NSW's duplicate locality names with an
 * LGA parenthetical - "Darlington (Sydney)" vs "Darlington (Singleton)",
 * "Colo (Hawkesbury)" vs "Colo (Bathurst Regional)". Joining by bare
 * normalized name would MERGE distinct localities (the same suburb-name
 * collision class as the 2026-06 VIC contamination incident, just within
 * one state). So qualified rows are keyed suburb|lga and matched against
 * the crosswalk's own LGA field first; bare names join by name, exactly
 * like the ACT adapter. An ambiguous name whose LGA does not match stays
 * unmatched - honestly unscored beats silently merged.
 *
 * The file is statewide, so any NSW region (sydney today; newcastle,
 * wollongong, northern rivers later) reuses this adapter unchanged.
 */
import { createWriteStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import unzipper from "unzipper";
import { parse as parseCsvStream } from "csv-parse";
import { parse as parseCsvSync } from "csv-parse/sync";
import {
  normalizeLgaName,
  normalizeSuburbName,
} from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import { downloadToFile } from "./gov-fetch.js";
import type { CrimeCounts } from "./vcsa-crime.js";

/** Direct ZIP download (Azure blob behind the data.nsw dataset page). */
export const NSW_CRIME_URL =
  "https://bocsarblob.blob.core.windows.net/bocsar-open-data/SuburbData.zip";

/** Clipped raw filename the fetch writes and normalize reads (data/raw). */
export const NSW_CRIME_RAW_FILE = "nsw-bocsar-suburb-offences.csv";

const VIOLENT_CATEGORIES = new Set([
  "homicide",
  "assault",
  "sexual offences",
  "robbery",
  "abduction and kidnapping",
  "blackmail and extortion",
  "intimidation, stalking and harassment",
  "coercive control",
  "other offences against the person",
]);

const PROPERTY_CATEGORIES = new Set([
  "theft",
  "arson",
  "malicious damage to property",
]);

/**
 * Classify a BOCSAR "Offence category" as property / violent, or null for
 * the deliberately excluded categories (drug / justice-procedure / public
 * order / regulatory / catch-all). Exact (case-insensitive) matches only: a
 * renamed category drops out rather than misclassifying, and parse() throws
 * when NOTHING classifies, so a wholesale relabel still fails loudly.
 */
export function classifyNswOffence(category: string): "property" | "violent" | null {
  const c = category.trim().toLowerCase();
  if (VIOLENT_CATEGORIES.has(c)) return "violent";
  if (PROPERTY_CATEGORIES.has(c)) return "property";
  return null;
}

const MONTH_NUM: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Rank a BOCSAR "Mon YYYY" column label ("Jan 1995", "Dec 2025") as a
 * comparable month index, or null for anything unrecognised (the three
 * identifier columns rank null and are never mistaken for months).
 */
export function nswMonthRank(label: string): number | null {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const mon = MONTH_NUM[m[1].toLowerCase()];
  if (mon === undefined) return null;
  return Number(m[2]) * 12 + mon;
}

/**
 * Suburb|LGA join key. The LGA arrives as a BOCSAR parenthetical ("Sydney",
 * "Bathurst Regional") on one side and as the crosswalk's ABS name (which
 * suffixes cross-state duplicates - "Campbelltown (NSW)") on the other, so
 * the parenthetical is stripped from the LGA before the shared normalizer.
 */
export function nswSuburbLgaKey(suburb: string, lga: string): string {
  const cleanLga = lga.replace(/\s*\([^)]*\)\s*$/, "");
  return `${normalizeSuburbName(suburb)}|${normalizeLgaName(cleanLga)}`;
}

/** "Darlington (Sydney)" -> base + LGA qualifier; bare names have no LGA. */
function splitBocsarSuburb(raw: string): { base: string; lga: string | null } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(raw.trim());
  return m ? { base: m[1], lga: m[2] } : { base: raw.trim(), lga: null };
}

export type NswCrimeParse = {
  /** normalizeSuburbName(bare suburb) -> latest-12-month counts. */
  bySuburb: Map<string, CrimeCounts>;
  /** nswSuburbLgaKey(suburb, lga) -> counts, for LGA-qualified rows only. */
  bySuburbLga: Map<string, CrimeCounts>;
  /** Label of the most recent month consumed, e.g. "Dec 2025". */
  latestMonth: string;
  /** Distinct months inside the rolling window (12 when the grid is full). */
  monthsUsed: number;
};

type HeaderInfo = {
  suburbCol: number;
  categoryCol: number;
  /** Latest-12 month column indices, oldest -> newest. */
  monthCols: number[];
  latestMonth: string;
};

/** Locate identifier + latest-12 month columns; throws on a reshaped export. */
function readNswHeader(header: string[]): HeaderInfo {
  const labels = header.map((h) => String(h).trim());
  const suburbCol = labels.findIndex((l) => /^suburb$/i.test(l));
  const categoryCol = labels.findIndex((l) => /^offence category$/i.test(l));
  if (suburbCol < 0 || categoryCol < 0) {
    throw new Error(
      `BOCSAR identifier columns not found (need "Suburb" + "Offence category"; ` +
        `got: ${labels.slice(0, 5).join(", ")}...) - the export layout changed`
    );
  }
  const months = labels
    .map((l, i) => ({ rank: nswMonthRank(l), label: l, i }))
    .filter((m): m is { rank: number; label: string; i: number } => m.rank != null)
    .sort((a, b) => a.rank - b.rank);
  if (!months.length) {
    throw new Error('no parsable "Mon YYYY" month columns (expected e.g. "Jan 2025")');
  }
  const window = months.slice(-12);
  return {
    suburbCol,
    categoryCol,
    monthCols: window.map((m) => m.i),
    latestMonth: window[window.length - 1].label,
  };
}

/**
 * Parse the (clipped or full) statewide BOCSAR suburb CSV into per-suburb
 * property/violent incident counts over the latest twelve months. Throws when
 * the identifier columns / month labels are missing or no row classifies, so
 * a reshaped export fails loudly instead of zeroing the safety domain.
 */
export function parseNswCrimeCsv(text: string): NswCrimeParse {
  const rows = parseCsvSync(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (!rows.length) throw new Error("BOCSAR suburb CSV is empty");

  const { suburbCol, categoryCol, monthCols, latestMonth } = readNswHeader(rows[0]);

  const bySuburb = new Map<string, CrimeCounts>();
  const bySuburbLga = new Map<string, CrimeCounts>();
  const months = new Set<number>();
  for (let i = 1; i < rows.length; i++) {
    const kind = classifyNswOffence(String(rows[i][categoryCol] ?? ""));
    if (!kind) continue;
    const raw = String(rows[i][suburbCol] ?? "").trim();
    if (!raw) continue;
    let n = 0;
    for (const c of monthCols) {
      const v = Number(rows[i][c]);
      if (Number.isFinite(v)) {
        n += v;
        months.add(c);
      }
    }
    const { base, lga } = splitBocsarSuburb(raw);
    const map = lga ? bySuburbLga : bySuburb;
    const key = lga ? nswSuburbLgaKey(base, lga) : normalizeSuburbName(base);
    const cur = map.get(key) ?? { property: 0, violent: 0 };
    cur[kind] += n;
    map.set(key, cur);
  }
  if (!bySuburb.size && !bySuburbLga.size) {
    throw new Error(
      "no suburb rows classified from the latest 12 months - the export layout changed"
    );
  }
  return { bySuburb, bySuburbLga, latestMonth, monthsUsed: months.size };
}

/**
 * Join per-suburb counts to SA2 places via the crosswalk: LGA-qualified key
 * first (collision-proof), bare normalized name second - then crosswalk-
 * weighted counts over SA2 ERP population -> rate per 100k, crimeMethod from
 * the crosswalk. Mirrors applyActCrimeToPlaces (act-crime.ts), the other
 * suburb-level join.
 */
export function applyNswCrimeToPlaces<
  T extends {
    sa2Code: string;
    population: number | null;
    propertyCrimeRate: number | null;
    violentCrimeRate: number | null;
    crimeMethod?: "direct" | "population-weighted" | "area-weighted" | null;
  },
>(
  places: Iterable<T>,
  cw: CrosswalkFile,
  parsed: Pick<NswCrimeParse, "bySuburb" | "bySuburbLga">
): { matched: number; unmatched: number } {
  let matched = 0;
  let unmatched = 0;
  for (const p of places) {
    const entry = cw.sa2ToSuburb[p.sa2Code];
    let wProp = 0;
    let wViol = 0;
    let hit = false;
    for (const s of entry?.suburbs ?? []) {
      const c =
        parsed.bySuburbLga.get(nswSuburbLgaKey(s.suburb, s.lga)) ??
        parsed.bySuburb.get(normalizeSuburbName(s.suburb));
      if (!c) continue;
      hit = true;
      wProp += s.weight * c.property;
      wViol += s.weight * c.violent;
    }
    if (!hit) {
      unmatched++;
      continue;
    }
    const pop = p.population ?? 10000;
    p.propertyCrimeRate = (wProp / pop) * 100000;
    p.violentCrimeRate = (wViol / pop) * 100000;
    p.crimeMethod = entry?.suburbs[0]?.method ?? "area-weighted";
    matched++;
  }
  return { matched, unmatched };
}

/** CSV-quote a field (quotes doubled) - suburb names can hold commas. */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Download the BOCSAR zip and stream-clip the inner CSV to the identifier
 * columns + the latest twelve month columns, writing NSW_CRIME_RAW_FILE.
 * The ~430 MB history never lands on disk - only the ~12 MB zip (deleted
 * after the clip) and the ~15 MB window do. Throws on a WAF/HTML page posing
 * as the zip, a zip without a CSV entry, or a reshaped header.
 */
export async function fetchNswCrime(rawDir: string): Promise<void> {
  const zipPath = path.join(rawDir, "nsw-bocsar-suburbdata.zip.tmp");
  const dest = path.join(rawDir, NSW_CRIME_RAW_FILE);
  try {
    await downloadToFile(NSW_CRIME_URL, zipPath);
    await assertZipFile(zipPath);

    const dir = await unzipper.Open.file(zipPath);
    const entry = dir.files.find((f) => /\.csv$/i.test(f.path));
    if (!entry) {
      throw new Error(
        `no CSV entry in BOCSAR zip (entries: ${dir.files.map((f) => f.path).join(", ")})`
      );
    }

    const tmpOut = `${dest}.tmp`;
    const out = createWriteStream(tmpOut);
    const parser = entry.stream().pipe(
      parseCsvStream({ bom: true, skip_empty_lines: true, relax_column_count: true })
    );
    let info: HeaderInfo | null = null;
    let keep: number[] = [];
    for await (const row of parser as AsyncIterable<string[]>) {
      if (!info) {
        info = readNswHeader(row);
        // Identifier columns in original order, then the month window.
        keep = [
          ...row
            .map((_, i) => i)
            .filter((i) => nswMonthRank(String(row[i])) == null),
          ...info.monthCols,
        ];
      }
      const line = keep.map((i) => csvField(String(row[i] ?? ""))).join(",") + "\n";
      if (!out.write(line)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
    if (!info) throw new Error("BOCSAR CSV entry was empty");
    await rm(dest, { force: true });
    await rename(tmpOut, dest);
    console.log(`  clipped to latest 12 months (to ${info.latestMonth})`);
  } finally {
    await rm(zipPath, { force: true });
  }
}

/** Throw unless `file` starts with the ZIP magic ("PK") - never let an
 * HTML/WAF page saved with a 200 pose as the BOCSAR archive. */
async function assertZipFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(2), 0, 2, 0);
    if (bytesRead < 2 || buffer.toString("latin1") !== "PK") {
      throw new Error(
        `${file} is not a ZIP archive - the URL likely served an HTML/WAF page`
      );
    }
  } finally {
    await fh.close();
  }
}

/**
 * Throw unless `file` looks like the clipped BOCSAR CSV (header mentions
 * "Suburb" and it is not an HTML page) - the analogue of assertQldCrimeCsvFile.
 */
export async function assertNswCrimeCsvFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(256), 0, 256, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    if (head.trimStart().startsWith("<") || !/suburb/i.test(head)) {
      throw new Error(
        `${file} does not start with the BOCSAR "Suburb" header - the clip failed or the URL served an HTML/WAF page`
      );
    }
  } finally {
    await fh.close();
  }
}
