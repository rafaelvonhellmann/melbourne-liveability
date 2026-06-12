/**
 * QPS (Queensland Police Service) reported offence RATES by LGA.
 *
 * Dataset: "LGA Reported Offences Rates" on data.qld.gov.au (QPS open data,
 * licence CC BY 4.0):
 *   https://www.data.qld.gov.au/dataset/lga_reported_offences_rates
 * CSV (S3, regenerated monthly - Last-Modified 2026-06-09 when wired up):
 *   https://open-crime-data.s3-ap-southeast-2.amazonaws.com/Crime%20Statistics/LGA_Reported_Offences_Rates.csv
 *
 * Shape: one row per LGA per month (JAN01..now, all 77 QLD councils), one
 * column per offence category. Values are offences per 100,000 ESTIMATED
 * RESIDENT POPULATION - QPS divides the companion LGA_Reported_Offences_Number
 * counts by ABS ERP (verified numerically: count/rate*100k returns the LGA's
 * ERP). That is the exact per-100k-via-ERP convention the VIC/ACT adapters
 * compute by hand from counts + SA2 population.
 *
 * Why rates, not the counts CSV: QPS publishes LGA-level only (suburb data
 * exists solely behind the per-query crime-map API). VIC's LGA fallback
 * divides an LGA-wide COUNT by each SA2's own population, which is fine for
 * the handful of suburb-miss places it serves there, but applied to 100% of a
 * region it would rank SA2s within one LGA by inverse population - pure noise.
 * Assigning QPS's own ERP-based LGA rate to every SA2 in the LGA keeps the
 * per-100k convention honest (within-LGA ties, real differences across LGAs).
 *
 * Offence classification (division ROLLUP columns only - the per-category
 * columns double-count, e.g. "Assault" is itself the sum of the Grievous/
 * Serious/Common columns next to it):
 *   violent  = "Offences Against the Person"  (homicide, assault, sexual
 *              offences, robbery, other offences against the person)
 *   property = "Offences Against Property"    (unlawful entry, arson, property
 *              damage, motor vehicle theft, other theft, fraud, handling
 *              stolen goods)
 *   excluded = "Other Offences" rollup and everything in it (drugs,
 *              prostitution, liquor/gaming, breach DVO, trespassing, weapons,
 *              good order, traffic, miscellaneous) - mirrors the VIC adapter
 *              (divisions C-F excluded) and the ACT one (TINs/CINs/"Other
 *              offences" excluded).
 *
 * Time window: sum of the LATEST TWELVE monthly rates per LGA - a rolling
 * year, comparable to VCSA's "year ending" counts and the ACT's latest four
 * quarters. Monthly per-100k rates over one ERP denominator sum to the annual
 * per-100k rate.
 *
 * The file is statewide, so any QLD region (brisbane today; gold coast,
 * sunshine coast, townsville later) reuses this adapter unchanged.
 */
import { open } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { normalizeLgaName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import type { CrimeCounts } from "./vcsa-crime.js";

/** Direct CSV download (S3 bucket behind the data.qld.gov.au resource). */
export const QLD_CRIME_URL =
  "https://open-crime-data.s3-ap-southeast-2.amazonaws.com/Crime%20Statistics/LGA_Reported_Offences_Rates.csv";

/** Raw filename the fetch writes and normalize reads (data/raw). */
export const QLD_CRIME_RAW_FILE = "qld-lga-offence-rates.csv";

/**
 * Classify a QPS column header as property / violent, or null for everything
 * we deliberately ignore. ONLY the two division rollups are consumed: the
 * per-category columns beside them are partial duplicates (parent categories
 * like "Assault" repeat as the sum of their sub-columns), so summing
 * individual columns would double-count. See header comment for the mapping.
 */
export function classifyQldOffence(column: string): "property" | "violent" | null {
  const c = column.trim().toLowerCase();
  if (c === "offences against the person") return "violent";
  if (c === "offences against property") return "property";
  return null;
}

/**
 * Canonical LGA key shared by the QPS CSV ("Brisbane City Council", "Scenic
 * Rim Regional Council", "Weipa (T)") and the crosswalk's ABS-derived names
 * ("Brisbane", "Scenic Rim"): strip the council-type suffix / parenthetical
 * abbreviation, then apply the cross-source normalizeLgaName.
 */
export function normalizeQldLgaName(name: string): string {
  return normalizeLgaName(
    name
      .replace(/\s+(?:city|shire|regional|town)?\s*council$/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
  );
}

const MONTH_NUM: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/**
 * Rank a QPS "Month Year" label ("MAY26") as a comparable month index, or
 * null for anything unrecognised. Two-digit years pivot at 97: the QPS series
 * start in JUL97, so 97-99 are 19xx and everything else 20xx.
 */
export function qldMonthRank(label: string): number | null {
  const m = /^([A-Z]{3})(\d{2})$/.exec(label.trim().toUpperCase());
  if (!m || !(m[1] in MONTH_NUM)) return null;
  const yy = Number(m[2]);
  const year = yy >= 97 ? 1900 + yy : 2000 + yy;
  return year * 12 + MONTH_NUM[m[1]];
}

export type QldCrimeParse = {
  /** normalizeQldLgaName(LGA) -> annual (latest 12 months) rates per 100k ERP. */
  rates: Map<string, CrimeCounts>;
  /** Label of the most recent month consumed, e.g. "MAY26". */
  latestMonth: string;
  /** Distinct months inside the rolling window (12 when the grid is full). */
  monthsUsed: number;
};

/**
 * Parse the statewide QPS LGA rates CSV into per-LGA property/violent annual
 * rates (sum of the latest twelve monthly per-100k rates). Throws when the
 * division rollup columns or the month labels are missing, so a reshaped
 * export fails loudly instead of zeroing the safety domain.
 */
export function parseQldCrimeCsv(text: string): QldCrimeParse {
  const rows = parse(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (!rows.length) throw new Error("QPS LGA rates CSV is empty");

  const header = rows[0].map((h) => String(h).trim());
  let violentCol = -1;
  let propertyCol = -1;
  header.forEach((label, i) => {
    const kind = classifyQldOffence(label);
    if (kind === "violent") violentCol = i;
    if (kind === "property") propertyCol = i;
  });
  if (violentCol < 0 || propertyCol < 0) {
    throw new Error(
      `QPS division rollup columns not found (need "Offences Against the Person" + ` +
        `"Offences Against Property"; got ${header.length} columns) - the export layout changed`
    );
  }

  let maxRank = -1;
  let latestMonth = "";
  for (let i = 1; i < rows.length; i++) {
    const rank = qldMonthRank(String(rows[i][1] ?? ""));
    if (rank != null && rank > maxRank) {
      maxRank = rank;
      latestMonth = String(rows[i][1]).trim();
    }
  }
  if (maxRank < 0) {
    throw new Error('no parsable "Month Year" labels (expected e.g. "MAY26")');
  }

  const rates = new Map<string, CrimeCounts>();
  const months = new Set<number>();
  for (let i = 1; i < rows.length; i++) {
    const rank = qldMonthRank(String(rows[i][1] ?? ""));
    if (rank == null || rank <= maxRank - 12) continue; // latest 12 months only
    const lga = String(rows[i][0] ?? "").trim();
    const property = Number(rows[i][propertyCol]);
    const violent = Number(rows[i][violentCol]);
    if (!lga || !Number.isFinite(property) || !Number.isFinite(violent)) continue;
    months.add(rank);
    const key = normalizeQldLgaName(lga);
    const cur = rates.get(key) ?? { property: 0, violent: 0 };
    cur.property += property;
    cur.violent += violent;
    rates.set(key, cur);
  }
  if (!rates.size) {
    throw new Error("no LGA rows parsed from the latest 12 months - the export layout changed");
  }
  return { rates, latestMonth, monthsUsed: months.size };
}

/**
 * Join per-LGA rates to SA2 places via the crosswalk's suburb->LGA fields:
 * each SA2 gets the suburb-weight-weighted mean of its overlapping LGAs'
 * rates (renormalized over the matched weight, so a stray "Unknown" LGA
 * suburb cannot dilute the rate). No population division here - the QPS
 * rates are already per 100k ERP. crimeMethod is "direct", the tag VIC's
 * LGA-level fallback uses for LGA-keyed assignment.
 */
export function applyQldCrimeToPlaces<
  T extends {
    sa2Code: string;
    propertyCrimeRate: number | null;
    violentCrimeRate: number | null;
    crimeMethod?: "direct" | "population-weighted" | "area-weighted" | null;
  },
>(
  places: Iterable<T>,
  cw: CrosswalkFile,
  rates: Map<string, CrimeCounts>
): { matched: number; unmatched: number } {
  let matched = 0;
  let unmatched = 0;
  for (const p of places) {
    const entry = cw.sa2ToSuburb[p.sa2Code];
    let wProp = 0;
    let wViol = 0;
    let wSum = 0;
    for (const s of entry?.suburbs ?? []) {
      const r = rates.get(normalizeQldLgaName(s.lga));
      if (!r || !(s.weight > 0)) continue;
      wSum += s.weight;
      wProp += s.weight * r.property;
      wViol += s.weight * r.violent;
    }
    if (wSum <= 0) {
      unmatched++;
      continue;
    }
    p.propertyCrimeRate = wProp / wSum;
    p.violentCrimeRate = wViol / wSum;
    p.crimeMethod = "direct";
    matched++;
  }
  return { matched, unmatched };
}

/**
 * Throw unless `file` looks like the QPS LGA CSV (header mentions "LGA Name"
 * and it is not an HTML/WAF page saved with a 200) - the CSV analogue of
 * vcsa-crime's assertXlsxFile.
 */
export async function assertQldCrimeCsvFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(256), 0, 256, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    if (head.trimStart().startsWith("<") || !/lga name/i.test(head)) {
      throw new Error(
        `${file} does not start with the QPS "LGA Name" header - the URL likely served an HTML/WAF page`
      );
    }
  } finally {
    await fh.close();
  }
}
