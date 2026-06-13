import { describe, it, expect, afterEach, vi } from "vitest";
import XLSX from "xlsx";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { PocketsFile } from "../lib/types";
import { ASGS_EDITION } from "../scripts/lib/abs-geo";
import {
  buildPocketsFile,
  POCKET_SEIFA_SOURCE_ID,
} from "../scripts/build-pockets";
import {
  parseNullableDecile,
  parseSeifaSa1Workbook,
} from "../scripts/fetch-seifa-sa1";
import {
  __resetPocketsDataCachesForTests,
  loadPockets,
} from "../lib/pockets-data";

function square(w: number, s: number, e: number, n: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

function sa1(sa1Code: string, sa2Code = sa1Code.slice(0, 9), shift = 0): Feature {
  return {
    type: "Feature",
    properties: {
      SA1_CODE_2021: sa1Code,
      SA2_CODE_2021: sa2Code,
      GCCSA_CODE_2021: "2GMEL",
    },
    geometry: square(144 + shift, -38, 144.01 + shift, -37.99),
  };
}

function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

const PLACES = [{ sa2Code: "206041122" }, { sa2Code: "206041123" }];

function fixturePockets(): PocketsFile {
  return buildPocketsFile({
    generatedAt: "2026-06-13T00:00:00.000Z",
    region: "melbourne",
    places: PLACES,
    sa1: fc([
      sa1("20604112201", undefined, 0),
      sa1("20604112202", undefined, 0.02),
      sa1("20604112203", undefined, 0.04),
      sa1("20604112301", undefined, 0.06),
      sa1("20604112302", undefined, 0.08),
    ]),
    seifaBySa1: new Map([
      ["20604112201", { irsadDecile: 2, irsdDecile: 3 }],
      ["20604112202", { irsadDecile: 5, irsdDecile: 6 }],
      ["20604112203", { irsadDecile: 8, irsdDecile: 9 }],
      ["20604112301", { irsadDecile: 1, irsdDecile: null }],
      ["20604112302", { irsadDecile: null, irsdDecile: null }],
    ]),
  });
}

afterEach(() => {
  __resetPocketsDataCachesForTests();
  vi.unstubAllGlobals();
});

describe("SA1 pockets artifact", () => {
  it("builds the schema without SA1 geometry and preserves null SEIFA deciles", () => {
    const file = fixturePockets();
    expect(file.asgsEdition).toBe("2021");
    expect(file.region).toBe("melbourne");

    for (const pocket of file.pockets) {
      expect(pocket.sa2Code).toBe(pocket.sa1Code.slice(0, 9));
      expect(Object.prototype.hasOwnProperty.call(pocket, "geometry")).toBe(false);
      expect(pocket.population).toBeNull();
      expect(pocket.seifa.sourceId).toBe(POCKET_SEIFA_SOURCE_ID);
      expect(pocket.seifa.period).toBe("2021");
      for (const value of [pocket.seifa.irsadDecile, pocket.seifa.irsdDecile]) {
        expect(value === null || (Number.isInteger(value) && value >= 1 && value <= 10)).toBe(
          true
        );
        expect(value).not.toBe(0);
      }
    }

    const suppressed = file.pockets.find((p) => p.sa1Code === "20604112302");
    expect(suppressed?.seifa.irsadDecile).toBeNull();
    expect(suppressed?.seifa.irsdDecile).toBeNull();
  });

  it("throws when an SA1 parent prefix is absent from places.json parents", () => {
    expect(() =>
      buildPocketsFile({
        generatedAt: "2026-06-13T00:00:00.000Z",
        region: "melbourne",
        places: PLACES,
        sa1: fc([sa1("20604999901")]),
        seifaBySa1: new Map(),
      })
    ).toThrow(/not present in places\.json SA2 parents/);
  });

  it("computes withinSa2Rank only within each parent SA2", () => {
    const file = fixturePockets();
    const byCode = new Map(file.pockets.map((p) => [p.sa1Code, p]));

    expect(byCode.get("20604112201")?.withinSa2Rank).toBe(0);
    expect(byCode.get("20604112202")?.withinSa2Rank).toBe(50);
    expect(byCode.get("20604112203")?.withinSa2Rank).toBe(100);
    expect(byCode.get("20604112301")?.withinSa2Rank).toBeUndefined();
    expect(byCode.get("20604112302")?.withinSa2Rank).toBeUndefined();
  });

  it("keeps ASGS pinned to 2021", () => {
    expect(ASGS_EDITION).toBe("2021");
    expect(fixturePockets().asgsEdition).toBe("2021");
  });

  it("parses fixture SEIFA workbooks and treats 0/blank deciles as null", () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["SEIFA 2021 SA1 fixture"],
      ["", "IRSAD", "IRSAD", "IRSD", "IRSD"],
      ["SA1_CODE_2021", "Score", "Decile", "Score", "Decile"],
      ["20604112201", 1000, 7, 980, 6],
      ["20604112202", 900, 0, 910, ""],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "SA1 indexes");
    const rows = parseSeifaSa1Workbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    expect(rows).toEqual([
      { sa1Code: "20604112201", irsadDecile: 7, irsdDecile: 6 },
      { sa1Code: "20604112202", irsadDecile: null, irsdDecile: null },
    ]);
    expect(parseNullableDecile(0)).toBeNull();
    expect(parseNullableDecile("")).toBeNull();
  });
});

describe("loadPockets", () => {
  it("fetches lazily, groups by SA2, and caches per region", async () => {
    const file = fixturePockets();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(file), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadPockets("melbourne");
    const second = await loadPockets("melbourne");

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/data/pockets.json");
    expect(first.get("206041122")?.map((p) => p.sa1Code)).toEqual([
      "20604112201",
      "20604112202",
      "20604112203",
    ]);
    expect(first.get("206041123")?.map((p) => p.sa1Code)).toEqual([
      "20604112301",
      "20604112302",
    ]);
  });

  it("returns an empty Map for a missing pockets artifact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL) => new Response("not found", { status: 404 }))
    );

    const grouped = await loadPockets("canberra");
    expect(grouped.size).toBe(0);
  });
});
