import { describe, it, expect } from "vitest";
import {
  applyWaCrimeToPlaces,
  classifyWaOffence,
  decodeDsrRows,
  parseWaCrimeCsv,
  waMonthRank,
} from "../scripts/lib/wa-crime";
import type { CrosswalkFile } from "../lib/crosswalk-types";

/**
 * In-memory CSV mirroring the combined artifact fetchWaCrime assembles from its
 * per-month cache: Suburb, Offence Category, Month, Offences. 13 distinct months
 * so the oldest must drop from the rolling 12-month window; that dropped month
 * carries huge values that would corrupt any 13-month sum. The excluded WA
 * rollups ("Detected Offences", "Miscellaneous Offences") also carry huge values
 * that must never reach the property/violent counts.
 */
function fixtureCsv(): string {
  const months = [
    "2025-02", // 13th-oldest: dropped from a 2025-03..2026-03 window
    "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08",
    "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
  ];
  const lines = ["Suburb,Offence Category,Month,Offences"];
  const add = (sub: string, cat: string, perMonth: number) => {
    for (const m of months) {
      // The dropped Feb-2025 month carries a poison value for in-window suburbs.
      const v = m === "2025-02" ? 9999 : perMonth;
      lines.push(`${sub},${cat},${m},${v}`);
    }
  };
  // PERTH: 10 property + 3 violent per in-window month -> 120 property, 36 violent.
  add("PERTH", "Selected Offences Against Property", 10);
  add("PERTH", "Selected Offences Against the Person", 3);
  // Excluded rollups with huge values that must be ignored.
  add("PERTH", "Detected Offences", 500);
  add("PERTH", "Miscellaneous Offences", 500);
  // FREMANTLE: a locality that joins through a split SA2.
  add("FREMANTLE", "Selected Offences Against Property", 4);
  add("FREMANTLE", "Selected Offences Against the Person", 1);
  return lines.join("\n") + "\n";
}

describe("classifyWaOffence", () => {
  it("maps the WA rollups to property/violent and ignores the rest", () => {
    expect(classifyWaOffence("Selected Offences Against the Person")).toBe("violent");
    expect(classifyWaOffence("Selected Offences Against Property")).toBe("property");
    // case / whitespace insensitive
    expect(classifyWaOffence("  selected offences against property  ")).toBe("property");
    // Deliberately excluded WA rollups (police-detected + catch-all).
    expect(classifyWaOffence("Detected Offences")).toBeNull();
    expect(classifyWaOffence("Miscellaneous Offences")).toBeNull();
    // Offence TYPES (members of a rollup) are never the rollup itself.
    expect(classifyWaOffence("Assault (Family)")).toBeNull();
    expect(classifyWaOffence("Stealing")).toBeNull();
    expect(classifyWaOffence("Suburb")).toBeNull();
  });
});

describe("waMonthRank", () => {
  it('orders "YYYY-MM" labels and rejects everything else', () => {
    expect(waMonthRank("2025-04")! - waMonthRank("2025-03")!).toBe(1);
    expect(waMonthRank("2026-01")! - waMonthRank("2025-12")!).toBe(1);
    expect(waMonthRank("2016-07")!).toBeLessThan(waMonthRank("2026-03")!);
    expect(waMonthRank("2025-13")).toBeNull(); // no month 13
    expect(waMonthRank("Mar 2025")).toBeNull(); // not the WA format
    expect(waMonthRank("Suburb")).toBeNull();
  });
});

describe("parseWaCrimeCsv", () => {
  it("sums the LATEST TWELVE months per locality, classified rollups only", () => {
    const { bySuburb, latestMonth, monthsUsed } = parseWaCrimeCsv(fixtureCsv());
    expect(latestMonth).toBe("2026-03");
    expect(monthsUsed).toBe(12);
    // 12 x 10 property, 12 x 3 violent; the 2025-02 9999s and the excluded
    // rollups' 500s never reach the counts.
    expect(bySuburb.get("perth")).toEqual({ property: 120, violent: 36 });
    expect(bySuburb.get("fremantle")).toEqual({ property: 48, violent: 12 });
  });

  it("throws when the identifier columns are missing (reshaped export)", () => {
    const csv = "Locality,Category,Period,Count\nPERTH,X,2026-03,1\n";
    expect(() => parseWaCrimeCsv(csv)).toThrow(/identifier columns/i);
  });

  it("throws when no month parses (reshaped export)", () => {
    const csv =
      "Suburb,Offence Category,Month,Offences\n" +
      "PERTH,Selected Offences Against Property,2026Q1,1\n";
    expect(() => parseWaCrimeCsv(csv)).toThrow(/month/i);
  });

  it("throws when nothing classifies (wholesale rollup relabel)", () => {
    const csv =
      "Suburb,Offence Category,Month,Offences\n" +
      "PERTH,Renamed Rollup,2026-03,1\n";
    expect(() => parseWaCrimeCsv(csv)).toThrow(/no locality rows classified/i);
  });
});

describe("applyWaCrimeToPlaces", () => {
  const cw = {
    region: "perth",
    generatedAt: "",
    suburbToSa2: {},
    suburbAliases: {},
    sa2ToSuburb: {
      // Whole locality inside one SA2.
      "510011263": {
        sa2Code: "510011263",
        sa2Name: "Perth City",
        suburbs: [
          { suburb: "Perth", salCode: "50001", lga: "Perth", weight: 1, method: "population-weighted" as const },
        ],
      },
      // Split SA2: half Perth, half Fremantle.
      "510011264": {
        sa2Code: "510011264",
        sa2Name: "Split",
        suburbs: [
          { suburb: "Perth", salCode: "50001", lga: "Perth", weight: 0.5, method: "area-weighted" as const },
          { suburb: "Fremantle", salCode: "50002", lga: "Fremantle", weight: 0.5, method: "area-weighted" as const },
        ],
      },
      // Locality absent from the crime data -> stays unmatched (unscored).
      "510011265": {
        sa2Code: "510011265",
        sa2Name: "Nowhere",
        suburbs: [
          { suburb: "Nowhere", salCode: "50003", lga: "Perth", weight: 1, method: "area-weighted" as const },
        ],
      },
    },
  } satisfies CrosswalkFile;

  function place(code: string, pop: number | null) {
    return {
      sa2Code: code,
      population: pop,
      propertyCrimeRate: null as number | null,
      violentCrimeRate: null as number | null,
      crimeMethod: null as "direct" | "population-weighted" | "area-weighted" | null,
    };
  }

  it("computes crosswalk-weighted rates per 100k ERP by bare locality name", () => {
    const parsed = parseWaCrimeCsv(fixtureCsv());
    const perth = place("510011263", 12000);
    const split = place("510011264", 1000);
    const miss = place("510011265", 5000);
    const stats = applyWaCrimeToPlaces([perth, split, miss], cw, parsed);

    expect(stats).toEqual({ matched: 2, unmatched: 1 });
    // Perth: property 120, violent 36 over pop 12000 -> 1000 / 300 per 100k.
    expect(perth.propertyCrimeRate).toBeCloseTo(1000, 10);
    expect(perth.violentCrimeRate).toBeCloseTo(300, 10);
    expect(perth.crimeMethod).toBe("population-weighted");
    // Split: 0.5*120 + 0.5*48 = 84 property, 0.5*36 + 0.5*12 = 24 violent / 1000.
    expect(split.propertyCrimeRate).toBeCloseTo(8400, 10);
    expect(split.violentCrimeRate).toBeCloseTo(2400, 10);
    expect(split.crimeMethod).toBe("area-weighted");
    // Missing locality -> untouched (safety stays unscored).
    expect(miss.propertyCrimeRate).toBeNull();
    expect(miss.violentCrimeRate).toBeNull();
    expect(miss.crimeMethod).toBeNull();
  });
});

describe("decodeDsrRows", () => {
  it("expands Power BI's dictionary + repeat-bitmask encoding (real sample)", () => {
    // Verbatim first 8 rows of a live /public/reports/querydata response
    // (locality x offence-category x summed offences for one month).
    const ds = {
      ValueDicts: {
        D0: ["", "ABBA RIVER", "ABBEY"],
        D1: [
          "Selected Offences Against the Person",
          "Selected Offences Against Property",
          "Detected Offences",
          "Miscellaneous Offences",
        ],
      },
      PH: [
        {
          DM0: [
            { S: [{ N: "G0", T: 1, DN: "D0" }, { N: "G1", T: 1, DN: "D1" }, { N: "M0", T: 4 }], C: [0, 0, 12] },
            { C: [1, 47], R: 1 },
            { C: [2, 24], R: 1 },
            { C: [3, 6], R: 1 },
            { C: [1, 0, 1] },
            { C: [2, 4], R: 2 },
            { C: [1, 1], R: 1 },
            { C: [3], R: 5 },
          ],
        },
      ],
    };
    expect(decodeDsrRows(ds)).toEqual([
      ["", "Selected Offences Against the Person", 12],
      ["", "Selected Offences Against Property", 47],
      ["", "Detected Offences", 24],
      ["", "Miscellaneous Offences", 6],
      ["ABBA RIVER", "Selected Offences Against the Person", 1],
      ["ABBEY", "Selected Offences Against the Person", 4],
      ["ABBEY", "Selected Offences Against Property", 1],
      ["ABBEY", "Miscellaneous Offences", 1],
    ]);
  });

  it("honours the null bitmask (Ø) and returns [] for an empty window", () => {
    const ds = {
      ValueDicts: { D0: ["PERTH"] },
      PH: [
        {
          DM0: [
            { S: [{ N: "G0", T: 1, DN: "D0" }, { N: "M0", T: 4 }], C: [0, 5] },
            { R: 1, "Ø": 2 }, // col0 repeats "PERTH", col1 null (no C values)
          ],
        },
      ],
    };
    expect(decodeDsrRows(ds)).toEqual([
      ["PERTH", 5],
      ["PERTH", null],
    ]);
    expect(decodeDsrRows({ PH: [{ DM0: [] }] })).toEqual([]);
  });

  it("decodes the named-key form (single ordered column, e.g. month list)", () => {
    // Verbatim shape of a /querydata month-list response: values arrive under
    // the select-name key ("G0") rather than in a C array.
    const ds = {
      PH: [
        {
          DM0: [
            { S: [{ N: "G0", T: 7 }], G0: 1772323200000 },
            { G0: 1769904000000 },
            { G0: 1767225600000 },
          ],
        },
      ],
    };
    expect(decodeDsrRows(ds)).toEqual([
      [1772323200000],
      [1769904000000],
      [1767225600000],
    ]);
  });
});
