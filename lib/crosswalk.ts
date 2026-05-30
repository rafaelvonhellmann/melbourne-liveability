import type { CrosswalkFile } from "./crosswalk-types";
import { WEIGHT_SUM_TOLERANCE } from "./crosswalk-types";

export function validateCrosswalkWeights(cw: CrosswalkFile): {
  valid: boolean;
  failures: { sa2Code: string; sum: number }[];
} {
  const failures: { sa2Code: string; sum: number }[] = [];

  for (const [sa2Code, entry] of Object.entries(cw.sa2ToSuburb)) {
    if (entry.suburbs.length === 0) continue;
    const sum = entry.suburbs.reduce((s, x) => s + x.weight, 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      failures.push({ sa2Code, sum });
    }
  }

  return { valid: failures.length === 0, failures };
}

/** Resolve suburb alias to SA2 codes via inverse crosswalk. */
export function suburbAliasToSa2(
  cw: CrosswalkFile,
  query: string
): { sa2Code: string; weight: number; suburb: string }[] {
  const key = query.toLowerCase().trim();
  const salCodes = cw.suburbAliases[key] ?? [];
  const results: { sa2Code: string; weight: number; suburb: string }[] = [];

  for (const salCode of salCodes) {
    const links = cw.suburbToSa2[salCode] ?? [];
    for (const link of links) {
      const entry = cw.sa2ToSuburb[link.sa2Code];
      const suburb = entry?.suburbs.find((s) => s.salCode === salCode)?.suburb ?? query;
      results.push({ sa2Code: link.sa2Code, weight: link.weight, suburb });
    }
  }

  return results.sort((a, b) => b.weight - a.weight);
}

export function findSa2BySuburbName(
  cw: CrosswalkFile,
  suburbFragment: string
): Sa2CrosswalkHits[] {
  const q = suburbFragment.toLowerCase();
  const hits: Sa2CrosswalkHits[] = [];

  for (const entry of Object.values(cw.sa2ToSuburb)) {
    for (const s of entry.suburbs) {
      if (s.suburb.toLowerCase().includes(q)) {
        hits.push({
          sa2Code: entry.sa2Code,
          sa2Name: entry.sa2Name,
          suburb: s.suburb,
          weight: s.weight,
          lga: s.lga,
        });
      }
    }
  }
  return hits;
}

export type Sa2CrosswalkHits = {
  sa2Code: string;
  sa2Name: string;
  suburb: string;
  weight: number;
  lga: string;
};
