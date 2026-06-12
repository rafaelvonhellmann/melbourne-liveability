import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import {
  classifyActOffence,
  parseActCrimeWorkbook,
  applyActCrimeToPlaces,
} from "../scripts/lib/act-crime";
import type { CrosswalkFile } from "../lib/crosswalk-types";

/** In-memory workbook mirroring the real dataACT layout (no network). */
function fixtureWorkbook(): XLSX.WorkBook {
  const q = ["", "2024 Q3 Jul-Sep", "2024 Q4 Oct-Dec", "2025 Q1 Jan-Mar", "2025 Q2 Apr-Jun"];
  const old = ["", "2024 Q2 Apr-Jun", ...q.slice(1)]; // 5 quarters: oldest must be dropped
  const aoa = [
    ["Gungahlin - Offences and other activities by Suburb"],
    ["PROMIS as at 7 July 2025"],
    [],
    ["Burglary dwellings"],
    old,
    ["FRANKLIN", 99, 1, 2, 3, 4], // 99 is outside the latest 4 quarters
    ["BONNER", 99, 0, 0, 1, 0],
    ["Total", 99, 1, 2, 4, 4],
    [],
    ["Assault - FV"],
    q,
    ["FRANKLIN", 2, 0, 1, 1],
    [],
    ["TINs Speeding"], // must be ignored
    q,
    ["FRANKLIN", 500, 500, 500, 500],
    [],
    ["Other offences"], // catch-all, must be ignored
    q,
    ["FRANKLIN", 7, 7, 7, 7],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Gungahlin");
  return wb;
}

describe("classifyActOffence", () => {
  it("maps offence blocks to property/violent and ignores the rest", () => {
    expect(classifyActOffence("Homicide")).toBe("violent");
    expect(classifyActOffence("Assault - FV")).toBe("violent");
    expect(classifyActOffence("Assault - Non-FV")).toBe("violent");
    expect(classifyActOffence("Sexual Assault")).toBe("violent");
    expect(classifyActOffence("Other offences against a person")).toBe("violent");
    expect(classifyActOffence("Robbery - armed")).toBe("violent");
    expect(classifyActOffence("Burglary dwellings")).toBe("property");
    expect(classifyActOffence("Motor vehicle theft")).toBe("property");
    expect(classifyActOffence("Theft (excluding Motor Vehicles)")).toBe("property");
    expect(classifyActOffence("Property damage")).toBe("property");
    // Deliberately excluded blocks
    expect(classifyActOffence("Other offences")).toBeNull();
    expect(classifyActOffence("TINs Speeding")).toBeNull();
    expect(classifyActOffence("CINs")).toBeNull();
    // Sheet preamble rows are never offence blocks
    expect(classifyActOffence("Gungahlin - Offences and other activities by Suburb")).toBeNull();
    expect(classifyActOffence("PROMIS as at 7 July 2025")).toBeNull();
  });
});

describe("parseActCrimeWorkbook", () => {
  it("sums the LATEST FOUR quarters per suburb, keyed by normalized name", () => {
    const { counts, latestQuarter } = parseActCrimeWorkbook(fixtureWorkbook());
    // Burglary 1+2+3+4 = 10 (the 99 in the dropped fifth-oldest quarter is excluded)
    expect(counts.get("franklin")).toEqual({ property: 10, violent: 4 });
    expect(counts.get("bonner")).toEqual({ property: 1, violent: 0 });
    expect(counts.has("total")).toBe(false);
    expect(latestQuarter).toBe("2025 Q2 Apr-Jun");
  });

  it("throws when no offence block is recognisable (reshaped edition)", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Something else"], ["No quarters here"]]),
      "Sheet1"
    );
    expect(() => parseActCrimeWorkbook(wb)).toThrow(/no offence blocks/i);
  });
});

describe("applyActCrimeToPlaces", () => {
  const cw = {
    region: "canberra",
    generatedAt: "",
    suburbToSa2: {},
    suburbAliases: {},
    sa2ToSuburb: {
      "801041039": {
        sa2Code: "801041039",
        sa2Name: "Franklin",
        // Real crosswalk uses ABS SAL names like "Franklin (ACT)" - the join
        // must strip the parenthetical and match case-insensitively.
        suburbs: [
          { suburb: "Franklin (ACT)", salCode: "80058", lga: "Unincorporated ACT", weight: 1, method: "area-weighted" as const },
        ],
      },
      "801041099": {
        sa2Code: "801041099",
        sa2Name: "Split",
        suburbs: [
          { suburb: "Franklin (ACT)", salCode: "80058", lga: "Unincorporated ACT", weight: 0.5, method: "area-weighted" as const },
          { suburb: "Bonner", salCode: "80018", lga: "Unincorporated ACT", weight: 0.5, method: "area-weighted" as const },
        ],
      },
      "801099999": {
        sa2Code: "801099999",
        sa2Name: "Nowhere",
        suburbs: [
          { suburb: "Uncharted", salCode: "80999", lga: "Unincorporated ACT", weight: 1, method: "area-weighted" as const },
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

  it("computes crosswalk-weighted rates per 100k and tags the method", () => {
    const counts = parseActCrimeWorkbook(fixtureWorkbook()).counts;
    const direct = place("801041039", 5000);
    const split = place("801041099", 2000);
    const miss = place("801099999", 1000);
    const stats = applyActCrimeToPlaces([direct, split, miss], cw, counts);

    expect(stats).toEqual({ matched: 2, unmatched: 1 });
    // Franklin: property 10, violent 4 over pop 5000 -> 200 / 80 per 100k
    expect(direct.propertyCrimeRate).toBeCloseTo(200, 10);
    expect(direct.violentCrimeRate).toBeCloseTo(80, 10);
    expect(direct.crimeMethod).toBe("area-weighted");
    // Split: 0.5*10 + 0.5*1 = 5.5 property, 0.5*4 = 2 violent over pop 2000
    expect(split.propertyCrimeRate).toBeCloseTo((5.5 / 2000) * 100000, 10);
    expect(split.violentCrimeRate).toBeCloseTo((2 / 2000) * 100000, 10);
    // No suburb match -> untouched (safety stays unscored for this SA2)
    expect(miss.propertyCrimeRate).toBeNull();
    expect(miss.violentCrimeRate).toBeNull();
    expect(miss.crimeMethod).toBeNull();
  });
});
