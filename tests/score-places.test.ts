import { describe, it, expect } from "vitest";
import { scorePlaces, type RawPlace } from "../scripts/lib/score-places";
import { getRegion } from "../lib/regions";

/**
 * VIC-source quarantine (2026-06 incident regression). Every non-VIC capital
 * bake shipped safety/hazards domains stamped scored:true with VICTORIAN
 * sourceIds ("vcsa-recorded-offences", "vic-planning-bpa/flood") on all-null
 * indicators - false provenance implying VIC crime/overlay data covered NSW/
 * QLD/WA/SA/TAS/NT areas. The fix: regions without a crime adapter get an
 * UNSCORED safety stub; regions without a hazard adapter get an UNSCORED
 * hazards stub; no sourceId starting with "vcsa"/"vic-" may appear anywhere
 * in a non-VIC region's output. These tests are the contamination tripwire.
 */

const NON_VIC_NO_ADAPTER = [
  "adelaide",
  "perth",
  "hobart",
  "darwin",
] as const;

/** A raw place as normalize.ts emits it for a non-VIC region: crime rates and
 * overlay shares null (no source), everything else populated. */
function rawPlace(over: Partial<RawPlace> = {}): RawPlace {
  return {
    sa2Code: "101011001",
    sa2Name: "Testville",
    lga: "Test (C)",
    centroid: [151.2, -33.87],
    suburbAliases: ["Testville"],
    population: 5000,
    medianDhiWeekly: 1000,
    medianRentWeekly: 400,
    propertyCrimeRate: null,
    violentCrimeRate: null,
    crimeMethod: null,
    stops800m: 12,
    ptModes: "osm-fallback",
    amPeakFreq: null,
    transportSource: "osm-pt",
    hospitalDistKm: 2.5,
    hospitalSource: "osm-health",
    gpCount2km: 3,
    employmentRatio: 0.5,
    participationRate: 60,
    bushfirePct: null,
    floodPct: null,
    schools2km: 2,
    preschoolEnrolled: 40,
    ...over,
  };
}

/** Two residential places so percentiles rank over a real baseline. */
function nonVicFixture(): RawPlace[] {
  return [
    rawPlace(),
    rawPlace({
      sa2Code: "101011002",
      sa2Name: "Richmond",
      suburbAliases: ["Richmond"], // the incident's collision name
      medianRentWeekly: 600,
      stops800m: 3,
      gpCount2km: 1,
      schools2km: 5,
    }),
  ];
}

describe("scorePlaces VIC-source quarantine", () => {
  it.each(NON_VIC_NO_ADAPTER)(
    "%s (no crime adapter): safety and hazards are honest unscored stubs",
    (id) => {
      const places = scorePlaces(nonVicFixture(), getRegion(id), new Map());
      for (const place of places) {
        expect(place.domains.safety).toEqual({
          domain: "safety",
          scored: false,
          percentile: null,
          subIndicators: {},
        });
        expect(place.domains.hazards).toEqual({
          domain: "hazards",
          scored: false,
          percentile: null,
          subIndicators: {},
        });
      }
    }
  );

  it.each(NON_VIC_NO_ADAPTER)(
    "%s output contains no vcsa/vic- sourceId anywhere (tripwire)",
    (id) => {
      const json = JSON.stringify(
        scorePlaces(nonVicFixture(), getRegion(id), new Map())
      );
      expect(json).not.toMatch(/vcsa/);
      expect(json).not.toMatch(/"vic-/);
    }
  );

  it("a leaked VIC crime rate still cannot resurrect a VIC sourceId (no adapter, no domain)", () => {
    // Even if wrong-state rates somehow reached indicators-raw (the pre-gate
    // suburb-name collision), a region without an adapter must stay unscored.
    const contaminated = nonVicFixture().map((p) => ({
      ...p,
      propertyCrimeRate: 9000,
      violentCrimeRate: 1200,
      crimeMethod: "direct" as const,
    }));
    const places = scorePlaces(contaminated, getRegion("perth"), new Map());
    for (const place of places) {
      expect(place.domains.safety!.scored).toBe(false);
      expect(place.domains.safety!.percentile).toBeNull();
    }
    expect(JSON.stringify(places)).not.toMatch(/vcsa/);
  });

  it("canberra (ACT adapter) scores safety from ACT Policing, hazards stay unscored", () => {
    const raw = nonVicFixture().map((p, i) => ({
      ...p,
      propertyCrimeRate: 5000 + i * 1000,
      violentCrimeRate: 800 + i * 100,
      crimeMethod: "direct" as const,
    }));
    const places = scorePlaces(raw, getRegion("canberra"), new Map());
    for (const place of places) {
      const safety = place.domains.safety!;
      expect(safety.scored).toBe(true);
      expect(safety.percentile).not.toBeNull();
      expect(safety.subIndicators.propertyCrime.sourceId).toBe(
        "act-policing-crime-statistics"
      );
      expect(safety.subIndicators.violentCrime.sourceId).toBe(
        "act-policing-crime-statistics"
      );
      expect(place.domains.hazards).toEqual({
        domain: "hazards",
        scored: false,
        percentile: null,
        subIndicators: {},
      });
    }
    const json = JSON.stringify(places);
    expect(json).not.toMatch(/vcsa/);
    expect(json).not.toMatch(/"vic-/);
  });

  it("sydney (NSW adapter) scores safety from BOCSAR, hazards stay unscored", () => {
    const raw = nonVicFixture().map((p, i) => ({
      ...p,
      propertyCrimeRate: 5000 + i * 1000,
      violentCrimeRate: 800 + i * 100,
      crimeMethod: "population-weighted" as const,
    }));
    const places = scorePlaces(raw, getRegion("sydney"), new Map());
    for (const place of places) {
      const safety = place.domains.safety!;
      expect(safety.scored).toBe(true);
      expect(safety.percentile).not.toBeNull();
      expect(safety.subIndicators.propertyCrime.sourceId).toBe(
        "bocsar-suburb-offences"
      );
      expect(safety.subIndicators.violentCrime.sourceId).toBe(
        "bocsar-suburb-offences"
      );
      expect(place.domains.hazards).toEqual({
        domain: "hazards",
        scored: false,
        percentile: null,
        subIndicators: {},
      });
    }
    const json = JSON.stringify(places);
    expect(json).not.toMatch(/vcsa/);
    expect(json).not.toMatch(/"vic-/);
  });

  it("brisbane (QLD adapters) scores safety from QPS and hazards from QFES BPA + BCC flood", () => {
    const raw = nonVicFixture().map((p, i) => ({
      ...p,
      propertyCrimeRate: 5000 + i * 1000,
      violentCrimeRate: 800 + i * 100,
      crimeMethod: "direct" as const,
      bushfirePct: 10 + i * 5,
      // Second place models an SA2 in an unmapped council (Moreton Bay/Logan/
      // Ipswich/Redland): floodPct stays null -> honestly missing, never 0.
      floodPct: i === 0 ? 2 : null,
    }));
    const places = scorePlaces(raw, getRegion("brisbane"), new Map());
    for (const place of places) {
      const safety = place.domains.safety!;
      expect(safety.scored).toBe(true);
      expect(safety.percentile).not.toBeNull();
      expect(safety.subIndicators.propertyCrime.sourceId).toBe(
        "qps-lga-offence-rates"
      );
      expect(safety.subIndicators.violentCrime.sourceId).toBe(
        "qps-lga-offence-rates"
      );
      const hazards = place.domains.hazards!;
      expect(hazards.scored).toBe(true);
      expect(hazards.percentile).not.toBeNull();
      expect(hazards.subIndicators.bushfirePct.sourceId).toBe(
        "qld-spp-bushfire-prone-area"
      );
      expect(hazards.subIndicators.floodPct.sourceId).toBe(
        "bcc-cityplan-flood-overlay"
      );
    }
    // Unmapped-council place: flood sub-indicator missing, hazards scored
    // from the available bushfire part (melbourne's missing-handling).
    expect(places[0].domains.hazards!.subIndicators.floodPct.missing).toBe(false);
    expect(places[1].domains.hazards!.subIndicators.floodPct.missing).toBe(true);
    expect(places[1].domains.hazards!.subIndicators.floodPct.raw).toBeNull();
    const json = JSON.stringify(places);
    expect(json).not.toMatch(/vcsa/);
    expect(json).not.toMatch(/"vic-/);
  });

  it("melbourne keeps VCSA-scored safety and VIC-overlay hazards (byte-identity pin)", () => {
    const raw = nonVicFixture().map((p, i) => ({
      ...p,
      propertyCrimeRate: 5000 + i * 1000,
      violentCrimeRate: 800 + i * 100,
      crimeMethod: "direct" as const,
      bushfirePct: 10 + i * 5,
      floodPct: 2 + i,
    }));
    const places = scorePlaces(raw, getRegion("melbourne"), new Map());
    for (const place of places) {
      const safety = place.domains.safety!;
      expect(safety.scored).toBe(true);
      expect(safety.subIndicators.propertyCrime.sourceId).toBe(
        "vcsa-recorded-offences"
      );
      const hazards = place.domains.hazards!;
      expect(hazards.scored).toBe(true);
      expect(hazards.percentile).not.toBeNull();
      expect(hazards.subIndicators.bushfirePct.sourceId).toBe("vic-planning-bpa");
      expect(hazards.subIndicators.floodPct.sourceId).toBe("vic-planning-flood");
    }
  });

  it("melbourne with NO crime/overlay data keeps the historical scored-but-missing shape", () => {
    // VIC bakes where the workbook/overlay fetch failed have always emitted
    // scored:true with all-missing indicators - that degraded-VIC shape is
    // load-bearing for byte-identity and must not be confused with quarantine.
    const places = scorePlaces(nonVicFixture(), getRegion("melbourne"), new Map());
    for (const place of places) {
      expect(place.domains.safety!.scored).toBe(true);
      expect(place.domains.safety!.subIndicators.propertyCrime.missing).toBe(true);
      expect(place.domains.hazards!.scored).toBe(true);
      expect(place.domains.hazards!.subIndicators.bushfirePct.missing).toBe(true);
    }
  });

  it("unscored stubs do not count toward coverage or data-confidence totals", () => {
    const [place] = scorePlaces(nonVicFixture(), getRegion("perth"), new Map());
    // 7 scored domains; safety + hazards percentiles are null here.
    expect(place.coverage).toBeLessThan(1);
    // No phantom always-missing VIC indicators dragging completeness.
    expect(place.dataConfidence!.counts.missing).toBe(0);
  });
});
