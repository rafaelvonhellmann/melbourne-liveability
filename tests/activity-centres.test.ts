import { describe, it, expect } from "vitest";
import { activityCentreAt, type ActivityCentreFeature } from "../lib/activity-centres";

function acz(z: string, lga?: string): ActivityCentreFeature {
  return {
    type: "Feature",
    properties: { z, lga },
    geometry: {
      type: "Polygon",
      coordinates: [[[144, -37], [145, -37], [145, -38], [144, -38], [144, -37]]],
    },
  };
}

const INSIDE: [number, number] = [144.5, -37.5];
const OUTSIDE: [number, number] = [140, -30];

describe("activityCentreAt", () => {
  it("returns the ACZ containing the point with zone + lga", () => {
    expect(activityCentreAt(INSIDE, [acz("ACZ1", "MERRI-BEK")])).toEqual({ zone: "ACZ1", lga: "MERRI-BEK" });
  });
  it("returns null outside every zone", () => {
    expect(activityCentreAt(OUTSIDE, [acz("ACZ1")])).toBeNull();
  });
  it("returns null for empty / missing input", () => {
    expect(activityCentreAt(INSIDE, [])).toBeNull();
    expect(activityCentreAt(INSIDE, null)).toBeNull();
  });
});
