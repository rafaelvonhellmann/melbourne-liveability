import { describe, expect, it } from "vitest";
import type { Feature, Point } from "geojson";
import {
  isGpClinic,
  isNdisProvider,
  isPathologyLab,
  isPlaceOfWorship,
  isCommunityCentre,
  dedupeFeatures,
  poiDedupeKey,
  scoredGpPoints,
} from "@/scripts/lib/poi-classify";

function poi(pinType: string, osmUrl: string, lon = 145, lat = -37): Feature<Point> {
  return {
    type: "Feature",
    properties: { pinType, name: pinType, osmUrl },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

describe("isGpClinic", () => {
  it("matches a GP / doctors node", () => {
    expect(isGpClinic({ amenity: "doctors" })).toBe(true);
    expect(isGpClinic({ amenity: "clinic" })).toBe(true);
    expect(isGpClinic({ healthcare: "centre" })).toBe(true);
  });

  it("excludes hospitals", () => {
    expect(isGpClinic({ amenity: "hospital" })).toBe(false);
  });

  it("excludes pathology / lab / imaging sites (bug 7)", () => {
    expect(isGpClinic({ healthcare: "laboratory" })).toBe(false);
    expect(isGpClinic({ healthcare: "sample_collection" })).toBe(false);
    expect(isGpClinic({ healthcare: "radiology" })).toBe(false);
    // amenity=clinic but a pathology speciality must NOT count as a GP pin.
    expect(
      isGpClinic({ amenity: "clinic", "healthcare:speciality": "pathology" })
    ).toBe(false);
  });
});

describe("isNdisProvider", () => {
  it("matches explicit NDIS / disability signals", () => {
    expect(isNdisProvider({ name: "Acme NDIS Supports" })).toBe(true);
    expect(isNdisProvider({ name: "National Disability Services" })).toBe(true);
    expect(isNdisProvider({ "social_facility:for": "disabled" })).toBe(true);
    expect(
      isNdisProvider({ social_facility: "group_home", operator: "Disability Care" })
    ).toBe(true);
  });

  it("does NOT treat a bare social_facility=day_care as NDIS (bug 6)", () => {
    expect(isNdisProvider({ social_facility: "day_care" })).toBe(false);
    expect(isNdisProvider({ social_facility: "day_care", name: "Little Stars Childcare" })).toBe(
      false
    );
  });

  it("ignores unrelated places", () => {
    expect(isNdisProvider({ amenity: "cafe", name: "Corner Cafe" })).toBe(false);
  });
});

describe("isPathologyLab", () => {
  it("matches labs and collection centres", () => {
    expect(isPathologyLab({ healthcare: "laboratory" })).toBe(true);
    expect(isPathologyLab({ "healthcare:speciality": "diagnostic" })).toBe(true);
    expect(isPathologyLab({ name: "Melbourne Pathology" })).toBe(true);
  });
});

describe("isPlaceOfWorship (all faiths)", () => {
  it("matches any place_of_worship regardless of religion", () => {
    expect(isPlaceOfWorship({ amenity: "place_of_worship", religion: "christian" })).toBe(true);
    expect(isPlaceOfWorship({ amenity: "place_of_worship", religion: "muslim" })).toBe(true);
    expect(isPlaceOfWorship({ amenity: "place_of_worship" })).toBe(true);
  });
  it("ignores non-worship places", () => {
    expect(isPlaceOfWorship({ amenity: "cafe" })).toBe(false);
    expect(isPlaceOfWorship({})).toBe(false);
  });
});

describe("isCommunityCentre (community + cultural)", () => {
  it("matches community, social and arts centres", () => {
    expect(isCommunityCentre({ amenity: "community_centre" })).toBe(true);
    expect(isCommunityCentre({ amenity: "social_centre" })).toBe(true);
    expect(isCommunityCentre({ amenity: "arts_centre" })).toBe(true);
  });
  it("ignores unrelated venues", () => {
    expect(isCommunityCentre({ amenity: "theatre" })).toBe(false);
    expect(isCommunityCentre({ amenity: "place_of_worship" })).toBe(false);
    expect(isCommunityCentre({})).toBe(false);
  });
});

describe("dedupeFeatures / poiDedupeKey (bug 4)", () => {
  it("keeps the same OSM element under two different categories", () => {
    const url = "https://www.openstreetmap.org/node/1";
    const out = dedupeFeatures([poi("gp", url), poi("pathology_lab", url)]);
    expect(out).toHaveLength(2);
    expect(out.map((f) => (f.properties as { pinType: string }).pinType).sort()).toEqual([
      "gp",
      "pathology_lab",
    ]);
  });

  it("collapses true duplicates (same category + same element)", () => {
    const url = "https://www.openstreetmap.org/node/2";
    const out = dedupeFeatures([poi("gp", url), poi("gp", url)]);
    expect(out).toHaveLength(1);
  });

  it("namespaces the dedupe key by pinType", () => {
    const u = "https://www.openstreetmap.org/node/3";
    expect(poiDedupeKey({ pinType: "gp", osmUrl: u }, "145,-37")).not.toBe(
      poiDedupeKey({ pinType: "pathology_lab", osmUrl: u }, "145,-37")
    );
  });
});

describe("scoredGpPoints (locked scored GP = nodes only)", () => {
  it("counts doctors/clinic NODES and EXCLUDES ways + non-GP", () => {
    const pts = scoredGpPoints({
      elements: [
        { type: "node", lat: -37.8, lon: 144.9, tags: { amenity: "doctors" } },
        { type: "node", lat: -37.81, lon: 144.91, tags: { amenity: "clinic" } },
        // way (clinic mapped as building) — intentionally excluded from the score
        { type: "way", center: { lat: -37.82, lon: 144.92 }, tags: { amenity: "clinic" } },
        // non-GP node
        { type: "node", lat: -37.83, lon: 144.93, tags: { amenity: "hospital" } },
        { type: "node", lat: -37.84, lon: 144.94, tags: { amenity: "doctors" } },
      ],
    });
    expect(pts).toHaveLength(3);
    expect(pts).toContainEqual([144.9, -37.8]);
    expect(pts).not.toContainEqual([144.92, -37.82]); // the way is excluded
  });

  it("handles empty / null input", () => {
    expect(scoredGpPoints(null)).toEqual([]);
    expect(scoredGpPoints({})).toEqual([]);
  });
});
