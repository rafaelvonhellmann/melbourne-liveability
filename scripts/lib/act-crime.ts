/**
 * ACT Policing quarterly crime statistics (dataACT, Socrata blob 2egm-dieb).
 *
 * The dataset is an XLSX with one sheet per district (Belconnen, Gungahlin,
 * Inner North, ...). Each sheet stacks offence-category blocks:
 *
 *   Homicide                      <- block title (col A, rest empty)
 *   ["", "2014 Q1 Jan-Mar", ...]  <- quarter header row
 *   ARANDA   0 0 1 ...            <- one row per suburb
 *   ...
 *   Assault - FV                  <- next block
 *
 * We classify each block as property / violent (TINs, CINs and the catch-all
 * "Other offences" are ignored), sum the LATEST FOUR quarters per suburb
 * (a rolling year, comparable to VCSA's "year ending" counts) and join to SA2
 * via the existing SAL crosswalk by normalized suburb name. The ACT is a
 * single jurisdiction ("Unincorporated ACT") so there is no LGA fallback -
 * geographyLevel is "suburb", full stop.
 */
import XLSX from "xlsx";
import { normalizeSuburbName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";
import type { CrimeCounts } from "./vcsa-crime.js";

/** dataACT blob download for "ACT Crime Statistics" (asset 2egm-dieb). */
export const ACT_CRIME_URL =
  "https://www.data.act.gov.au/download/2egm-dieb/application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Raw filename the fetch writes and normalize reads (data/raw). */
export const ACT_CRIME_RAW_FILE = "act-crime-statistics.xlsx";

/**
 * Map an offence-block title to property / violent, or null for blocks we
 * deliberately exclude (traffic/criminal infringement notices, the catch-all
 * "Other offences"). "Other offences against a person" IS violent and must be
 * matched before any generic "other" handling.
 */
export function classifyActOffence(title: string): "property" | "violent" | null {
  const t = title.trim().toLowerCase();
  if (/^(homicide|assault|sexual|robbery)|offences against a person/.test(t)) {
    return "violent";
  }
  if (/^(burglary|motor vehicle theft|theft|property damage)/.test(t)) {
    return "property";
  }
  return null;
}

const QUARTER_LABEL = /20\d{2}\s*Q[1-4]/i;

function cellsEmptyAfterFirst(row: unknown[]): boolean {
  return row.slice(1).every((c) => String(c ?? "").trim() === "");
}

export type ActCrimeParse = {
  /** normalizeSuburbName(suburb) -> latest-4-quarter offence counts. */
  counts: Map<string, CrimeCounts>;
  /** Label of the most recent quarter consumed, e.g. "2025 Q2 Apr-Jun". */
  latestQuarter: string | null;
};

/**
 * Parse every district sheet of the ACT crime workbook into per-suburb
 * property/violent counts over the latest four quarters. Throws when no sheet
 * yields a recognisable offence block, so a reshaped edition fails loudly
 * instead of zeroing the safety domain.
 */
export function parseActCrimeWorkbook(wb: XLSX.WorkBook): ActCrimeParse {
  const counts = new Map<string, CrimeCounts>();
  let latestQuarter: string | null = null;
  let blocksParsed = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });

    // Block titles: non-empty col A with every other cell empty.
    const titleIdx: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const name = String(rows[i][0] ?? "").trim();
      if (name && cellsEmptyAfterFirst(rows[i])) titleIdx.push(i);
    }

    for (let b = 0; b < titleIdx.length; b++) {
      const start = titleIdx[b];
      const end = b + 1 < titleIdx.length ? titleIdx[b + 1] : rows.length;
      const kind = classifyActOffence(String(rows[start][0]));
      if (!kind) continue;

      // Quarter header: first row in the block with >= 2 quarter labels.
      let quarterCols: number[] = [];
      let headerIdx = -1;
      for (let i = start + 1; i < end; i++) {
        const cols: number[] = [];
        rows[i].forEach((c, j) => {
          if (QUARTER_LABEL.test(String(c))) cols.push(j);
        });
        if (cols.length >= 2) {
          quarterCols = cols;
          headerIdx = i;
          break;
        }
      }
      if (headerIdx < 0) continue;

      const last4 = quarterCols.slice(-4);
      const latest = String(rows[headerIdx][last4[last4.length - 1]]).trim();
      if (!latestQuarter || latest > latestQuarter) latestQuarter = latest;
      blocksParsed++;

      for (let i = headerIdx + 1; i < end; i++) {
        const suburb = String(rows[i][0] ?? "").trim();
        if (!suburb || /^total/i.test(suburb)) continue;
        let n = 0;
        for (const c of last4) {
          const v = Number(rows[i][c]);
          if (Number.isFinite(v)) n += v;
        }
        const key = normalizeSuburbName(suburb);
        const cur = counts.get(key) ?? { property: 0, violent: 0 };
        cur[kind] += n;
        counts.set(key, cur);
      }
    }
  }

  if (blocksParsed === 0) {
    throw new Error(
      `no offence blocks recognised (sheets: ${wb.SheetNames.join(", ")}) - the ACT workbook layout changed`
    );
  }
  return { counts, latestQuarter };
}

/**
 * Join per-suburb counts to SA2 places via the crosswalk, by NORMALIZED suburb
 * name only - the ACT is one jurisdiction, so suburb|lga keys would only add a
 * constant. Mirrors applyCrimeToPlaces (vcsa-crime.ts): crosswalk-weighted
 * counts over SA2 population -> rate per 100k, crimeMethod from the crosswalk.
 */
export function applyActCrimeToPlaces<
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
  let matched = 0;
  let unmatched = 0;
  for (const p of places) {
    const entry = cw.sa2ToSuburb[p.sa2Code];
    let wProp = 0;
    let wViol = 0;
    let hit = false;
    for (const s of entry?.suburbs ?? []) {
      const c = counts.get(normalizeSuburbName(s.suburb));
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
