import { describe, expect, it } from "vitest";
import type { Feature, Point } from "geojson";
import {
  isGpClinic,
  isNdisProvider,
  isPathologyLab,
  dedupeFeatures,
  poiDedupeKey,
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
