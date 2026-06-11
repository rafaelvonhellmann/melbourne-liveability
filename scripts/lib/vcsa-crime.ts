import XLSX from "xlsx";
import { open } from "node:fs/promises";
import { suburbLgaKey, normalizeLgaName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";

export type CrimeCounts = { property: number; violent: number };

/* ------------------------------------------------------------------------- *
 * CKAN resource selection
 *
 * data.vic has renamed the recorded-offences resources at least twice
 * ("Data_Tables_LGA_Recorded_Offences_Year_Ending_September_2025" download
 * names vs display names like "Recorded offences by LGA - Year Ending Sep
 * 2025"); a June 2026 rename broke the old /LGA.*Recorded/ name filter and
 * silently zeroed the safety domain (refresh run 27280836153). Match on name
 * OR URL, and select the latest edition by PARSED year-ending date - never by
 * name sort order, where "Sep 2025" out-sorts "Dec 2025".
 * ------------------------------------------------------------------------- */

/** Subset of a CKAN package_show resource used for selection. */
export type CkanCrimeResource = { url?: string; format?: string; name?: string };

const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Rank free text (resource name + URL) by its "year ending" date as
 * YYYY*100+month, e.g. "Year Ending Dec 2025" -> 202512. Accepts any month
 * spelling that starts with the 3-letter abbreviation (Sep/Sept/September,
 * with space/underscore/dash/dot separators). Falls back to a bare year
 * (-> YYYY*100) and returns null when no date is found at all.
 */
export function yearEndingRank(text: string): number | null {
  const m =
    /(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ _.-]*(20\d{2})/i.exec(
      text
    );
  if (m) return Number(m[2]) * 100 + MONTH_NUM[m[1].toLowerCase()];
  const y = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(text);
  return y ? Number(y[1]) * 100 : null;
}

/**
 * Pick the latest LGA recorded-offences XLSX from a CKAN resource list.
 * Tolerates the metadata quirks observed live: format strings "XLSX", ".xlsx"
 * and the "xlsl" typo (also accepts a .xlsx URL), and display-name renames
 * (matches "lga" + "offence" across name and URL - the download filename has
 * been the stable part). Excludes the non-LGA "Visualisation" workbook, which
 * has no "lga" in either field. Returns null when nothing matches.
 */
export function pickLgaOffencesXlsx(
  resources: CkanCrimeResource[]
): CkanCrimeResource | null {
  let best: CkanCrimeResource | null = null;
  let bestRank = -1;
  for (const r of resources) {
    if (!r.url) continue;
    const hay = `${r.name ?? ""} ${r.url}`;
    const isXlsx =
      /xlsx/i.test(r.format ?? "") || /\.xlsx(?:[?#]|$)/i.test(r.url);
    if (!isXlsx) continue;
    if (!/lga/i.test(hay) || !/offence/i.test(hay)) continue;
    const rank = yearEndingRank(hay) ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = r;
    }
  }
  return best;
}

/**
 * Throw unless `file` starts with the zip magic (every real XLSX does). Guards
 * the downloaded workbook against a WAF challenge / HTML landing page saved
 * with a 200 status - the "silent shape breakage" class from
 * DATA-PIPELINE-AUDIT.md.
 */
export async function assertXlsxFile(file: string): Promise<void> {
  const fh = await open(file, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(2), 0, 2, 0);
    if (bytesRead < 2 || buffer.toString("latin1") !== "PK") {
      throw new Error(
        `${file} is not an XLSX (zip magic missing) - the URL likely served an HTML/WAF page`
      );
    }
  } finally {
    await fh.close();
  }
}

/* ------------------------------------------------------------------------- *
 * Shape-tolerant workbook parsing: locate sheets and header rows by the
 * column labels actually consumed, so a renamed sheet or preamble rows in a
 * new VCSA edition degrade loudly (thrown reason) instead of parsing to zero.
 * ------------------------------------------------------------------------- */

/** Column labels the suburb-level (Table 03) parser consumes. */
export const SUBURB_CRIME_LABELS = [
  "Year",
  "Local Government Area",
  "Suburb/Town Name",
  "Offence Division",
  "Offence Count",
];

/** Column labels the LGA-level (Table 02) parser consumes. */
export const LGA_CRIME_LABELS = [
  "Year",
  "Local Government Area",
  "Offence Division",
  "Offence Count",
];

function firstRows(sheet: XLSX.WorkSheet, n: number): unknown[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  range.e.r = Math.min(range.e.r, range.s.r + n - 1);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    range,
  });
}

/**
 * Index of the first row (within the first `scanRows`) containing every
 * `required` label (trimmed, case-insensitive), or -1. Tolerates preamble /
 * title rows above the header.
 */
export function findHeaderRow(
  sheet: XLSX.WorkSheet,
  required: string[],
  scanRows = 15
): number {
  const want = required.map((l) => l.toLowerCase());
  return firstRows(sheet, scanRows).findIndex((r) => {
    const labels = r.map((c) => String(c).trim().toLowerCase());
    return want.every((w) => labels.includes(w));
  });
}

/**
 * Rows of `sheet` as records keyed by TRIMMED header labels, with the header
 * row located by scanning for `required`. Throws (with the labels it needed)
 * when no header row qualifies, so callers log a precise reason.
 */
export function sheetRecords(
  sheet: XLSX.WorkSheet,
  required: string[]
): Record<string, unknown>[] {
  const idx = findHeaderRow(sheet, required);
  if (idx < 0) {
    throw new Error(`header row not found (need columns: ${required.join(", ")})`);
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    range: idx,
  });
  return raw.map((rec) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k.trim()] = v;
    return out;
  });
}

/**
 * Find the sheet whose header contains every `required` label and none of
 * `forbidden`, preferring sheet names matching `preferName` (the documented
 * "Table 0x" names) but falling back to a content scan when the edition
 * renames its sheets. `forbidden` keeps the LGA lookup from landing on the
 * suburb sheet, whose header is a superset.
 */
export function findCrimeSheet(
  wb: XLSX.WorkBook,
  preferName: RegExp,
  required: string[],
  forbidden: string[] = []
): XLSX.WorkSheet | null {
  const names = [...wb.SheetNames].sort(
    (a, b) => Number(preferName.test(b)) - Number(preferName.test(a))
  );
  for (const n of names) {
    const sheet = wb.Sheets[n];
    if (!sheet) continue;
    const idx = findHeaderRow(sheet, required);
    if (idx < 0) continue;
    if (forbidden.length && findHeaderRow(sheet, forbidden) === idx) continue;
    return sheet;
  }
  return null;
}

/** Largest finite `Year` across rows (the latest year-ending edition rows). */
function latestYear(rows: Record<string, unknown>[]): number {
  let max = 0;
  for (const row of rows) {
    const y = Number(row.Year);
    if (Number.isFinite(y) && y > max) max = y;
  }
  return max;
}

function classifyOffence(offence: string): "property" | "violent" | null {
  const o = offence.toLowerCase();
  if (/^b\s|property|deception|theft|burglary|damage|steal/i.test(o)) return "property";
  if (/^a\s|person|assault|robbery|sexual|violent|homicide/i.test(o)) return "violent";
  return null;
}

/**
 * Suburb-level (Table 03) offence counts for the LATEST year in the sheet.
 * Header row located by label scan (shape-tolerant); throws when the expected
 * columns are missing so a new edition fails with a reason, not zero rows.
 */
export function parseSuburbCrimeTable03(
  sheet: XLSX.WorkSheet
): Map<string, CrimeCounts> {
  const rows = sheetRecords(sheet, SUBURB_CRIME_LABELS);
  const maxYear = latestYear(rows);

  const out = new Map<string, CrimeCounts>();
  for (const row of rows) {
    if (maxYear && Number(row.Year) !== maxYear) continue;
    const suburb = String(row["Suburb/Town Name"] ?? "").trim();
    const lga = String(row["Local Government Area"] ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const offence = String(row["Offence Division"] ?? "");
    const count = Number(row["Offence Count"] ?? 0);
    if (!suburb || !lga || !Number.isFinite(count)) continue;
    const kind = classifyOffence(offence);
    if (!kind) continue;
    const key = suburbLgaKey(suburb, lga);
    const cur = out.get(key) ?? { property: 0, violent: 0 };
    cur[kind] += count;
    out.set(key, cur);
  }
  return out;
}

/**
 * LGA-level (Table 02) fallback counts for the LATEST year in the sheet.
 * Previously this summed across ALL years in the export (about a decade),
 * inflating the per-100k fallback rate by ~10x for any place that missed a
 * suburb match; now mirrors Table 03's latest-year selection.
 */
export function parseLgaCrimeTable02(
  sheet: XLSX.WorkSheet
): { property: Map<string, number>; violent: Map<string, number> } {
  const rows = sheetRecords(sheet, LGA_CRIME_LABELS);
  const maxYear = latestYear(rows);
  const property = new Map<string, number>();
  const violent = new Map<string, number>();
  for (const row of rows) {
    if (maxYear && Number(row.Year) !== maxYear) continue;
    const lga = String(row["Local Government Area"] ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const offence = String(row["Offence Division"] ?? "").toLowerCase();
    const count = Number(row["Offence Count"] ?? 0);
    if (!lga || !Number.isFinite(count)) continue;
    if (/^b\s|property|deception|theft|burglary|damage|steal/i.test(offence)) {
      property.set(lga, (property.get(lga) ?? 0) + count);
    } else if (
      /^a\s|person|assault|robbery|sexual|violent|homicide/i.test(offence)
    ) {
      violent.set(lga, (violent.get(lga) ?? 0) + count);
    }
  }
  return { property, violent };
}

const normLga = normalizeLgaName;

export function applyCrimeToPlaces<
  T extends {
    sa2Code: string;
    lga: string;
    population: number | null;
    propertyCrimeRate: number | null;
    violentCrimeRate: number | null;
    crimeMethod?: "direct" | "population-weighted" | "area-weighted" | null;
  },
>(places: Iterable<T>, cw: CrosswalkFile, suburb: Map<string, CrimeCounts>, lga: {
  property: Map<string, number>;
  violent: Map<string, number>;
}): { suburbMatched: number; lgaFallback: number } {
  let suburbMatched = 0;
  let lgaFallback = 0;

  const matchLga = (m: Map<string, number>, targetLga: string) => {
    const target = normLga(targetLga);
    for (const [k, v] of m) {
      const nk = normLga(k);
      if (target === nk || target.startsWith(nk) || nk.startsWith(target)) return v;
    }
    return null;
  };

  for (const p of places) {
    const pop = p.population ?? 10000;
    const entry = cw.sa2ToSuburb[p.sa2Code];
    let wProp = 0;
    let wViol = 0;
    let matched = false;

    if (entry?.suburbs.length) {
      for (const s of entry.suburbs) {
        const c = suburb.get(suburbLgaKey(s.suburb, s.lga));
        if (!c) continue;
        matched = true;
        wProp += s.weight * c.property;
        wViol += s.weight * c.violent;
      }
    }

    if (matched && (wProp > 0 || wViol > 0)) {
      if (wProp > 0) p.propertyCrimeRate = (wProp / pop) * 100000;
      if (wViol > 0) p.violentCrimeRate = (wViol / pop) * 100000;
      p.crimeMethod = entry?.suburbs[0]?.method ?? "area-weighted";
      suburbMatched++;
      continue;
    }

    const prop = matchLga(lga.property, p.lga);
    const viol = matchLga(lga.violent, p.lga);
    if (prop != null) p.propertyCrimeRate = (prop / pop) * 100000;
    if (viol != null) p.violentCrimeRate = (viol / pop) * 100000;
    if (prop != null || viol != null) {
      p.crimeMethod = "direct";
      lgaFallback++;
    }
  }

  return { suburbMatched, lgaFallback };
}
