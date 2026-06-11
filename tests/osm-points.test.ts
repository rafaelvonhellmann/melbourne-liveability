import { describe, it, expect } from "vitest";
import {
  osmPointOf,
  osmPoints,
  isChildcareAmenity,
  type OsmEl,
} from "../scripts/lib/osm-points";

// Fixtures mirror real Overpass `out center` output for the three element
// shapes the nwr fetches return (AMENITY-AUDIT.md fixes: ways/relations were
// previously missed entirely for cafes/pharmacies/gyms and schools).
const cafeNode: OsmEl = {
  type: "node",
  id: 1,
  lat: -37.8,
  lon: 144.96,
  tags: { amenity: "cafe", name: "Node Cafe" },
};
const cafeWay: OsmEl = {
  type: "way",
  id: 2,
  center: { lat: -37.81, lon: 144.97 },
  tags: { amenity: "cafe", building: "yes", name: "Building Cafe" },
};
const schoolRelation: OsmEl = {
  type: "relation",
  id: 3,
  center: { lat: -37.92, lon: 145.0 },
  tags: { amenity: "school", type: "multipolygon", name: "Brighton Grammar" },
};
const childcareNode: OsmEl = {
  type: "node",
  id: 4,
  lat: -37.85,
  lon: 144.7,
  tags: { amenity: "childcare", name: "Tarneit Early Learning" },
};
const noCoords: OsmEl = { type: "way", id: 5, tags: { amenity: "cafe" } };

describe("osmPointOf", () => {
  it("decodes a node from inline lat/lon", () => {
    expect(osmPointOf(cafeNode)).toEqual([144.96, -37.8]);
  });

  it("decodes a way from its `out center` centroid", () => {
    expect(osmPointOf(cafeWay)).toEqual([144.97, -37.81]);
  });

  it("decodes a multipolygon relation from its `out center` centroid", () => {
    expect(osmPointOf(schoolRelation)).toEqual([145.0, -37.92]);
  });

  it("returns null when neither inline coords nor center exist", () => {
    expect(osmPointOf(noCoords)).toBeNull();
  });

  it("prefers inline node coords over a center if both appear", () => {
    expect(
      osmPointOf({ lat: -37.7, lon: 144.9, center: { lat: 0, lon: 0 } })
    ).toEqual([144.9, -37.7]);
  });
});

describe("osmPoints", () => {
  const extract = {
    elements: [cafeNode, cafeWay, schoolRelation, childcareNode, noCoords],
  };

  it("keeps nodes, ways and relations; drops coordinate-less elements", () => {
    expect(osmPoints(extract)).toEqual([
      [144.96, -37.8],
      [144.97, -37.81],
      [145.0, -37.92],
      [144.7, -37.85],
    ]);
  });

  it("applies the tag filter across all element types", () => {
    expect(osmPoints(extract, (t) => t.amenity === "cafe")).toEqual([
      [144.96, -37.8],
      [144.97, -37.81],
    ]);
    expect(osmPoints(extract, (t) => t.amenity === "school")).toEqual([
      [145.0, -37.92],
    ]);
  });

  it("handles null / empty extracts", () => {
    expect(osmPoints(null)).toEqual([]);
    expect(osmPoints({})).toEqual([]);
  });
});

describe("isChildcareAmenity", () => {
  it("accepts kindergarten, childcare and preschool", () => {
    expect(isChildcareAmenity({ amenity: "kindergarten" })).toBe(true);
    expect(isChildcareAmenity({ amenity: "childcare" })).toBe(true);
    expect(isChildcareAmenity({ amenity: "preschool" })).toBe(true);
  });

  it("counts the previously discarded childcare node fixture", () => {
    expect(
      osmPoints({ elements: [childcareNode] }, isChildcareAmenity)
    ).toEqual([[144.7, -37.85]]);
  });

  it("rejects schools, missing tags and non-exact values", () => {
    expect(isChildcareAmenity({ amenity: "school" })).toBe(false);
    expect(isChildcareAmenity({})).toBe(false);
    expect(isChildcareAmenity({ amenity: "childcare_centre" })).toBe(false);
    expect(isChildcareAmenity({ childcare: "yes" })).toBe(false);
  });
});
