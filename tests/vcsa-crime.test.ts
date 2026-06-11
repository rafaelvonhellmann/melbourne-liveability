import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import {
  assertXlsxFile,
  findCrimeSheet,
  findHeaderRow,
  parseLgaCrimeTable02,
  parseSuburbCrimeTable03,
  pickLgaOffencesXlsx,
  sheetRecords,
  yearEndingRank,
  LGA_CRIME_LABELS,
  SUBURB_CRIME_LABELS,
} from "../scripts/lib/vcsa-crime";
import { suburbLgaKey } from "../lib/suburb-normalize";

/* ------------------------------------------------------------------ *
 * CKAN resource selection
 * ------------------------------------------------------------------ */

// Verbatim subset of the LIVE package_show metadata (2026-06): display names
// renamed to "Recorded offences by LGA - ...", format strings ".xlsx" and the
// "xlsl" typo. The June 2026 rename is what broke the old /LGA.*Recorded/
// display-name filter (refresh run 27280836153).
const LIVE_RESOURCES = [
  {
    name: "Recorded offences - Year ending Dec 2025",
    format: ".xlsx",
    url: "https://files.crimestatistics.vic.gov.au/2026-03/Data_Tables_Recorded_Offences_Visualisation_Year_Ending_December_2025.xlsx",
  },
  {
    name: "Recorded offences by LGA - Year Ending Sep 2025",
    format: ".xlsx",
    url: "https://files.crimestatistics.vic.gov.au/2025-12/Data_Tables_LGA_Recorded_Offences_Year_Ending_September_2025.xlsx",
  },
  {
    name: "Recorded offences by LGA - Year Ending Jun 2024",
    format: "xlsl", // live typo - matched via the .xlsx URL instead
    url: "https://files.crimestatistics.vic.gov.au/2024-09/Data_Tables_LGA_Recorded_Offences_Year_Ending_June_2024.xlsx",
  },
  {
    name: "LGA - Year Ending Dec 2023", // no "offences" in the name - URL carries it
    format: "XLSX",
    url: "https://files.crimestatistics.vic.gov.au/2024-03/Data_Tables_LGA_Recorded_Offences_Year_Ending_December_2023.xlsx",
  },
  {
    name: "Recorded offences by LGA - Year Ending Dec 2025",
    format: ".xlsx",
    url: "https://files.crimestatistics.vic.gov.au/2026-03/Data_Tables_LGA_Recorded_Offences_Year_Ending_December_2025.xlsx",
  },
];

describe("pickLgaOffencesXlsx", () => {
  it("picks the LATEST LGA edition by parsed date, not name order", () => {
    // localeCompare name-sort would pick "Sep 2025" over "Dec 2025".
    const pick = pickLgaOffencesXlsx(LIVE_RESOURCES);
    expect(pick?.url).toContain("LGA_Recorded_Offences_Year_Ending_December_2025");
  });

  it("never picks the non-LGA Visualisation workbook", () => {
    const pick = pickLgaOffencesXlsx(
      LIVE_RESOURCES.filter((r) => !/lga/i.test(r.name))
    );
    expect(pick).toBeNull();
  });

  it("matches via URL when the display name loses its keywords", () => {
    const pick = pickLgaOffencesXlsx([
      {
        name: "Data tables", // worst-case rename
        format: "",
        url: "https://files.example/Data_Tables_LGA_Recorded_Offences_Year_Ending_March_2026.xlsx",
      },
    ]);
    expect(pick?.url).toContain("March_2026");
  });

  it("tolerates the 'xlsl' format typo via the .xlsx URL", () => {
    const pick = pickLgaOffencesXlsx([LIVE_RESOURCES[2]]);
    expect(pick?.url).toContain("June_2024");
  });

  it("returns null for an empty resource list", () => {
    expect(pickLgaOffencesXlsx([])).toBeNull();
  });
});

describe("yearEndingRank", () => {
  it("ranks quarter editions chronologically", () => {
    const sep25 = yearEndingRank("Recorded offences by LGA - Year Ending Sep 2025")!;
    const dec25 = yearEndingRank("Recorded offences by LGA - Year Ending Dec 2025")!;
    const mar26 = yearEndingRank("Recorded offences by LGA - Year Ending Mar 2026")!;
    expect(dec25).toBeGreaterThan(sep25);
    expect(mar26).toBeGreaterThan(dec25);
  });

  it("reads underscore download-filename dates", () => {
    expect(yearEndingRank("Data_Tables_LGA_Recorded_Offences_Year_Ending_September_2025.xlsx")).toBe(202509);
    expect(yearEndingRank("...Year_Ending_December_2023.xlsx")).toBe(202312);
  });

  it("falls back to a bare year and to null", () => {
    expect(yearEndingRank("LGA offences 2024 edition")).toBe(202400);
    expect(yearEndingRank("LGA offences, no date")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Shape-tolerant sheet parsing
 * ------------------------------------------------------------------ */

const T03_HEADER = [
  "Year",
  "Year ending",
  "Local Government Area",
  "Postcode",
  "Suburb/Town Name",
  "Offence Division",
  "Offence Subdivision",
  "Offence Subgroup",
  "Offence Count",
];

function t03Sheet(preamble: unknown[][] = []) {
  return XLSX.utils.aoa_to_sheet([
    ...preamble,
    T03_HEADER,
    [2024, "December", "Yarra", 3065, "Fitzroy", "B Property and deception offences", "B40", "B42", 50],
    [2025, "December", "Yarra", 3065, "Fitzroy", "B Property and deception offences", "B40", "B42", 7],
    [2025, "December", "Yarra", 3065, "Fitzroy", "A Crimes against the person", "A20", "A211", 3],
    [2025, "December", "Melbourne", 3000, "Carlton", "C Drug offences", "C30", "C32", 9],
  ]);
}

const T02_HEADER = [
  "Year",
  "Year ending",
  "Police Service Area",
  "Local Government Area",
  "Offence Division",
  "Offence Subdivision",
  "Offence Subgroup",
  "Offence Count",
  "PSA Rate per 100,000 population",
  "LGA Rate per 100,000 population",
];

function t02Sheet() {
  return XLSX.utils.aoa_to_sheet([
    T02_HEADER,
    [2024, "December", "Yarra", "Yarra", "B Property and deception offences", "B40", "B42", 1000, 1, 1],
    [2025, "December", "Yarra", "Yarra", "B Property and deception offences", "B40", "B42", 120, 1, 1],
    [2025, "December", "Yarra", "Yarra", "A Crimes against the person", "A20", "A212", 30, 1, 1],
  ]);
}

describe("findHeaderRow / sheetRecords", () => {
  it("locates a header behind preamble rows and trims padded labels", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Recorded offences", "", ""],
      [],
      [" Year ", "Local Government Area", "Offence Division", "Offence Count "],
      [2025, "Yarra", "A Crimes against the person", 3],
    ]);
    expect(findHeaderRow(sheet, LGA_CRIME_LABELS)).toBe(2);
    const rows = sheetRecords(sheet, LGA_CRIME_LABELS);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Offence Count"]).toBe(3);
  });

  it("throws with the missing labels when no row qualifies", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["totally", "different", "columns"]]);
    expect(() => sheetRecords(sheet, LGA_CRIME_LABELS)).toThrow(/header row not found/);
  });
});

describe("findCrimeSheet", () => {
  it("prefers the documented Table names", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, t02Sheet(), "Table 02");
    XLSX.utils.book_append_sheet(wb, t03Sheet(), "Table 03");
    // Table 03's header is a superset of the LGA labels - forbidden column
    // keeps the LGA lookup off the suburb sheet even if names vanish.
    const lga = findCrimeSheet(wb, /^Table 02/i, LGA_CRIME_LABELS, ["Suburb/Town Name"]);
    expect(lga).toBe(wb.Sheets["Table 02"]);
    const suburb = findCrimeSheet(wb, /^Table 03/i, SUBURB_CRIME_LABELS);
    expect(suburb).toBe(wb.Sheets["Table 03"]);
  });

  it("falls back to a content scan when sheets are renamed", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, t03Sheet(), "Suburb data");
    XLSX.utils.book_append_sheet(wb, t02Sheet(), "LGA data");
    expect(findCrimeSheet(wb, /^Table 03/i, SUBURB_CRIME_LABELS)).toBe(wb.Sheets["Suburb data"]);
    expect(
      findCrimeSheet(wb, /^Table 02/i, LGA_CRIME_LABELS, ["Suburb/Town Name"])
    ).toBe(wb.Sheets["LGA data"]);
    expect(findCrimeSheet(wb, /^Table 02/i, ["No Such Column"])).toBeNull();
  });
});

describe("parseSuburbCrimeTable03", () => {
  it("keeps only the latest year and classifies divisions", () => {
    const out = parseSuburbCrimeTable03(t03Sheet());
    const fitzroy = out.get(suburbLgaKey("Fitzroy", "Yarra"));
    // 2024's 50 must be excluded; C drug offences are neither bucket.
    expect(fitzroy).toEqual({ property: 7, violent: 3 });
    expect(out.has(suburbLgaKey("Carlton", "Melbourne"))).toBe(false);
  });

  it("parses identically with preamble rows above the header", () => {
    const out = parseSuburbCrimeTable03(t03Sheet([["Table 03", ""], []]));
    expect(out.get(suburbLgaKey("Fitzroy", "Yarra"))).toEqual({ property: 7, violent: 3 });
  });
});

describe("parseLgaCrimeTable02", () => {
  it("sums ONLY the latest year (regression: used to sum the whole decade)", () => {
    const { property, violent } = parseLgaCrimeTable02(t02Sheet());
    expect(property.get("Yarra")).toBe(120); // not 1120
    expect(violent.get("Yarra")).toBe(30);
  });
});

describe("assertXlsxFile", () => {
  it("accepts a zip-magic file and rejects an HTML page", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "vcsa-"));
    const ok = path.join(dir, "ok.xlsx");
    const bad = path.join(dir, "bad.xlsx");
    await writeFile(ok, Buffer.from("PKrest-of-zip", "latin1"));
    await writeFile(bad, "<!DOCTYPE html><html>blocked</html>");
    await expect(assertXlsxFile(ok)).resolves.toBeUndefined();
    await expect(assertXlsxFile(bad)).rejects.toThrow(/not an XLSX/);
  });
});
