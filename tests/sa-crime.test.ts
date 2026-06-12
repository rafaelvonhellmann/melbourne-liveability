import { describe, it, expect } from "vitest";
import {
  applySaCrimeToPlaces,
  classifySaOffence,
  parseSaCrimeCsv,
  pickSaCrimeResources,
  saMonthLabel,
  saMonthRank,
} from "../scripts/lib/sa-crime";
import type { CrosswalkFile } from "../lib/crosswalk-types";

/**
 * In-memory CSV mirroring the real SAPOL layout (no network): one row per
 * Reported Date (daily) x suburb x Offence Level 3, an "Offence count" value
 * column, uppercase suburbs. 13 months of dates (Mar 2025 .. Mar 2026) so the
 * oldest month must be dropped from the rolling 12-month window; the dropped
 * month carries huge values that would corrupt any 13-month sum. Level 2
 * labels intentionally span BOTH naming eras (the 2024-25 "THEFT AND RELATED
 * OFFENCES" vs the 2025-26 "THEFT") - classification keys on Level 1 only.
 * Sexual offences arrive with suburb "NOT DISCLOSED", exactly as SAPOL
 * publishes them.
 */
function fixtureCsv(): string {
  const rows: string[] = [
    "Reported Date,Suburb - Incident,Postcode - Incident,Offence Level 1 Description,Offence Level 2 Description,Offence Level 3 Description,Offence count",
  ];
  // 12 in-window months: Apr 2025 .. Mar 2026 (mid-month days, both eras).
  const window: Array<[string, string]> = [];
  for (let m = 4; m <= 12; m++) window.push([`15/${String(m).padStart(2, "0")}/2025`, m < 7 ? "old" : "new"]);
  for (let m = 1; m <= 3; m++) window.push([`15/${String(m).padStart(2, "0")}/2026`, "new"]);
  for (const [date, era] of window) {
    const theft = era === "old" ? "THEFT AND RELATED OFFENCES" : "THEFT";
    const damage = era === "old" ? "PROPERTY DAMAGE AND ENVIRONMENTAL" : "PROPERTY DAMAGE";
    // Glenelg property: 2/month theft + 1/month damage = 36 over the window.
    rows.push(`${date},GLENELG,5045,OFFENCES AGAINST PROPERTY,${theft},Theft from retail premises,2`);
    rows.push(`${date},GLENELG,5045,OFFENCES AGAINST PROPERTY,${damage},Damage or destroy property,1`);
    // Glenelg violent: 1/month assault = 12.
    rows.push(`${date},GLENELG,5045,OFFENCES AGAINST THE PERSON,ASSAULT,Common assault,1`);
    // Stirling violent: quoted Level 2 with commas (real 2025-26 label).
    rows.push(`${date},STIRLING,5152,OFFENCES AGAINST THE PERSON,"ROBBERY, BLACKMAIL, AND EXTORTION",Robbery,1`);
    // Sexual offences: location withheld by SAPOL - must never join anywhere.
    rows.push(`${date},NOT DISCLOSED,,OFFENCES AGAINST THE PERSON,SEXUAL OFFENCES,Rape,50`);
    // Blank suburb: skipped.
    rows.push(`${date},,5000,OFFENCES AGAINST PROPERTY,${theft},Other theft,50`);
  }
  // 13th-oldest month: must be dropped from the Apr 2025..Mar 2026 window.
  rows.push("15/03/2025,GLENELG,5045,OFFENCES AGAINST PROPERTY,THEFT AND RELATED OFFENCES,Other theft,999");
  rows.push("15/03/2025,STIRLING,5152,OFFENCES AGAINST THE PERSON,ACTS INTENDED TO CAUSE INJURY,Assault,999");
  return rows.join("\n") + "\n";
}

describe("classifySaOffence", () => {
  it("maps the two SAPOL Level 1 divisions and rejects everything else", () => {
    expect(classifySaOffence("OFFENCES AGAINST THE PERSON")).toBe("violent");
    expect(classifySaOffence("OFFENCES AGAINST PROPERTY")).toBe("property");
    expect(classifySaOffence("offences against property")).toBe("property");
    // SAPOL publishes ONLY the two divisions above at suburb level - drug /
    // justice / traffic classes are absent from the dataset, but a renamed
    // or unexpected division must drop out, never misclassify.
    expect(classifySaOffence("DRUG OFFENCES")).toBeNull();
    expect(classifySaOffence("OFFENCES AGAINST JUSTICE PROCEDURES")).toBeNull();
    expect(classifySaOffence("Suburb - Incident")).toBeNull();
    // Level 2 labels are not Level 1 divisions.
    expect(classifySaOffence("THEFT")).toBeNull();
    expect(classifySaOffence("ASSAULT")).toBeNull();
  });
});

describe("saMonthRank / saMonthLabel", () => {
  it('orders "DD/MM/YYYY" dates by month and rejects everything else', () => {
    expect(saMonthRank("01/07/2025")! - saMonthRank("30/06/2025")!).toBe(1);
    expect(saMonthRank("01/01/2026")! - saMonthRank("31/12/2025")!).toBe(1);
    expect(saMonthRank("15/03/2026")).toBe(saMonthRank("01/03/2026"));
    expect(saMonthRank("2026-03-15")).toBeNull(); // ISO dates = reshaped export
    expect(saMonthRank("Reported Date")).toBeNull();
    expect(saMonthRank("15/13/2025")).toBeNull(); // month out of range
    expect(saMonthLabel(saMonthRank("15/03/2026")!)).toBe("Mar 2026");
    expect(saMonthLabel(saMonthRank("01/07/2025")!)).toBe("Jul 2025");
  });
});

describe("pickSaCrimeResources", () => {
  const resources = [
    { name: "Crime Statistics 2025-26 Q1 - Q3", url: "https://x/q123_2025-26.csv", last_modified: "2026-05-28" },
    { name: "Crime Statistics 2024-25", url: "https://x/2024-25.csv", last_modified: "2025-09-18" },
    { name: "Crime Statistics 2023-24", url: "https://x/2023-24.csv", last_modified: "2024-08-18" },
    // The parallel FDV series is a subset of the same incidents - double counting.
    { name: "Family & Domestic Abuse related-offences 2025-26 Q1 - Q3", url: "https://x/fdv.csv", last_modified: "2026-05-28" },
    // 2011-12 is an .xlsx mislabelled CSV in the live catalogue.
    { name: "Crime Statistics 2011-12", url: "https://x/2011-12-data_sa_crime.xlsx", last_modified: "2019-09-18" },
  ];

  it("picks the newest two fiscal-year crime CSVs, newest first", () => {
    expect(pickSaCrimeResources(resources).map((r) => r.name)).toEqual([
      "Crime Statistics 2025-26 Q1 - Q3",
      "Crime Statistics 2024-25",
    ]);
  });

  it("dedupes a replaced in-progress year by last_modified", () => {
    const picked = pickSaCrimeResources([
      ...resources,
      { name: "Crime Statistics 2025-26 Q1", url: "https://x/q1_2025-26.csv", last_modified: "2025-11-01" },
    ]);
    expect(picked[0].name).toBe("Crime Statistics 2025-26 Q1 - Q3");
    expect(picked).toHaveLength(2);
  });

  it("returns empty when nothing matches (fetch throws with diagnostics)", () => {
    expect(pickSaCrimeResources([{ name: "Something else", url: "https://x/a.csv" }])).toEqual([]);
  });
});

describe("parseSaCrimeCsv", () => {
  it("sums the LATEST TWELVE months per suburb across both Level 2 naming eras", () => {
    const { bySuburb, latestMonth, monthsUsed } = parseSaCrimeCsv(fixtureCsv());
    expect(latestMonth).toBe("Mar 2026");
    expect(monthsUsed).toBe(12);
    // 12 x (2 theft + 1 damage) property, 12 x 1 assault violent; the
    // Mar 2025 999s never reach the counts.
    expect(bySuburb.get("glenelg")).toEqual({ property: 36, violent: 12 });
    // Quoted Level 2 with commas parses; classification is by Level 1.
    expect(bySuburb.get("stirling")).toEqual({ property: 0, violent: 12 });
  });

  it('skips withheld locations ("NOT DISCLOSED" sexual offences, blank suburbs)', () => {
    const { bySuburb } = parseSaCrimeCsv(fixtureCsv());
    expect(bySuburb.has("not disclosed")).toBe(false);
    expect(bySuburb.has("")).toBe(false);
  });

  it("throws when the identifier columns are missing (reshaped export)", () => {
    const csv = "Date,Locality,Offence,Count\n01/07/2025,GLENELG,Theft,1\n";
    expect(() => parseSaCrimeCsv(csv)).toThrow(/identifier columns/i);
  });

  it("throws when no Reported Date parses (reshaped export)", () => {
    const csv =
      "Reported Date,Suburb - Incident,Postcode - Incident,Offence Level 1 Description,Offence Level 2 Description,Offence Level 3 Description,Offence count\n" +
      "2025-07-01,GLENELG,5045,OFFENCES AGAINST PROPERTY,THEFT,Other theft,1\n";
    expect(() => parseSaCrimeCsv(csv)).toThrow(/reported date/i);
  });

  it("throws when no row classifies (wholesale Level 1 relabel)", () => {
    const csv =
      "Reported Date,Suburb - Incident,Postcode - Incident,Offence Level 1 Description,Offence Level 2 Description,Offence Level 3 Description,Offence count\n" +
      "01/07/2025,GLENELG,5045,RENAMED DIVISION,THEFT,Other theft,1\n";
    expect(() => parseSaCrimeCsv(csv)).toThrow(/no suburb rows classified/i);
  });
});

describe("applySaCrimeToPlaces", () => {
  const cw = {
    region: "adelaide",
    generatedAt: "",
    suburbToSa2: {},
    suburbAliases: {},
    sa2ToSuburb: {
      // Bare-name suburb, fully inside one SA2.
      "401011001": {
        sa2Code: "401011001",
        sa2Name: "Glenelg",
        suburbs: [
          { suburb: "Glenelg", salCode: "40001", lga: "Holdfast Bay", weight: 1, method: "population-weighted" as const },
        ],
      },
      // ABS cross-state disambiguation suffix: "Stirling (SA)" must still
      // match SAPOL's bare uppercase "STIRLING" via the shared normalizer.
      "401011002": {
        sa2Code: "401011002",
        sa2Name: "Stirling",
        suburbs: [
          { suburb: "Stirling (SA)", salCode: "40002", lga: "Adelaide Hills", weight: 1, method: "area-weighted" as const },
        ],
      },
      // Split SA2 weighting across both suburbs.
      "401011003": {
        sa2Code: "401011003",
        sa2Name: "Split",
        suburbs: [
          { suburb: "Glenelg", salCode: "40001", lga: "Holdfast Bay", weight: 0.5, method: "area-weighted" as const },
          { suburb: "Stirling (SA)", salCode: "40002", lga: "Adelaide Hills", weight: 0.5, method: "area-weighted" as const },
        ],
      },
      // Suburb absent from the counts: stays unmatched / unscored.
      "401011004": {
        sa2Code: "401011004",
        sa2Name: "NoData",
        suburbs: [
          { suburb: "Outer Nowhere", salCode: "40003", lga: "Playford", weight: 1, method: "area-weighted" as const },
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

  it("computes crosswalk-weighted rates per 100k ERP, '(SA)' suffixes stripped", () => {
    const { bySuburb } = parseSaCrimeCsv(fixtureCsv());
    const glenelg = place("401011001", 4000);
    const stirling = place("401011002", 3000);
    const split = place("401011003", 1000);
    const miss = place("401011004", 1000);
    const stats = applySaCrimeToPlaces([glenelg, stirling, split, miss], cw, bySuburb);

    expect(stats).toEqual({ matched: 3, unmatched: 1 });
    // Glenelg: property 36, violent 12 over pop 4000 -> 900 / 300 per 100k.
    expect(glenelg.propertyCrimeRate).toBeCloseTo(900, 10);
    expect(glenelg.violentCrimeRate).toBeCloseTo(300, 10);
    expect(glenelg.crimeMethod).toBe("population-weighted");
    // Stirling (SA) crosswalk name joins SAPOL's bare STIRLING counts.
    expect(stirling.propertyCrimeRate).toBeCloseTo(0, 10);
    expect(stirling.violentCrimeRate).toBeCloseTo((12 / 3000) * 100000, 10);
    expect(stirling.crimeMethod).toBe("area-weighted");
    // Split: 0.5*36 = 18 property, 0.5*12 + 0.5*12 = 12 violent over pop 1000.
    expect(split.propertyCrimeRate).toBeCloseTo(1800, 10);
    expect(split.violentCrimeRate).toBeCloseTo(1200, 10);
    // No counts for the suburb -> untouched (safety stays unscored).
    expect(miss.propertyCrimeRate).toBeNull();
    expect(miss.violentCrimeRate).toBeNull();
    expect(miss.crimeMethod).toBeNull();
  });
});
