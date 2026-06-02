import XLSX from "xlsx";
import { suburbLgaKey, normalizeLgaName } from "../../lib/suburb-normalize.js";
import type { CrosswalkFile } from "../../lib/crosswalk-types.js";

export type CrimeCounts = { property: number; violent: number };

function classifyOffence(offence: string): "property" | "violent" | null {
  const o = offence.toLowerCase();
  if (/^b\s|property|deception|theft|burglary|damage|steal/i.test(o)) return "property";
  if (/^a\s|person|assault|robbery|sexual|violent|homicide/i.test(o)) return "violent";
  return null;
}

/** Table 03: suburb/postcode offence counts (latest year in sheet). */
export function parseSuburbCrimeTable03(
  sheet: XLSX.WorkSheet
): Map<string, CrimeCounts> {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  let maxYear = 0;
  for (const row of rows) {
    const y = Number(row.Year);
    if (Number.isFinite(y) && y > maxYear) maxYear = y;
  }

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

/** Table 02: LGA-level fallback. */
export function parseLgaCrimeTable02(
  sheet: XLSX.WorkSheet
): { property: Map<string, number>; violent: Map<string, number> } {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const property = new Map<string, number>();
  const violent = new Map<string, number>();
  for (const row of rows) {
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
