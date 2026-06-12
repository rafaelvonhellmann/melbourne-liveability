/**
 * SAPOL (South Australia Police) crime statistics by suburb by reported date.
 *
 * Dataset: "Crime statistics" on data.sa.gov.au (South Australia Police org,
 * licence CC BY):
 *   https://data.sa.gov.au/data/dataset/crime-statistics
 * One CSV per fiscal year back to 2010-11; the in-progress year is published
 * as a partial resource ("Crime Statistics 2025-26 Q1 - Q3") and REPLACED in
 * place as quarters accrue, so resource URLs/filenames change every release.
 * fetch() therefore discovers the newest TWO fiscal-year resources via the
 * CKAN API (package_show) instead of pinning a URL: a rolling 12-month
 * window usually spans the fiscal-year boundary (a fresh Q1-only file holds
 * just three months).
 *
 * Shape: one LONG CSV per fiscal year - one row per Reported Date
 * (DD/MM/YYYY, daily) x suburb x Offence Level 3 Description, with an
 * "Offence count" value column. Columns: Reported Date, Suburb - Incident,
 * Postcode - Incident, Offence Level 1/2/3 Description, Offence count.
 * Values are INCIDENT COUNTS, so we divide by SA2 ERP population ourselves -
 * the per-100k convention shared with the VIC/ACT/NSW/WA suburb adapters.
 *
 * Offence classification (Level 1 ONLY):
 *   violent  = OFFENCES AGAINST THE PERSON
 *   property = OFFENCES AGAINST PROPERTY
 * Those two divisions are the ONLY Level 1 values SAPOL publishes here -
 * drug, justice-procedure, public-order and traffic offences are not in the
 * dataset at all, so the exclusion the other adapters apply by
 * classification happens at the source. Level 2 is deliberately NOT keyed
 * on: SAPOL relabelled every Level 2 between the 2024-25 and 2025-26
 * editions ("THEFT AND RELATED OFFENCES" -> "THEFT", "ROBBERY AND RELATED
 * OFFENCES" -> "ROBBERY, BLACKMAIL, AND EXTORTION", ...) while Level 1
 * stayed stable.
 *
 * SEXUAL OFFENCES CAVEAT (documented in sources.json): SAPOL withholds the
 * incident location for sexual offences - every such row carries suburb
 * "NOT DISCLOSED" (verified 2026-06: all 757 SEXUAL OFFENCES rows in the
 * 2025-26 Q1-Q3 file). Suburb-level violent rates therefore EXCLUDE sexual
 * offences by construction; this is a per-source footnote on the
 * methodology page, not a blocker.
 *
 * Time window: sum of the LATEST TWELVE months by Reported Date across the
 * two newest fiscal-year files - a rolling year, comparable to VCSA's "year
 * ending" counts, the ACT's latest four quarters and the NSW/WA/QLD
 * latest-12-month windows. fetch() CLIPS the combined download to exactly
 * that window, so the provenance hash covers exactly what normalize
 * consumes; parse() re-derives the window by month rank and reads the
 * clipped file and the full exports identically.
 *
 * Suburb join: by bare normalized name, like the ACT. SA gazetted locality
 * names are unique STATEWIDE (Surveyor-General naming policy), so the
 * NSW-style suburb|LGA collision guard is unnecessary - verified
 * empirically when wiring this up: zero duplicate normalized names across
 * the Adelaide crosswalk's 571 suburb links, and every Adelaide-crosswalk
 * name found at a non-metro postcode in the statewide file is a genuine
 * GCCSA-fringe locality (Two Wells, Roseworthy, Lewiston, Mount Crawford).
 * ABS "(SA)" suffixes on crosswalk names (cross-STATE disambiguation, e.g.
 * "Stirling (SA)" vs Stirling WA) are stripped by the shared normalizer on
 * both sides.
 *
 * The files are statewide, so any SA region (adelaide today) reuses this
 * adapter unchanged.
 */
import { open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseCsvSync } from "csv-parse/sync";
import { normalizeSuburbName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import { downloadToFile } from "./gov-fetch.js";
import { applyActCrimeToPlaces } from "./act-crime.js";
import type { CrimeCounts } from "./vcsa-crime.js";

/** CKAN package_show for the SAPOL "Crime statistics" dataset. */
export const SA_CRIME_PACKAGE_API =
  "https://data.sa.gov.au/data/api/3/action/package_show?id=crime-statistics";

/** Clipped raw filename the fetch writes and normalize reads (data/raw). */
export const SA_CRIME_RAW_FILE = "sa-sapol-suburb-offences.csv";

const UA = "MelbourneLiveability/1.0";

/**
 * Classify a SAPOL "Offence Level 1 Description" as property / violent.
 * Exact (case-insensitive) matches only: a renamed division drops out rather
 * than misclassifying, and parse() throws when NOTHING classifies, so a
 * wholesale relabel still fails loudly. Level 2/3 labels are never consulted
 * (SAPOL renamed all of them between the 2024-25 and 2025-26 editions).
 */
export function classifySaOffence(level1: string): "property" | "violent" | null {
  const l = level1.trim().toLowerCase();
  if (l === "offences against the person") return "violent";
  if (l === "offences against property") return "property";
  return null;
}

/**
 * Rank a SAPOL "Reported Date" (DD/MM/YYYY) as a comparable month index, or
 * null for anything unrecognised (header labels, ISO dates from a reshaped
 * export). Consecutive months differ by exactly 1.
 */
export function saMonthRank(date: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[3]) * 12 + (month - 1);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Mon YYYY" label for a saMonthRank value, e.g. "Mar 2026". */
export function saMonthLabel(rank: number): string {
  return `${MONTH_NAMES[rank % 12]} ${Math.floor(rank / 12)}`;
}

/** Subset of a data.sa.gov.au CKAN resource used for selection. */
export type SaCkanResource = {
  url?: string;
  name?: string;
  format?: string;
  last_modified?: string;
};

/** Fiscal-year start from a resource name ("Crime Statistics 2025-26 Q1 - Q3"
 * -> 2025), or null when no fiscal-year span is present. */
function fiscalYearRank(name: string): number | null {
  const m = /(20\d{2})\s*[-/]\s*\d{2,4}/.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * Pick the NEWEST TWO fiscal-year crime CSVs from the CKAN resource list:
 * "Crime Statistics YYYY-YY" only (the parallel "Family & Domestic Abuse
 * related-offences" series is a subset of the same incidents - including it
 * would double count), CSV URLs only (the 2011-12 resource is an .xlsx
 * mislabelled as CSV), one resource per fiscal year (ties go to the latest
 * last_modified - SAPOL replaces the in-progress year's file in place).
 * Returned newest-first; empty when nothing matches (fetch throws with the
 * resource names for diagnosis).
 */
export function pickSaCrimeResources(resources: SaCkanResource[]): SaCkanResource[] {
  const byYear = new Map<number, SaCkanResource>();
  for (const r of resources) {
    if (!r.url || !/\.csv(?:[?#]|$)/i.test(r.url)) continue;
    const name = r.name ?? "";
    if (!/crime\s*stat/i.test(name) || /family|domestic/i.test(name)) continue;
    const year = fiscalYearRank(name);
    if (year == null) continue;
    const cur = byYear.get(year);
    if (!cur || String(r.last_modified ?? "") > String(cur.last_modified ?? "")) {
      byYear.set(year, r);
    }
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([, r]) => r);
}

export type SaCrimeParse = {
  /** normalizeSuburbName(suburb) -> latest-12-month counts. */
  bySuburb: Map<string, CrimeCounts>;
  /** Label of the most recent month consumed, e.g. "Mar 2026". */
  latestMonth: string;
  /** Distinct months inside the rolling window (12 when the grid is full). */
  monthsUsed: number;
};

type SaHeaderInfo = {
  dateCol: number;
  suburbCol: number;
  level1Col: number;
  countCol: number;
};

/** Locate the identifier + count columns; throws on a reshaped export. */
function readSaHeader(header: string[]): SaHeaderInfo {
  const labels = header.map((h) => String(h).trim());
  const dateCol = labels.findIndex((l) => /^reported date$/i.test(l));
  const suburbCol = labels.findIndex((l) => /^suburb\s*-\s*incident$/i.test(l));
  const level1Col = labels.findIndex((l) => /^offence level 1 description$/i.test(l));
  const countCol = labels.findIndex((l) => /^offence count$/i.test(l));
  if (dateCol < 0 || suburbCol < 0 || level1Col < 0 || countCol < 0) {
    throw new Error(
      `SAPOL identifier columns not found (need "Reported Date" + "Suburb - Incident" + ` +
        `"Offence Level 1 Description" + "Offence count"; got: ${labels.slice(0, 7).join(", ")}) ` +
        `- the export layout changed`
    );
  }
  return { dateCol, suburbCol, level1Col, countCol };
}

/**
 * Parse the (clipped or full) statewide SAPOL suburb CSV into per-suburb
 * property/violent incident counts over the latest twelve months by Reported
 * Date. Rows whose suburb is withheld (blank or "NOT DISCLOSED" - all sexual
 * offences) are skipped: they can never join to a place. Throws when the
 * identifier columns are missing, no date parses, or no row classifies, so a
 * reshaped export fails loudly instead of zeroing the safety domain.
 */
export function parseSaCrimeCsv(text: string): SaCrimeParse {
  const rows = parseCsvSync(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (!rows.length) throw new Error("SAPOL crime CSV is empty");

  const { dateCol, suburbCol, level1Col, countCol } = readSaHeader(rows[0]);

  let maxRank = -1;
  for (let i = 1; i < rows.length; i++) {
    const rank = saMonthRank(String(rows[i][dateCol] ?? ""));
    if (rank != null && rank > maxRank) maxRank = rank;
  }
  if (maxRank < 0) {
    throw new Error(
      'no parsable "DD/MM/YYYY" Reported Date values - the export layout changed'
    );
  }

  const bySuburb = new Map<string, CrimeCounts>();
  const months = new Set<number>();
  for (let i = 1; i < rows.length; i++) {
    const rank = saMonthRank(String(rows[i][dateCol] ?? ""));
    if (rank == null || rank <= maxRank - 12) continue;
    const kind = classifySaOffence(String(rows[i][level1Col] ?? ""));
    if (!kind) continue;
    const suburb = String(rows[i][suburbCol] ?? "").trim();
    // Withheld locations (all sexual offences arrive as "NOT DISCLOSED")
    // never join to a place - skip them rather than carry phantom keys.
    if (!suburb || /^not disclosed$/i.test(suburb)) continue;
    const n = Number(rows[i][countCol]);
    if (!Number.isFinite(n)) continue;
    months.add(rank);
    const key = normalizeSuburbName(suburb);
    const cur = bySuburb.get(key) ?? { property: 0, violent: 0 };
    cur[kind] += n;
    bySuburb.set(key, cur);
  }
  if (!bySuburb.size) {
    throw new Error(
      "no suburb rows classified from the latest 12 months - the export layout changed"
    );
  }
  return { bySuburb, latestMonth: saMonthLabel(maxRank), monthsUsed: months.size };
}

/**
 * Join per-suburb counts to SA2 places via the crosswalk by bare normalized
 * name - SA locality names are unique statewide (see module header), so the
 * join is collision-safe without NSW's suburb|LGA qualifier. Delegates to
 * the ACT implementation (the other bare-name suburb join): crosswalk-
 * weighted counts over SA2 ERP population -> rate per 100k, crimeMethod from
 * the crosswalk.
 */
export function applySaCrimeToPlaces<
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
  counts: Map<string, CrimeCounts>
): { matched: number; unmatched: number } {
  return applyActCrimeToPlaces(places, cw, counts);
}

/** CSV-quote a field (quotes doubled) - Level 2/3 labels hold commas. */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Discover the newest two fiscal-year crime CSVs via CKAN, download both, and
 * write SA_CRIME_RAW_FILE clipped to the rows inside the latest-12-month
 * window (the window usually spans the fiscal-year boundary). Both files must
 * agree on the column layout - a half-reshaped pair throws rather than
 * concatenating mismatched columns. All original columns are preserved.
 */
export async function fetchSaCrime(rawDir: string): Promise<void> {
  const res = await fetch(SA_CRIME_PACKAGE_API, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`CKAN package_show ${res.status}: ${SA_CRIME_PACKAGE_API}`);
  }
  const data = (await res.json()) as {
    result?: { resources?: SaCkanResource[] };
  };
  const resources = data.result?.resources ?? [];
  const picked = pickSaCrimeResources(resources);
  if (!picked.length) {
    throw new Error(
      `no fiscal-year crime CSV among ${resources.length} CKAN resources ` +
        `(latest names: ${resources.slice(0, 3).map((r) => r.name).join("; ")})`
    );
  }

  const dest = path.join(rawDir, SA_CRIME_RAW_FILE);
  let header: string[] | null = null;
  let dateCol = -1;
  const dataRows: string[][] = [];
  // Oldest fiscal year first so the clipped file reads chronologically.
  for (const [i, r] of [...picked].reverse().entries()) {
    const tmp = `${dest}.part${i}.tmp`;
    try {
      await downloadToFile(r.url!, tmp);
      const text = await readFile(tmp, "utf8");
      if (text.trimStart().startsWith("<")) {
        throw new Error(`${r.url} served an HTML/WAF page instead of the CSV`);
      }
      const rows = parseCsvSync(text, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as string[][];
      if (!rows.length) throw new Error(`${r.name}: CSV is empty`);
      const info = readSaHeader(rows[0]);
      const labels = rows[0].map((h) => String(h).trim().toLowerCase()).join("|");
      if (!header) {
        header = rows[0];
        dateCol = info.dateCol;
      } else if (labels !== header.map((h) => String(h).trim().toLowerCase()).join("|")) {
        throw new Error(
          `fiscal-year files disagree on column layout ("${r.name}" vs "${picked[picked.length - 1].name}")`
        );
      }
      for (let j = 1; j < rows.length; j++) dataRows.push(rows[j]);
      console.log(`  ${r.name}`);
    } finally {
      await rm(tmp, { force: true });
    }
  }
  if (!header) throw new Error("no SAPOL CSV downloaded");

  let maxRank = -1;
  for (const row of dataRows) {
    const rank = saMonthRank(String(row[dateCol] ?? ""));
    if (rank != null && rank > maxRank) maxRank = rank;
  }
  if (maxRank < 0) {
    throw new Error('no parsable "DD/MM/YYYY" Reported Date values across the downloads');
  }

  const lines = [header.map((h) => csvField(String(h))).join(",")];
  for (const row of dataRows) {
    const rank = saMonthRank(String(row[dateCol] ?? ""));
    if (rank == null || rank <= maxRank - 12) continue;
    lines.push(row.map((c) => csvField(String(c ?? ""))).join(","));
  }
  await writeFile(dest, lines.join("\n") + "\n", "utf8");
  console.log(`  clipped to latest 12 months (to ${saMonthLabel(maxRank)})`);
}

/**
 * Throw unless `file` looks like the clipped SAPOL CSV (header mentions
 * "Reported Date" and it is not an HTML page) - the analogue of
 * assertNswCrimeCsvFile.
 */
export async function assertSaCrimeCsvFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(256), 0, 256, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    if (head.trimStart().startsWith("<") || !/reported date/i.test(head)) {
      throw new Error(
        `${file} does not start with the SAPOL "Reported Date" header - the clip failed or the URL served an HTML/WAF page`
      );
    }
  } finally {
    await fh.close();
  }
}
