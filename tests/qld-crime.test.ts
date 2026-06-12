import { describe, it, expect } from "vitest";
import {
  applyQldCrimeToPlaces,
  classifyQldOffence,
  normalizeQldLgaName,
  parseQldCrimeCsv,
  qldMonthRank,
} from "../scripts/lib/qld-crime";
import type { CrosswalkFile } from "../lib/crosswalk-types";

/**
 * In-memory CSV mirroring the real QPS LGA_Reported_Offences_Rates.csv layout
 * (no network): quoted headers, one row per LGA per month, per-category
 * columns PLUS the division rollups. "Assault" deliberately disagrees with
 * the person rollup so a parser summing per-category columns (double
 * counting) fails the assertions.
 */
function fixtureCsv(): string {
  const header =
    '"LGA Name","Month Year","Assault","Offences Against the Person",' +
    '"Unlawful Entry","Offences Against Property","Drug Offences","Other Offences"';
  const months = [
    "MAY25", // 13th-oldest: must be dropped from a JUN25..MAY26 window
    "JUN25", "JUL25", "AUG25", "SEP25", "OCT25", "NOV25", "DEC25",
    "JAN26", "FEB26", "MAR26", "APR26", "MAY26",
  ];
  const lines = [header];
  for (const m of months) {
    const inWindow = m !== "MAY25";
    // BCC: person 10/month, property 40/month inside the window; the dropped
    // month carries huge values that would corrupt any 13-month sum.
    lines.push(
      `"Brisbane City Council","${m}",4,${inWindow ? 10 : 9999},7,${inWindow ? 40 : 9999},3,50`
    );
    // Scenic Rim: person 2/month, property 6/month (full 13 rows as well).
    lines.push(
      `"Scenic Rim Regional Council","${m}",1,${inWindow ? 2 : 9999},2,${inWindow ? 6 : 9999},1,9`
    );
  }
  return lines.join("\n") + "\n";
}

describe("classifyQldOffence", () => {
  it("consumes ONLY the division rollups (sub-columns double-count)", () => {
    expect(classifyQldOffence("Offences Against the Person")).toBe("violent");
    expect(classifyQldOffence("Offences Against Property")).toBe("property");
    // Per-category columns are partial duplicates of the rollups - ignored.
    expect(classifyQldOffence("Assault")).toBeNull();
    expect(classifyQldOffence("Common Assault'")).toBeNull();
    expect(classifyQldOffence("Robbery")).toBeNull();
    expect(classifyQldOffence("Unlawful Entry")).toBeNull();
    expect(classifyQldOffence("Other Theft (excl. Unlawful Entry)")).toBeNull();
    // The excluded third division and its members.
    expect(classifyQldOffence("Other Offences")).toBeNull();
    expect(classifyQldOffence("Drug Offences")).toBeNull();
    expect(classifyQldOffence("Traffic and Related Offences")).toBeNull();
    expect(classifyQldOffence("Breach Domestic Violence Protection Order")).toBeNull();
    expect(classifyQldOffence("Weapons Act Offences")).toBeNull();
    // Non-offence columns.
    expect(classifyQldOffence("LGA Name")).toBeNull();
    expect(classifyQldOffence("Month Year")).toBeNull();
  });
});

describe("normalizeQldLgaName", () => {
  it("collapses QPS council names onto the crosswalk's ABS-style keys", () => {
    expect(normalizeQldLgaName("Brisbane City Council")).toBe("brisbane");
    expect(normalizeQldLgaName("Moreton Bay City Council")).toBe("moreton bay");
    expect(normalizeQldLgaName("Scenic Rim Regional Council")).toBe("scenic rim");
    expect(normalizeQldLgaName("Lockyer Valley Regional Council")).toBe("lockyer valley");
    expect(normalizeQldLgaName("Noosa Shire Council")).toBe("noosa");
    expect(normalizeQldLgaName("Weipa (T)")).toBe("weipa");
    // Crosswalk side (already suffix-free) maps to the same keys.
    expect(normalizeQldLgaName("Brisbane")).toBe("brisbane");
    expect(normalizeQldLgaName("Moreton Bay")).toBe("moreton bay");
  });
});

describe("qldMonthRank", () => {
  it('orders "MMMYY" labels with the 97 pivot (QPS series start JUL97)', () => {
    expect(qldMonthRank("MAY26")! - qldMonthRank("APR26")!).toBe(1);
    expect(qldMonthRank("JAN26")! - qldMonthRank("DEC25")!).toBe(1);
    expect(qldMonthRank("JUL97")!).toBeLessThan(qldMonthRank("JAN01")!);
    expect(qldMonthRank("not a month")).toBeNull();
    expect(qldMonthRank("XXX26")).toBeNull();
  });
});

describe("parseQldCrimeCsv", () => {
  it("sums the LATEST TWELVE monthly rates per LGA, rollup columns only", () => {
    const { rates, latestMonth, monthsUsed } = parseQldCrimeCsv(fixtureCsv());
    expect(latestMonth).toBe("MAY26");
    expect(monthsUsed).toBe(12);
    // 12 months x (violent 10, property 40); the MAY25 9999s are excluded.
    expect(rates.get("brisbane")).toEqual({ property: 480, violent: 120 });
    expect(rates.get("scenic rim")).toEqual({ property: 72, violent: 24 });
  });

  it("throws when the division rollup columns are missing (reshaped export)", () => {
    const csv =
      '"LGA Name","Month Year","Assault","Unlawful Entry"\n' +
      '"Brisbane City Council","MAY26",4,7\n';
    expect(() => parseQldCrimeCsv(csv)).toThrow(/rollup columns not found/i);
  });

  it("throws when no Month Year label parses (reshaped export)", () => {
    const csv =
      '"LGA Name","Month Year","Offences Against the Person","Offences Against Property"\n' +
      '"Brisbane City Council","May 2026",10,40\n';
    expect(() => parseQldCrimeCsv(csv)).toThrow(/month year/i);
  });
});

describe("applyQldCrimeToPlaces", () => {
  const cw = {
    region: "brisbane",
    generatedAt: "",
    suburbToSa2: {},
    suburbAliases: {},
    sa2ToSuburb: {
      // Fully inside Brisbane City Council.
      "301011001": {
        sa2Code: "301011001",
        sa2Name: "Alexandra Hills",
        suburbs: [
          { suburb: "Alexandra Hills", salCode: "30009", lga: "Brisbane", weight: 1, method: "population-weighted" as const },
        ],
      },
      // Straddles Brisbane (0.75) / Scenic Rim (0.25).
      "301011002": {
        sa2Code: "301011002",
        sa2Name: "Border",
        suburbs: [
          { suburb: "Suburb A", salCode: "30010", lga: "Brisbane", weight: 0.75, method: "area-weighted" as const },
          { suburb: "Suburb B", salCode: "30011", lga: "Scenic Rim", weight: 0.25, method: "area-weighted" as const },
        ],
      },
      // Half the weight has no usable LGA - the matched half must not be diluted.
      "301011003": {
        sa2Code: "301011003",
        sa2Name: "PartUnknown",
        suburbs: [
          { suburb: "Suburb C", salCode: "30012", lga: "Brisbane", weight: 0.5, method: "area-weighted" as const },
          { suburb: "Suburb D", salCode: "30013", lga: "Unknown", weight: 0.5, method: "area-weighted" as const },
        ],
      },
      // No overlapping LGA in the QPS data at all.
      "301011004": {
        sa2Code: "301011004",
        sa2Name: "Nowhere",
        suburbs: [
          { suburb: "Suburb E", salCode: "30014", lga: "Unknown", weight: 1, method: "area-weighted" as const },
        ],
      },
    },
  } satisfies CrosswalkFile;

  function place(code: string) {
    return {
      sa2Code: code,
      propertyCrimeRate: null as number | null,
      violentCrimeRate: null as number | null,
      crimeMethod: null as "direct" | "population-weighted" | "area-weighted" | null,
    };
  }

  it("assigns LGA rates as-is (already per 100k ERP) with crosswalk-weighted blending", () => {
    const { rates } = parseQldCrimeCsv(fixtureCsv());
    const direct = place("301011001");
    const split = place("301011002");
    const partial = place("301011003");
    const miss = place("301011004");
    const stats = applyQldCrimeToPlaces([direct, split, partial, miss], cw, rates);

    expect(stats).toEqual({ matched: 3, unmatched: 1 });
    // Single LGA: the LGA's annual rate verbatim - no population division.
    expect(direct.propertyCrimeRate).toBeCloseTo(480, 10);
    expect(direct.violentCrimeRate).toBeCloseTo(120, 10);
    expect(direct.crimeMethod).toBe("direct");
    // Straddler: weighted mean of the two LGAs' rates.
    expect(split.propertyCrimeRate).toBeCloseTo(0.75 * 480 + 0.25 * 72, 10);
    expect(split.violentCrimeRate).toBeCloseTo(0.75 * 120 + 0.25 * 24, 10);
    // Renormalized over MATCHED weight: the Unknown half does not halve the rate.
    expect(partial.propertyCrimeRate).toBeCloseTo(480, 10);
    expect(partial.violentCrimeRate).toBeCloseTo(120, 10);
    // No match -> untouched (safety stays unscored for this SA2).
    expect(miss.propertyCrimeRate).toBeNull();
    expect(miss.violentCrimeRate).toBeNull();
    expect(miss.crimeMethod).toBeNull();
  });
});
