import { describe, it, expect } from "vitest";
import { parseWaterwayHealth } from "./water-quality";

describe("parseWaterwayHealth", () => {
  it("averages CURRENT_1 across local reaches into a 0-100 score + band", () => {
    expect(
      parseWaterwayHealth({
        features: [{ attributes: { CURRENT_1: 0.185 } }, { attributes: { CURRENT_1: 0.215 } }],
      })
    ).toEqual({ score: 20, band: "low" });
  });

  it("bands the averaged score", () => {
    expect(parseWaterwayHealth({ features: [{ attributes: { CURRENT_1: 0.5 } }] })?.band).toBe("moderate");
    expect(parseWaterwayHealth({ features: [{ attributes: { CURRENT_1: 0.7 } }] })?.band).toBe("high");
    expect(parseWaterwayHealth({ features: [{ attributes: { CURRENT_1: 0.9 } }] })?.band).toBe("very high");
  });

  it("returns null when no reach with a usable score is present", () => {
    expect(parseWaterwayHealth({ features: [] })).toBeNull();
    expect(parseWaterwayHealth({})).toBeNull();
    expect(parseWaterwayHealth({ features: [{ attributes: { CURRENT_1: "n/a" } }] })).toBeNull();
  });
});
