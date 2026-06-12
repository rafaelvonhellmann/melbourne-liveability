import { describe, it, expect } from "vitest";
import {
  applyNswCrimeToPlaces,
  classifyNswOffence,
  nswMonthRank,
  nswSuburbLgaKey,
  parseNswCrimeCsv,
} from "../scripts/lib/nsw-crime";
import type { CrosswalkFile } from "../lib/crosswalk-types";

/**
 * In-memory CSV mirroring the real BOCSAR SuburbData layout (no network):
 * quoted headers, one row per Suburb x Offence category x Subcategory, one
 * column per month. 13 month columns so the oldest must be dropped from the
 * rolling 12-month window; the dropped month carries huge values that would
 * corrupt any 13-month sum. "Darlington" appears twice with BOCSAR's LGA
 * parenthetical - a parser joining by bare name would merge two localities.
 */
function fixtureCsv(): string {
  const months = [
    "Dec 2024", // 13th-oldest: must be dropped from a Jan 2025..Dec 2025 window
    "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025", "Jun 2025",
    "Jul 2025", "Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025",
  ];
  const header =
    '"Suburb","Offence category","Subcategory",' +
    months.map((m) => `"${m}"`).join(",");
  const row = (suburb: string, cat: string, sub: string, perMonth: number) =>
    `"${suburb}","${cat}","${sub}",999,${Array(12).fill(perMonth).join(",")}`;
  return [
    header,
    // Newtown property: 2/month B&E + 1/month MVT = 36 over the window.
    row("Newtown", "Theft", "Break and enter dwelling", 2),
    row("Newtown", "Theft", "Motor vehicle theft", 1),
    // Newtown violent: 1/month assault = 12.
    row("Newtown", "Assault", "Domestic violence related assault", 1),
    // Excluded categories - huge values that would corrupt the rates.
    row("Newtown", "Drug offences", "Possession and/or use of cannabis", 500),
    row("Newtown", "Transport regulatory offences", "Transport regulatory offences", 500),
    row("Newtown", "Against justice procedures", "Breach bail conditions", 500),
    row("Newtown", "Other offences", "Other offences", 500),
    // Duplicate locality name, disambiguated by BOCSAR's LGA parenthetical.
    row("Darlington (Sydney)", "Assault", "Non-domestic violence related assault", 2),
    row("Darlington (Singleton)", "Assault", "Non-domestic violence related assault", 5),
    // Bare suburb joined through an ABS "(NSW)"-suffixed crosswalk LGA.
    row("Gosford (Central Coast)", "Theft", "Other theft", 3),
  ].join("\n") + "\n";
}

describe("classifyNswOffence", () => {
  it("maps BOCSAR categories to property/violent and ignores the rest", () => {
    expect(classifyNswOffence("Homicide")).toBe("violent");
    expect(classifyNswOffence("Assault")).toBe("violent");
    expect(classifyNswOffence("Sexual offences")).toBe("violent");
    expect(classifyNswOffence("Robbery")).toBe("violent");
    expect(classifyNswOffence("Abduction and kidnapping")).toBe("violent");
    expect(classifyNswOffence("Blackmail and extortion")).toBe("violent");
    expect(classifyNswOffence("Intimidation, stalking and harassment")).toBe("violent");
    expect(classifyNswOffence("Coercive Control")).toBe("violent");
    expect(classifyNswOffence("Other offences against the person")).toBe("violent");
    expect(classifyNswOffence("Theft")).toBe("property");
    expect(classifyNswOffence("Arson")).toBe("property");
    expect(classifyNswOffence("Malicious damage to property")).toBe("property");
    // Deliberately excluded categories (drug / justice / public order /
    // regulatory / catch-all), mirroring the VIC, ACT and QLD adapters.
    expect(classifyNswOffence("Drug offences")).toBeNull();
    expect(classifyNswOffence("Against justice procedures")).toBeNull();
    expect(classifyNswOffence("Disorderly conduct")).toBeNull();
    expect(classifyNswOffence("Betting and gaming offences")).toBeNull();
    expect(classifyNswOffence("Liquor offences")).toBeNull();
    expect(classifyNswOffence("Pornography offences")).toBeNull();
    expect(classifyNswOffence("Prohibited and regulated weapons offences")).toBeNull();
    expect(classifyNswOffence("Transport regulatory offences")).toBeNull();
    expect(classifyNswOffence("Other offences")).toBeNull();
    // Non-category columns / subcategories are never categories.
    expect(classifyNswOffence("Suburb")).toBeNull();
    expect(classifyNswOffence("Break and enter dwelling")).toBeNull();
  });
});

describe("nswMonthRank", () => {
  it('orders "Mon YYYY" labels and rejects everything else', () => {
    expect(nswMonthRank("Jan 2025")! - nswMonthRank("Dec 2024")!).toBe(1);
    expect(nswMonthRank("Dec 2025")! - nswMonthRank("Nov 2025")!).toBe(1);
    expect(nswMonthRank("Jan 1995")!).toBeLessThan(nswMonthRank("Dec 2025")!);
    expect(nswMonthRank("Suburb")).toBeNull();
    expect(nswMonthRank("Offence category")).toBeNull();
    expect(nswMonthRank("MAY26")).toBeNull(); // QPS-style labels are not BOCSAR's
    expect(nswMonthRank("Foo 2025")).toBeNull();
  });
});

describe("nswSuburbLgaKey", () => {
  it("collapses BOCSAR parentheticals and ABS (NSW)-suffixed LGAs to one key", () => {
    // BOCSAR side: qualifier comes in bare ("Sydney", "Central Coast").
    expect(nswSuburbLgaKey("Darlington", "Sydney")).toBe("darlington|sydney");
    // Crosswalk side: ABS suffixes cross-state duplicate LGA names.
    expect(nswSuburbLgaKey("Gosford", "Central Coast (NSW)")).toBe(
      nswSuburbLgaKey("Gosford", "Central Coast")
    );
    expect(nswSuburbLgaKey("Campbelltown", "Campbelltown (NSW)")).toBe(
      "campbelltown|campbelltown"
    );
  });
});

describe("parseNswCrimeCsv", () => {
  it("sums the LATEST TWELVE months per suburb, classified categories only", () => {
    const { bySuburb, bySuburbLga, latestMonth, monthsUsed } =
      parseNswCrimeCsv(fixtureCsv());
    expect(latestMonth).toBe("Dec 2025");
    expect(monthsUsed).toBe(12);
    // 12 x (2 B&E + 1 MVT) property, 12 x 1 assault violent; the Dec 2024
    // 999s and the excluded-category 500s never reach the counts.
    expect(bySuburb.get("newtown")).toEqual({ property: 36, violent: 12 });
  });

  it("keeps LGA-qualified duplicate localities separate (never merged by name)", () => {
    const { bySuburb, bySuburbLga } = parseNswCrimeCsv(fixtureCsv());
    expect(bySuburb.has("darlington")).toBe(false);
    expect(bySuburbLga.get("darlington|sydney")).toEqual({ property: 0, violent: 24 });
    expect(bySuburbLga.get("darlington|singleton")).toEqual({ property: 0, violent: 60 });
  });

  it("throws when the identifier columns are missing (reshaped export)", () => {
    const csv = '"Locality","Offence","Jan 2025"\n"Newtown","Theft",1\n';
    expect(() => parseNswCrimeCsv(csv)).toThrow(/identifier columns/i);
  });

  it("throws when no month column parses (reshaped export)", () => {
    const csv =
      '"Suburb","Offence category","Subcategory","2025-01"\n' +
      '"Newtown","Theft","Other theft",1\n';
    expect(() => parseNswCrimeCsv(csv)).toThrow(/month columns/i);
  });

  it("throws when no row classifies (wholesale category relabel)", () => {
    const csv =
      '"Suburb","Offence category","Subcategory","Jan 2025"\n' +
      '"Newtown","Renamed division","Sub",1\n';
    expect(() => parseNswCrimeCsv(csv)).toThrow(/no suburb rows classified/i);
  });
});

describe("applyNswCrimeToPlaces", () => {
  const cw = {
    region: "sydney",
    generatedAt: "",
    suburbToSa2: {},
    suburbAliases: {},
    sa2ToSuburb: {
      // Bare-name suburb, fully inside one SA2.
      "117031337": {
        sa2Code: "117031337",
        sa2Name: "Newtown",
        suburbs: [
          { suburb: "Newtown", salCode: "12345", lga: "Inner West", weight: 1, method: "population-weighted" as const },
        ],
      },
      // BOCSAR-qualified locality: must hit "darlington|sydney", never the
      // Singleton namesake.
      "117031338": {
        sa2Code: "117031338",
        sa2Name: "Darlington",
        suburbs: [
          { suburb: "Darlington", salCode: "12346", lga: "Sydney", weight: 1, method: "area-weighted" as const },
        ],
      },
      // Split SA2: half bare-name, half qualified.
      "117031339": {
        sa2Code: "117031339",
        sa2Name: "Split",
        suburbs: [
          { suburb: "Newtown", salCode: "12345", lga: "Inner West", weight: 0.5, method: "area-weighted" as const },
          { suburb: "Darlington", salCode: "12346", lga: "Sydney", weight: 0.5, method: "area-weighted" as const },
        ],
      },
      // Crosswalk LGA carries the ABS "(NSW)" suffix; BOCSAR qualifier is bare.
      "102011031": {
        sa2Code: "102011031",
        sa2Name: "Gosford",
        suburbs: [
          { suburb: "Gosford", salCode: "12347", lga: "Central Coast (NSW)", weight: 1, method: "area-weighted" as const },
        ],
      },
      // Ambiguous name in the wrong LGA: must stay unmatched, not borrow a
      // namesake's counts.
      "102011032": {
        sa2Code: "102011032",
        sa2Name: "WrongLga",
        suburbs: [
          { suburb: "Darlington", salCode: "12348", lga: "Hawkesbury", weight: 1, method: "area-weighted" as const },
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

  it("computes crosswalk-weighted rates per 100k ERP, qualified key first", () => {
    const parsed = parseNswCrimeCsv(fixtureCsv());
    const newtown = place("117031337", 4000);
    const darlington = place("117031338", 2000);
    const split = place("117031339", 1000);
    const gosford = place("102011031", 3000);
    const miss = place("102011032", 1000);
    const stats = applyNswCrimeToPlaces(
      [newtown, darlington, split, gosford, miss],
      cw,
      parsed
    );

    expect(stats).toEqual({ matched: 4, unmatched: 1 });
    // Newtown: property 36, violent 12 over pop 4000 -> 900 / 300 per 100k.
    expect(newtown.propertyCrimeRate).toBeCloseTo(900, 10);
    expect(newtown.violentCrimeRate).toBeCloseTo(300, 10);
    expect(newtown.crimeMethod).toBe("population-weighted");
    // Darlington (Sydney): violent 24 over pop 2000 -> 1200; the Singleton
    // namesake's 60 must NOT leak in (name-only join would give 4200).
    expect(darlington.propertyCrimeRate).toBeCloseTo(0, 10);
    expect(darlington.violentCrimeRate).toBeCloseTo(1200, 10);
    expect(darlington.crimeMethod).toBe("area-weighted");
    // Split: 0.5*36 = 18 property, 0.5*12 + 0.5*24 = 18 violent over pop 1000.
    expect(split.propertyCrimeRate).toBeCloseTo(1800, 10);
    expect(split.violentCrimeRate).toBeCloseTo(1800, 10);
    // Gosford: ABS "(NSW)" LGA suffix still matches the qualified key.
    expect(gosford.propertyCrimeRate).toBeCloseTo((36 / 3000) * 100000, 10);
    expect(gosford.violentCrimeRate).toBeCloseTo(0, 10);
    // Ambiguous name, wrong LGA -> untouched (safety stays unscored).
    expect(miss.propertyCrimeRate).toBeNull();
    expect(miss.violentCrimeRate).toBeNull();
    expect(miss.crimeMethod).toBeNull();
  });
});
