import { describe, expect, it } from "vitest";
import type { Feature, Point, Polygon } from "geojson";
import {
  buildBuyerReport,
  findContainingSa2,
  getNearbyAmenities,
  dedupeParkAmenities,
  BUYER_DISCLAIMER,
  UNCONFIRMED_PARCEL_CAVEAT,
} from "../lib/buyer-report";
import type { PlanningAt, PlanningOverlayAt } from "../lib/planning-at";
import type { Place } from "../lib/types";

const PIN = { lat: -37.8, lng: 144.97 };

describe("transport-noise finding (proximity proxy)", () => {
  it("flags a pin sitting on a freeway line, sourced + caveated", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      noiseLines: [
        { kind: "freeway", coords: [[144.96, -37.8], [144.98, -37.8]] }, // through the pin
      ],
    });
    const f = r.findings.find((x) => x.id === "transport-noise");
    expect(f).toBeTruthy();
    expect(f!.kind).toBe("verify");
    expect(f!.sourceRefs?.length ?? 0).toBeGreaterThan(0);
    expect(f!.caveat ?? "").toMatch(/proximity proxy/i);
  });

  it("stays silent when no source is within range", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      noiseLines: [
        { kind: "rail", coords: [[144.90, -37.9], [144.91, -37.9]] }, // ~11 km away
      ],
    });
    expect(r.findings.find((x) => x.id === "transport-noise")).toBeUndefined();
  });
});

describe("priorityChecks (before-you-offer TL;DR)", () => {
  const SEV = { high: 0, medium: 1, low: 2, info: 3 } as const;

  it("caps at 3, ranks more-severe checks first, and a medium check ranks above a low one", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      // ~150 m industrial -> nuisance flag severity "medium"
      nuisancePoints: [{ kind: "industrial", coord: [144.97, -37.80135] }],
      // ~100 m freeway -> noise flag severity "low" (only <=50 m is "medium")
      noiseLines: [{ kind: "freeway", coords: [[144.96, -37.8009], [144.98, -37.8009]] }],
    });
    expect(r.priorityChecks.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.priorityChecks.length; i++) {
      expect(SEV[r.priorityChecks[i].severity]).toBeGreaterThanOrEqual(
        SEV[r.priorityChecks[i - 1].severity]
      );
    }
    const iNuisance = r.priorityChecks.findIndex((f) => f.id === "nuisance-proximity");
    const iNoise = r.priorityChecks.findIndex((f) => f.id === "transport-noise");
    if (iNuisance >= 0 && iNoise >= 0) expect(iNuisance).toBeLessThan(iNoise);
  });

  it("only ever contains verify/red_flag findings drawn from the report", () => {
    const r = buildBuyerReport({ lat: -37.8, lng: 144.97, pois: [] });
    expect(r.priorityChecks.every((f) => f.kind === "verify" || f.kind === "red_flag")).toBe(true);
    expect(r.priorityChecks.every((f) => r.findings.includes(f))).toBe(true);
  });
});

describe("personal fit block", () => {
  it("attaches fit with a deal-breaker hit when a profile is supplied", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      profile: { mode: "buyer", dealBreakers: ["noise"] },
      noiseLines: [{ kind: "freeway", coords: [[144.96, -37.8], [144.98, -37.8]] }],
    });
    expect(r.fit).toBeTruthy();
    expect(r.fit!.hits.map((h) => h.id)).toContain("noise");
  });

  it("omits fit entirely when no profile is supplied", () => {
    expect(buildBuyerReport({ lat: -37.8, lng: 144.97, pois: [] }).fit).toBeUndefined();
  });
});

describe("nuisance-proximity finding (industrial/waste/sewage/quarry)", () => {
  it("flags a pin next to an industrial point, sourced + caveated", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      nuisancePoints: [{ kind: "industrial", coord: [144.97, -37.8] }],
    });
    const f = r.findings.find((x) => x.id === "nuisance-proximity");
    expect(f).toBeTruthy();
    expect(f!.kind).toBe("verify");
    expect(f!.caveat ?? "").toMatch(/proximity proxy/i);
  });

  it("stays silent when the nearest nuisance is far", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      nuisancePoints: [{ kind: "sewage", coord: [145.1, -37.9] }], // ~14 km
    });
    expect(r.findings.find((x) => x.id === "nuisance-proximity")).toBeUndefined();
  });
});

describe("nearest train-station finding", () => {
  it("flags a nearby station as a positive, sourced + caveated", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      stations: [{ name: "Test Station", coord: [144.97, -37.8] }],
    });
    const f = r.findings.find((x) => x.id === "train-station");
    expect(f).toBeTruthy();
    expect(f!.kind).toBe("positive");
    expect(f!.summary).toMatch(/Test Station/);
    expect(f!.sourceRefs?.length ?? 0).toBeGreaterThan(0);
  });

  it("marks a far station neutral, not positive", () => {
    const r = buildBuyerReport({
      lat: -37.8,
      lng: 144.97,
      pois: [],
      stations: [{ name: "Far", coord: [145.1, -37.9] }], // ~14 km
    });
    expect(r.findings.find((x) => x.id === "train-station")?.kind).toBe("neutral");
  });
});

function poi(pinType: string, name: string, lng: number, lat: number): Feature<Point> {
  return {
    type: "Feature",
    properties: { pinType, name },
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

// ~0.005deg lat ~= 0.56km; ~0.010 ~= 1.11km; ~0.020 ~= 2.22km from the pin.
const POIS: Feature<Point>[] = [
  poi("supermarket", "Near Market", 144.97, -37.795), // ~0.56 km
  poi("park", "Mid Park", 144.97, -37.79), // ~1.11 km
  poi("gp", "Far Clinic", 144.97, -37.78), // ~2.22 km (outside 1.2 km)
];

function ind(raw: number | null, percentile: number | null) {
  return { raw, percentile, method: "direct" as const, sourceId: "x", missing: raw == null, stale: false };
}

function samplePlace(): Place {
  return {
    sa2Code: "200000001",
    slug: "test-sa2-200000001",
    name: "Testville",
    lga: "Test LGA",
    suburbAliases: ["Testville"],
    centroid: [144.97, -37.8],
    domains: {
      affordability: { domain: "affordability", scored: true, percentile: 60, subIndicators: { rentToIncome: ind(0.3, 60) } },
      transport: { domain: "transport", scored: true, percentile: 82, subIndicators: {} },
      safety: { domain: "safety", scored: true, percentile: 55, subIndicators: { propertyCrime: ind(100, 55) } },
      health: { domain: "health", scored: true, percentile: 75, subIndicators: {} },
      education: { domain: "education", scored: true, percentile: 50, subIndicators: {} },
      income: { domain: "income", scored: true, percentile: 70, subIndicators: {} },
      hazards: { domain: "hazards", scored: true, percentile: 50, subIndicators: { bushfirePct: ind(12, 50), floodPct: ind(3, 50) } },
    },
    context: {
      community: { renterPct: 40, apartmentPct: 20, firstNationsPct: 1, year12Pct: 80, sourceId: "abs", period: "2021" },
      equity: {
        irsadDecile: 7,
        irsadPercentile: null,
        irsadScore: null,
        irsdDecile: 6,
        sourceId: "abs",
        period: "2021",
      },
    },
    dataConfidence: {
      score: 90,
      coverage: 90,
      completeness: 90,
      freshness: 90,
      methodConfidence: 90,
      counts: { total: 10, direct: 8, estimated: 1, proximity: 1, missing: 0, stale: 0 },
    },
  };
}

describe("getNearbyAmenities", () => {
  it("sorts results nearest-first", () => {
    const out = getNearbyAmenities(PIN, POIS, { radiusMeters: 5000 });
    expect(out.length).toBe(3);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].distanceMeters).toBeGreaterThanOrEqual(out[i - 1].distanceMeters);
    }
    expect(out[0].name).toBe("Near Market");
  });

  it("respects the radius", () => {
    const within = getNearbyAmenities(PIN, POIS, { radiusMeters: 1200 });
    expect(within.map((a) => a.name).sort()).toEqual(["Mid Park", "Near Market"]);
    const tight = getNearbyAmenities(PIN, POIS, { radiusMeters: 700 });
    expect(tight.map((a) => a.name)).toEqual(["Near Market"]);
  });
});

describe("findContainingSa2", () => {
  const square: Feature = {
    type: "Feature",
    properties: { sa2Code: "200000001" },
    geometry: {
      type: "Polygon",
      coordinates: [[[144.96, -37.81], [144.98, -37.81], [144.98, -37.79], [144.96, -37.79], [144.96, -37.81]]],
    },
  };

  it("returns the containing feature", () => {
    expect(findContainingSa2(PIN, [square])?.properties?.sa2Code).toBe("200000001");
  });

  it("returns null gracefully when no polygon matches", () => {
    expect(findContainingSa2({ lat: 0, lng: 0 }, [square])).toBeNull();
    expect(findContainingSa2(PIN, [])).toBeNull();
  });
});

describe("buildBuyerReport", () => {
  const report = buildBuyerReport({
    lat: PIN.lat,
    lng: PIN.lng,
    place: samplePlace(),
    pois: POIS,
    generatedAt: "2026-06-01T00:00:00.000Z",
  });

  it("always returns the buyer disclaimer", () => {
    expect(report.disclaimers).toContain(BUYER_DISCLAIMER);
  });

  it("produces source + confidence fields", () => {
    expect(report.sourceRefs.length).toBeGreaterThan(0);
    expect(["high", "medium", "low", "unknown"]).toContain(report.summary.confidence);
    for (const f of report.findings) {
      expect(["high", "medium", "low", "unknown"]).toContain(f.confidence);
    }
  });

  it("does not invent unavailable layers (price, school catchments)", () => {
    const price = report.findings.find((f) => f.id === "price-unavailable");
    expect(price?.kind).toBe("unavailable");
    expect(price?.confidence).toBe("unknown");

    const school = report.findings.find((f) => f.id === "school-zones");
    // School catchments are a known data gap, surfaced as "unavailable" (not a
    // prominent verify) so it stays out of the before-you-offer priority list.
    expect(school?.kind).toBe("unavailable");
    expect(school?.confidence).toBe("unknown");

    // Never claims a definitive parcel-level flood/bushfire status.
    const hazard = report.findings.find((f) => f.id === "hazard-overlays");
    expect(hazard).toBeTruthy();
    expect(hazard?.verifyAction).toMatch(/council|VicPlan|insurance/i);
  });

  it("surfaces a caveated, sourced Heritage Overlay finding when coverage is material", () => {
    const base = samplePlace();
    const withHo = {
      ...base,
      context: {
        ...base.context,
        planning: { heritageOverlayPct: 30, sourceId: "vic-planning-heritage", period: "current" },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: withHo, pois: POIS, generatedAt: "x" });
    const ho = r.findings.find((f) => f.id === "heritage-overlay");
    expect(ho).toBeTruthy();
    expect(ho?.kind).toBe("verify");
    expect(ho?.caveat).toMatch(/area share|parcel/i);
    expect(ho?.verifyAction).toMatch(/planning certificate|VicPlan/i);
    expect((ho?.sourceRefs?.length ?? 0)).toBeGreaterThan(0);
  });

  it("does NOT raise a Heritage Overlay finding when coverage is negligible", () => {
    const base = samplePlace();
    const withTinyHo = {
      ...base,
      context: {
        ...base.context,
        planning: { heritageOverlayPct: 0.4, sourceId: "vic-planning-heritage", period: "current" },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: withTinyHo, pois: POIS, generatedAt: "x" });
    expect(r.findings.find((f) => f.id === "heritage-overlay")).toBeFalsy();
  });

  it("surfaces a high-severity, sourced conservation-overlay finding when a PAO is present", () => {
    const base = samplePlace();
    const withOverlays = {
      ...base,
      context: {
        ...base.context,
        planning: {
          heritageOverlayPct: null,
          sourceId: "vic-planning-overlays",
          period: "current",
          overlays: { PAO: 4, VPO: 12 },
        },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: withOverlays, pois: POIS, generatedAt: "x" });
    const co = r.findings.find((f) => f.id === "conservation-overlays");
    expect(co).toBeTruthy();
    expect(co?.kind).toBe("verify");
    expect(co?.severity).toBe("high"); // PAO is high-materiality
    expect(co?.title).toMatch(/Public Acquisition|PAO/);
    expect(co?.caveat).toMatch(/area share|parcel/i);
    expect(co?.verifyAction).toMatch(/planning certificate|VicPlan/i);
    expect(co?.sourceRefs?.length ?? 0).toBeGreaterThan(0);
    // A high-severity verify belongs in the before-you-offer checklist.
    expect(r.priorityChecks.some((f) => f.id === "conservation-overlays")).toBe(true);
  });

  it("does NOT raise a conservation-overlay finding below the 1% floor", () => {
    const base = samplePlace();
    const withTiny = {
      ...base,
      context: {
        ...base.context,
        planning: {
          heritageOverlayPct: null,
          sourceId: "vic-planning-overlays",
          period: "current",
          overlays: { VPO: 0.3 },
        },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: withTiny, pois: POIS, generatedAt: "x" });
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeFalsy();
  });

  it("tags measured downsides with tone 'concern' (negatives split) but never positives", () => {
    const base = samplePlace();
    const weakTransport = {
      ...base,
      domains: {
        ...base.domains,
        transport: { domain: "transport" as const, scored: true, percentile: 20, subIndicators: {} },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: weakTransport, pois: POIS, generatedAt: "x" });
    const tc = r.findings.find((f) => f.id === "transport-check");
    expect(tc?.kind).toBe("verify");
    expect(tc?.tone).toBe("concern"); // routes to "What to weigh up", not "Things to verify"
    const pos = r.findings.find((f) => f.kind === "positive");
    expect(pos).toBeTruthy();
    expect(pos?.tone).toBeUndefined();
  });

  it("computes straight-line distance to the profile's life-anchors (context only)", () => {
    const r = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: POIS,
      generatedAt: "x",
      profile: {
        mode: "buyer",
        anchors: [{ id: "w", kind: "work", label: "Office", lng: 144.99, lat: -37.82 }],
      },
    });
    expect(r.anchorDistances?.length).toBe(1);
    expect(r.anchorDistances?.[0].anchor.label).toBe("Office");
    expect(r.anchorDistances?.[0].km).toBeGreaterThanOrEqual(0);
  });

  it("surfaces the nearest supermarket as a drive when none is in the walk circle", () => {
    const farSupermarket = poi("supermarket", "Far Coles", 144.99, -37.78); // ~4 km
    const r = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: [farSupermarket],
      generatedAt: "x",
    });
    const s = r.findings.find((f) => f.id === "supermarket-nearest");
    expect(s).toBeTruthy();
    expect(s?.summary).toMatch(/km/);
  });

  it("surfaces a past-fire-history finding when the burnt share is material", () => {
    const base = samplePlace();
    const withFire = {
      ...base,
      context: {
        ...base.context,
        fireHistory: { burntPct: 45, sourceId: "vic-fire-history", period: "to 2022-23" },
      },
    };
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: withFire, pois: POIS, generatedAt: "x" });
    const f = r.findings.find((x) => x.id === "fire-history");
    expect(f).toBeTruthy();
    expect(f?.severity).toBe("high"); // >= 40%
    expect(f?.tone).toBe("concern");
    expect(f?.caveat).toMatch(/history|forward/i);
  });

  it("handles a pin outside SA2 coverage (no place) gracefully", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: null, pois: POIS, generatedAt: "x" });
    expect(r.summary.confidence).toBe("low");
    expect(r.disclaimers).toContain(BUYER_DISCLAIMER);
    // Still surfaces the always-on verify/unavailable findings.
    expect(r.findings.some((f) => f.id === "price-unavailable")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const a = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, generatedAt: "t" });
    const b = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, generatedAt: "t" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

});

describe("buildBuyerReport provenance discipline", () => {
  it("every finding carries confidence, geography, and either a source or a caveat", () => {
    for (const place of [samplePlace(), null]) {
      const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place, pois: POIS, generatedAt: "t" });
      for (const f of r.findings) {
        expect(["high", "medium", "low", "unknown"], `confidence on ${f.id}`).toContain(f.confidence);
        expect(
          ["pin", "poi-radius", "sa2", "lga", "gccsa", "unknown"],
          `geography on ${f.id}`
        ).toContain(f.geography);
        const hasProvenance = (f.sourceRefs?.length ?? 0) > 0 || (f.caveat?.length ?? 0) > 0;
        expect(hasProvenance, `finding "${f.id}" must cite a source or state a caveat`).toBe(true);
      }
    }
  });

  it("off-coverage (no SA2) downgrades the safety finding precision to unknown", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: null, pois: POIS, generatedAt: "t" });
    const safety = r.findings.find((f) => f.id === "safety-context");
    expect(safety?.confidence).toBe("unknown");
    expect(safety?.geography).toBe("unknown");
  });
});

describe("buildBuyerReport hazard conditionality", () => {
  function placeWithHazards(bushfirePct: number, floodPct: number): Place {
    const p = samplePlace();
    p.domains.hazards = {
      domain: "hazards",
      scored: true,
      percentile: 50,
      subIndicators: { bushfirePct: ind(bushfirePct, 50), floodPct: ind(floodPct, 50) },
    };
    return p;
  }

  it("surfaces a calm neutral note when overlays are negligible (central area)", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: placeWithHazards(0, 0), pois: POIS, generatedAt: "t" });
    const hz = r.findings.find((f) => f.id === "hazard-overlays");
    expect(hz?.kind).toBe("neutral");
    expect(hz?.title).toMatch(/little|no significant/i);
  });

  it("raises a red_flag when overlay share is elevated", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: placeWithHazards(0, 20), pois: POIS, generatedAt: "t" });
    expect(r.findings.find((f) => f.id === "hazard-overlays")?.kind).toBe("red_flag");
  });

  // P1-2 (s18 mitigation): a NEGATIVE hazard statement must carry the dataset
  // vintage inline - "No <X> overlay in <dataset> as at <date>" - so an
  // all-clear can never be read as current forever.
  it("dates the negative ('no overlay') hazard finding inline with 'as at'", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: placeWithHazards(0, 0), pois: POIS, generatedAt: "t" });
    const hz = r.findings.find((f) => f.id === "hazard-overlays");
    expect(hz?.kind).toBe("neutral");
    expect(hz?.summary).toMatch(/No bushfire or flood overlay in the Vicmap Planning data/);
    expect(hz?.summary).toMatch(/as at \d{4}/);
  });

  it("dates the unmatched-overlay fallback the same way", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: null, pois: POIS, generatedAt: "t" });
    const hz = r.findings.find((f) => f.id === "hazard-overlays");
    expect(hz?.kind).toBe("unavailable");
    expect(hz?.summary).toMatch(/as at \d{4}/);
  });
});

describe("buildBuyerReport adjacency nudge", () => {
  // PIN = [-37.8, 144.97]; containing centroid is the same point.
  const near = (name: string, sa2Code: string, lat: number) => ({
    sa2Code,
    slug: name.toLowerCase(),
    name,
    centroid: [144.97, lat] as [number, number],
  });

  it("flags a neighbour within ~15 min, excluding the containing SA2 and far areas", () => {
    const nearbyAreas = [
      near("Testville", "200000001", -37.8), // same SA2 as place -> excluded
      near("Nextdoor", "200000002", -37.79), // ~1.11 km -> included
      near("Farburb", "200000003", -37.77), // ~3.3 km -> excluded
    ];
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, nearbyAreas, generatedAt: "t" });
    const adj = r.findings.find((f) => f.id === "near-area-border");
    expect(adj).toBeTruthy();
    // The neighbour list is exactly "Nextdoor" (containing + far area excluded).
    expect(adj?.summary).toMatch(/centre of Nextdoor\./);
    expect(adj?.summary).not.toContain("Farburb");
    expect(adj?.caveat).toMatch(/centre-points/i);
    expect(adj?.kind).toBe("neutral");
  });

  it("omits the finding when nothing is close enough", () => {
    const nearbyAreas = [near("Farburb", "200000003", -37.77)];
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, nearbyAreas, generatedAt: "t" });
    expect(r.findings.find((f) => f.id === "near-area-border")).toBeFalsy();
  });

  it("omits the finding when nearbyAreas is not supplied", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, generatedAt: "t" });
    expect(r.findings.find((f) => f.id === "near-area-border")).toBeFalsy();
  });
});

describe("dedupeParkAmenities", () => {
  const park = (name: string, lat: number, lng: number, d = 0) => ({
    id: `${name}@${lat},${lng}`,
    name,
    category: "park",
    lat,
    lng,
    distanceMeters: d,
  });
  const cafe = (name: string, lat: number, lng: number, d = 0) => ({
    id: name,
    name,
    category: "cafe_restaurant",
    lat,
    lng,
    distanceMeters: d,
  });

  it("merges same-named park pins within the merge radius, keeping the nearest", () => {
    const out = dedupeParkAmenities([
      park("Royal Park", -37.78, 144.95, 100),
      park("Royal Park", -37.7805, 144.9505, 160), // ~70 m away
    ]);
    expect(out.filter((a) => a.category === "park")).toHaveLength(1);
    expect(out[0].distanceMeters).toBe(100);
  });

  it("keeps same-named parks that are far apart (different suburbs)", () => {
    const out = dedupeParkAmenities([
      park("Rose Garden", -37.78, 144.95, 100),
      park("Rose Garden", -37.82, 144.99, 200), // kilometres away
    ]);
    expect(out).toHaveLength(2);
  });

  it("keeps distinct named parks even when close together", () => {
    const out = dedupeParkAmenities([
      park("Royal Park", -37.78, 144.95, 100),
      park("Princes Park", -37.7802, 144.9502, 120), // ~25 m, different name
    ]);
    expect(out).toHaveLength(2);
  });

  it("merges an unnamed 'park' pin into a nearby named park", () => {
    const out = dedupeParkAmenities([
      park("Royal Park", -37.78, 144.95, 100),
      park("park", -37.7802, 144.9502, 120), // generic, ~25 m
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Royal Park");
  });

  it("leaves non-park amenities untouched and preserves order", () => {
    const input = [
      cafe("A", -37.78, 144.95, 50),
      park("P", -37.78, 144.95, 60),
      cafe("B", -37.79, 144.96, 70),
    ];
    const out = dedupeParkAmenities(input);
    expect(out.map((a) => a.id)).toEqual(["A", "P@-37.78,144.95", "B"]);
  });
});

describe("buildBuyerReport major-project nudge", () => {
  // PIN = [-37.8, 144.97]. ~0.011 deg lat ~= 1.2 km.
  const proj = (name: string, lat: number, lng: number) => ({
    name,
    label: "Metro Tunnel (new underground station)",
    status: "opening 2025",
    lat,
    lng,
    sourceUrl: "https://bigbuild.vic.gov.au/projects/metro-tunnel",
  });

  it("flags the nearest project within ~1.5 km, with distance + a no-price caveat", () => {
    const r = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: POIS,
      majorProjects: [proj("Parkville", -37.805, 144.97), proj("Faraway", -37.86, 144.97)],
      generatedAt: "t",
    });
    const f = r.findings.find((x) => x.id === "major-project-nearby");
    expect(f).toBeTruthy();
    expect(f?.summary).toContain("Parkville");
    expect(f?.summary).not.toContain("Faraway");
    expect(f?.caveat).toMatch(/not a prediction of prices/i);
    expect(f?.sourceRefs?.[0]?.url).toMatch(/bigbuild\.vic\.gov\.au/);
  });

  it("omits the finding when nothing is within range", () => {
    const r = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: POIS,
      majorProjects: [proj("Faraway", -37.86, 144.97)],
      generatedAt: "t",
    });
    expect(r.findings.find((x) => x.id === "major-project-nearby")).toBeFalsy();
  });

  it("omits the finding when no projects are supplied", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, generatedAt: "t" });
    expect(r.findings.find((x) => x.id === "major-project-nearby")).toBeFalsy();
  });
});

describe("parcel-level planning lens (P1-5)", () => {
  const hoOverlay: PlanningOverlayAt = {
    code: "HO123",
    parent: "HO",
    description: "Heritage Overlay (HO123)",
    asAt: "2020-02-06",
  };
  const planningAt = (overlays: PlanningOverlayAt[] = []): PlanningAt => ({
    zone: {
      code: "GRZ1",
      parent: "GRZ",
      description: "General Residential Zone - Schedule 1",
      lga: "Test LGA",
      gazetted: true,
      asAt: "2014-06-13",
    },
    overlays,
    checkedAt: "2026-06-10",
    source: "wfs",
  });
  /** SA2 place with material heritage + conservation area shares. */
  const placeWithShares = (): Place => {
    const base = samplePlace();
    return {
      ...base,
      context: {
        ...base.context,
        planning: {
          heritageOverlayPct: 30,
          sourceId: "vic-planning-overlays",
          period: "current",
          overlays: { PAO: 4, VPO: 12 },
        },
      },
    };
  };

  it("emits a neutral parcel-geography zone finding with the group meaning + as-at", () => {
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([hoOverlay]), generatedAt: "t",
    });
    const z = r.findings.find((f) => f.id === "planning-zone");
    expect(z).toBeTruthy();
    expect(z?.kind).toBe("neutral");
    expect(z?.geography).toBe("parcel");
    // Plain words lead; the code follows in parentheses, never the lead.
    expect(z?.title).toBe("Zoning here: General Residential Zone - Schedule 1 (GRZ1)");
    expect(z?.summary).toMatch(/residential/i);
    // The vintage rides on `asAt` (rendered in full variants only) - the body
    // sentence stays date-free so the live glimpse never shows it.
    expect(z?.summary).not.toMatch(/as at/i);
    expect(z?.asAt).toBe("2014-06-13");
    expect(z?.sourceRefs?.length ?? 0).toBeGreaterThan(0);
  });

  it("a parcel HO answer REPLACES the SA2 heritage area-share finding", () => {
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: placeWithShares(), pois: POIS,
      planning: planningAt([hoOverlay]), generatedAt: "t",
    });
    const ho = r.findings.find((f) => f.id === "parcel-overlay-HO123");
    expect(ho).toBeTruthy();
    expect(ho?.kind).toBe("verify");
    expect(ho?.geography).toBe("parcel");
    // Plain-first title: meaning leads, the proper name + code in parentheses.
    expect(ho?.title).toBe(
      "Changes to the outside of this home need a heritage permit (Heritage Overlay HO123)"
    );
    // Title carries the code; the body sentence is code-free plain English and
    // the vintage rides on `asAt` (full-report rendering only).
    expect(ho?.summary).not.toContain("HO123");
    expect(ho?.summary).not.toMatch(/as at/i);
    expect(ho?.asAt).toBe("2020-02-06");
    // The SA2 area-share findings for the same overlay families are suppressed.
    expect(r.findings.find((f) => f.id === "heritage-overlay")).toBeFalsy();
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeFalsy();
  });

  it("a parcel-clear answer suppresses the SA2 share findings and emits a dated all-clear", () => {
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: placeWithShares(), pois: POIS,
      planning: planningAt([]), generatedAt: "t",
    });
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeFalsy();
    expect(r.findings.find((f) => f.id === "heritage-overlay")).toBeFalsy();
    const clear = r.findings.find((f) => f.id === "parcel-overlays-clear");
    expect(clear).toBeTruthy();
    expect(clear?.kind).toBe("neutral");
    // Plain-language copy: what we checked, in human words.
    expect(clear?.title).toBe("No major planning restrictions here");
    expect(clear?.summary).toMatch(/planning rules that matter most when buying/);
    expect(clear?.summary).toMatch(/None applies at this exact spot/);
    // P1-2 negative-finding convention: dated all-clear (vintage on `asAt`,
    // shown in full variants) + absence-not-a-guarantee caveat.
    expect(clear?.asAt).toBe("2026-06-10");
    expect(clear?.summary).not.toMatch(/as at/i);
    expect(clear?.caveat).toMatch(/not a guarantee/i);
  });

  it("falls back to the SA2 area-share findings when the lens is null", () => {
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: placeWithShares(), pois: POIS,
      planning: null, generatedAt: "t",
    });
    expect(r.findings.find((f) => f.id === "heritage-overlay")).toBeTruthy();
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeTruthy();
    expect(r.findings.some((f) => f.id.startsWith("parcel-overlay") || f.id === "planning-zone")).toBe(false);
  });

  it("ignores planning input in sa2 mode (a centroid is not a property)", () => {
    const r = buildBuyerReport({
      mode: "sa2",
      lat: PIN.lat, lng: PIN.lng, place: placeWithShares(), pois: POIS,
      planning: planningAt([hoOverlay]), generatedAt: "t",
    });
    expect(r.findings.find((f) => f.id === "planning-zone")).toBeFalsy();
    expect(r.findings.find((f) => f.id === "parcel-overlay-HO123")).toBeFalsy();
    // SA2 fallbacks stay.
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeTruthy();
  });

  it("a zone-less lookup success never suppresses the SA2 fallback", () => {
    const offScheme: PlanningAt = { zone: null, overlays: [], checkedAt: "2026-06-10", source: "wfs" };
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: placeWithShares(), pois: POIS,
      planning: offScheme, generatedAt: "t",
    });
    expect(r.findings.find((f) => f.id === "conservation-overlays")).toBeTruthy();
    expect(r.findings.find((f) => f.id === "parcel-overlays-clear")).toBeFalsy();
  });

  it("buckets non-whitelisted overlays into one neutral line, still reporting the all-clear", () => {
    const po: PlanningOverlayAt = {
      code: "PO12", parent: "PO", description: "Parking Overlay - Precinct 12", asAt: "2013-04-19",
    };
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([po]), generatedAt: "t",
    });
    expect(r.findings.find((f) => f.id === "parcel-overlay-PO12")).toBeFalsy(); // never a verify
    const other = r.findings.find((f) => f.id === "parcel-overlay-other");
    expect(other?.kind).toBe("neutral");
    expect(other?.title).toBe("Other council rules here");
    // Plain words lead; the control's full name rides in parentheses, no raw
    // overlay code in the body.
    expect(other?.summary).toMatch(/additional council rules/);
    expect(other?.summary).toContain("(Parking Overlay - Precinct 12)");
    expect(other?.summary).toMatch(/rarely affect everyday buyers/);
    const clear = r.findings.find((f) => f.id === "parcel-overlays-clear");
    expect(clear).toBeTruthy();
    expect(clear?.summary).toMatch(/Some minor rules do apply - see 'Other council rules here'/);
  });

  it("a PAO at the exact point is high severity and tops the priority checks", () => {
    const pao: PlanningOverlayAt = {
      code: "PAO1", parent: "PAO", description: "Public Acquisition Overlay - Schedule 1", asAt: "2010-01-01",
    };
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([pao]), generatedAt: "t",
    });
    const f = r.findings.find((x) => x.id === "parcel-overlay-PAO1");
    expect(f?.severity).toBe("high");
    expect(r.priorityChecks.some((x) => x.id === "parcel-overlay-PAO1")).toBe(true);
  });

  it("threads the user's parcel confirmation onto report.location verbatim", () => {
    const confirmedParcel = { areaM2: 652.4, confirmedAt: "2026-06-10T01:02:03.000Z" };
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      confirmedParcel, generatedAt: "t",
    });
    expect(r.location.confirmedParcel).toEqual(confirmedParcel);
    const none = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS, generatedAt: "t" });
    expect(none.location.confirmedParcel).toBeUndefined();
  });

  it("parcel-geography findings carry the wrong-lot caveat while the lot is unconfirmed", () => {
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([hoOverlay]), generatedAt: "t",
    });
    for (const id of ["planning-zone", "parcel-overlay-HO123"]) {
      const f = r.findings.find((x) => x.id === id);
      expect(f?.caveat, id).toContain(UNCONFIRMED_PARCEL_CAVEAT);
    }
    const clearReport = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([]), generatedAt: "t",
    });
    expect(
      clearReport.findings.find((x) => x.id === "parcel-overlays-clear")?.caveat
    ).toContain(UNCONFIRMED_PARCEL_CAVEAT);
  });

  it("the wrong-lot caveat disappears once the parcel is confirmed (base caveat stays)", () => {
    const confirmedParcel = { areaM2: 652.4, confirmedAt: "2026-06-10T01:02:03.000Z" };
    const r = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([hoOverlay]), confirmedParcel, generatedAt: "t",
    });
    for (const id of ["planning-zone", "parcel-overlay-HO123"]) {
      const f = r.findings.find((x) => x.id === id);
      expect(f?.caveat, id).toBeTruthy();
      expect(f?.caveat, id).not.toContain(UNCONFIRMED_PARCEL_CAVEAT);
    }
    const clearReport = buildBuyerReport({
      lat: PIN.lat, lng: PIN.lng, place: samplePlace(), pois: POIS,
      planning: planningAt([]), confirmedParcel, generatedAt: "t",
    });
    expect(
      clearReport.findings.find((x) => x.id === "parcel-overlays-clear")?.caveat
    ).not.toContain(UNCONFIRMED_PARCEL_CAVEAT);
  });
});
