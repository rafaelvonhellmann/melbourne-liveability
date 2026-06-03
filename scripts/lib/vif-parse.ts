/**
 * Parse the VIF2023 SA2 XLSX (population + dwelling projections to 2036) into a
 * per-SA2 map. Shared by scripts/apply-vif.ts and scripts/normalize.ts so the
 * one (slightly fiddly) sheet layout lives in a single place.
 *
 * Sheet quirks (verified): the header is NOT row 0 - it sits a few rows down; the
 * SA2 code column header has a DOUBLE SPACE ("SA2  code"); rows mix SA2/SA3/SA4/
 * GCCSA so we filter Region Type === "SA2". Years are 5-yearly columns.
 */
import XLSX from "xlsx";

const YEARS = [2021, 2026, 2031, 2036];

export type VifYearMap = Record<string, number>;
export type VifRecord = { population: VifYearMap; dwellings: VifYearMap };

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function readSheet(wb: XLSX.WorkBook, name: string): Map<string, VifYearMap> {
  const out = new Map<string, VifYearMap>();
  const ws = wb.Sheets[name];
  if (!ws) return out;
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    blankrows: false,
  });

  // Find the header row (scan the first dozen rows for the SA2-code column).
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if ((rows[i] ?? []).some((c) => norm(c) === "SA2 code")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return out;

  const header = rows[headerRow];
  const sa2Col = header.findIndex((h) => norm(h) === "SA2 code");
  const typeCol = header.findIndex((h) => norm(h) === "Region Type");
  const yearCol = new Map<number, number>();
  for (const y of YEARS) {
    const c = header.findIndex((h) => Number(h) === y);
    if (c >= 0) yearCol.set(y, c);
  }

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (typeCol >= 0 && norm(r[typeCol]) !== "SA2") continue;
    const code = norm(r[sa2Col]);
    if (!/^\d{9}$/.test(code)) continue;
    const vals: VifYearMap = {};
    for (const [y, c] of yearCol) {
      const v = Number(r[c]);
      if (Number.isFinite(v)) vals[String(y)] = Math.round(v);
    }
    if (Object.keys(vals).length) out.set(code, vals);
  }
  return out;
}

/** Per-SA2 population + dwelling projections from the VIF2023 SA2 XLSX. */
export function readVifProjections(path: string): Map<string, VifRecord> {
  const wb = XLSX.readFile(path);
  const pop = readSheet(wb, "Total_Population");
  const dwe = readSheet(wb, "Total_Dwellings");
  const out = new Map<string, VifRecord>();
  for (const code of new Set([...pop.keys(), ...dwe.keys()])) {
    out.set(code, { population: pop.get(code) ?? {}, dwellings: dwe.get(code) ?? {} });
  }
  return out;
}
