import { describe, expect, it } from "vitest";
import { getRegion } from "../lib/regions";
import {
  gradeEnterococci,
  normalizeNswBeachwatch,
  parseBeachwatchSites,
  parseEnterococciTrend,
  type EnterococciSample,
} from "../scripts/lib/nsw-beachwatch";

function fixtureGeojson() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [151.28874, -33.78689] },
        properties: {
          id: "queenscliff",
          siteName: "Queenscliff Beach",
          pollutionForecast: "Unlikely",
          latestResult: "Good",
          latestResultRating: 4,
          latestResultObservationDate: "2026-06-09T10:00:00+10:00",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [151.2743, -33.8908] },
        properties: {
          id: "bondi",
          siteName: "Bondi Beach",
          pollutionForecast: "Possible",
          latestResult: "Fair",
          latestResultRating: 3,
          latestResultObservationDate: "2026-06-10T10:00:00+10:00",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [152.116518, -32.779284] },
        properties: { id: "hunter", siteName: "One Mile Beach" },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [151.2, -33.8] },
        properties: { id: "", siteName: "Missing id" },
      },
    ],
  };
}

describe("parseBeachwatchSites", () => {
  it("keeps valid Greater Sydney point sites and drops outside/malformed rows", () => {
    const sites = parseBeachwatchSites(fixtureGeojson(), getRegion("sydney"));
    expect(sites).toEqual([
      { id: "bondi", name: "Bondi Beach", lng: 151.2743, lat: -33.8908 },
      {
        id: "queenscliff",
        name: "Queenscliff Beach",
        lng: 151.28874,
        lat: -33.78689,
      },
    ]);
  });
});

describe("parseEnterococciTrend", () => {
  it("parses and newest-first sorts Beachwatch trend rows", () => {
    expect(
      parseEnterococciTrend([
        { MeasurementDt: "2026-05-29T10:00:00+10:00", EntPer100Ml: "1500" },
        { MeasurementDt: "bad-date", EntPer100Ml: 7 },
        { MeasurementDt: "2026-06-09T10:00:00+10:00", EntPer100Ml: 7 },
      ])
    ).toEqual([
      { ms: Date.parse("2026-06-09T10:00:00+10:00"), value: 7 },
      { ms: Date.parse("2026-05-29T10:00:00+10:00"), value: 1500 },
    ]);
  });
});

describe("normalizeNswBeachwatch", () => {
  const samples = new Map<string, EnterococciSample[]>([
    [
      "bondi",
      parseEnterococciTrend([
        { MeasurementDt: "2026-06-10T10:00:00+10:00", EntPer100Ml: 7 },
        { MeasurementDt: "2026-06-03T10:00:00+10:00", EntPer100Ml: 43 },
        { MeasurementDt: "2026-05-29T10:00:00+10:00", EntPer100Ml: 1500 },
      ]),
    ],
    [
      "queenscliff",
      parseEnterococciTrend([
        { MeasurementDt: "2026-06-09T10:00:00+10:00", EntPer100Ml: 600 },
        { MeasurementDt: "2026-06-03T10:00:00+10:00", EntPer100Ml: 700 },
        { MeasurementDt: "2026-05-29T10:00:00+10:00", EntPer100Ml: 800 },
      ]),
    ],
  ]);

  it("emits Melbourne-compatible rows using median recent enterococci", () => {
    const rows = normalizeNswBeachwatch(
      parseBeachwatchSites(fixtureGeojson(), getRegion("sydney")),
      samples
    );

    expect(rows).toEqual([
      {
        name: "Bondi Beach",
        lng: 151.2743,
        lat: -33.8908,
        grade: "Fair",
        value: 43,
        n: 3,
        date: "2026-06-10",
      },
      {
        name: "Queenscliff Beach",
        lng: 151.28874,
        lat: -33.78689,
        grade: "Poor",
        value: 700,
        n: 3,
        date: "2026-06-09",
      },
    ]);
  });

  it("uses the existing three-band Festra thresholds", () => {
    expect(gradeEnterococci(40)).toBe("Good");
    expect(gradeEnterococci(41)).toBe("Fair");
    expect(gradeEnterococci(200)).toBe("Fair");
    expect(gradeEnterococci(201)).toBe("Poor");
    expect(gradeEnterococci(501)).toBe("Poor");
  });
});
