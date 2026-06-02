import { describe, expect, it } from "vitest";
import type { Feature, Point, Polygon } from "geojson";
import {
  buildBuyerReport,
  findContainingSa2,
  getNearbyAmenities,
  dedupeParkAmenities,
  BUYER_DISCLAIMER,
} from "../lib/buyer-report";
import type { Place } from "../lib/types";

const PIN = { lat: -37.8, lng: 144.97 };

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
      equity: { irsadDecile: 7, irsdDecile: 6, sourceId: "abs", period: "2021" },
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
    expect(school?.kind).toBe("verify");
    expect(school?.confidence).toBe("unknown");

    // Never claims a definitive parcel-level flood/bushfire status.
    const hazard = report.findings.find((f) => f.id === "hazard-overlays");
    expect(hazard).toBeTruthy();
    expect(hazard?.verifyAction).toMatch(/council|VicPlan|insurance/i);
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

  it("defaults to straight-line accessMode when no isochrone is supplied", () => {
    expect(report.accessMode).toBe("straight");
  });
});

describe("buildBuyerReport with a walk isochrone (paid-tier precise mode)", () => {
  // A box around ONLY the far GP (~2.22 km away) — which the 1.2 km straight-line
  // radius excludes — and excluding the near supermarket (~0.56 km). Proves the
  // nearby set is decided by polygon containment, not crow-flies radius.
  const isochrone: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [144.965, -37.785],
        [144.975, -37.785],
        [144.975, -37.775],
        [144.965, -37.775],
        [144.965, -37.785],
      ],
    ],
  };

  it("filters nearby amenities by containment and flags accessMode=precise", () => {
    const report = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: POIS,
      isochrone,
      generatedAt: "t",
    });
    expect(report.accessMode).toBe("precise");
    const cats = Object.keys(report.amenityCountsByCategory);
    expect(cats).toContain("gp"); // inside the isochrone (radius would drop it at 2.2 km)
    expect(cats).not.toContain("supermarket"); // outside it (radius would keep it at 0.56 km)
  });

  it("swaps the amenity caveat to the street-network wording in precise mode", () => {
    const report = buildBuyerReport({
      lat: PIN.lat,
      lng: PIN.lng,
      place: samplePlace(),
      pois: POIS,
      isochrone,
      generatedAt: "t",
    });
    const amenityFinding = report.findings.find(
      (f) => f.geography === "poi-radius" && f.caveat
    );
    expect(amenityFinding?.caveat).toMatch(/street-network walk isochrone/i);
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
    expect(hz?.title).toMatch(/no significant/i);
  });

  it("raises a red_flag when overlay share is elevated", () => {
    const r = buildBuyerReport({ lat: PIN.lat, lng: PIN.lng, place: placeWithHazards(0, 20), pois: POIS, generatedAt: "t" });
    expect(r.findings.find((f) => f.id === "hazard-overlays")?.kind).toBe("red_flag");
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
