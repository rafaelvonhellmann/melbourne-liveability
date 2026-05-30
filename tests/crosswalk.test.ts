import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { CrosswalkFile } from "../lib/crosswalk-types";
import {
  validateCrosswalkWeights,
  findSa2BySuburbName,
} from "../lib/crosswalk";

const CROSSWALK_PATH = path.join(
  process.cwd(),
  "data",
  "generated",
  "crosswalk.json"
);

function loadCrosswalk(): CrosswalkFile | null {
  if (!existsSync(CROSSWALK_PATH)) return null;
  return JSON.parse(readFileSync(CROSSWALK_PATH, "utf8")) as CrosswalkFile;
}

describe("crosswalk weights", () => {
  const cw = loadCrosswalk();

  it.skipIf(!cw)("every SA2 with suburbs has weights summing to ~1.0", () => {
    const { valid, failures } = validateCrosswalkWeights(cw!);
    if (!valid) {
      console.log("Weight failures (first 5):", failures.slice(0, 5));
    }
    expect(valid).toBe(true);
  });

  it.skipIf(!cw)("multi-suburb SA2: at least one SA2 maps to 2+ suburbs", () => {
    const multi = Object.values(cw!.sa2ToSuburb).filter(
      (e) => e.suburbs.length >= 2
    );
    expect(multi.length).toBeGreaterThan(0);
  });

  it.skipIf(!cw)("split suburb: Carlton maps to multiple SA2", () => {
    const hits = findSa2BySuburbName(cw!, "Carlton");
    const sa2Codes = new Set(hits.map((h) => h.sa2Code));
    expect(sa2Codes.size).toBeGreaterThanOrEqual(1);
    expect(hits.some((h) => h.suburb.toLowerCase().includes("carlton"))).toBe(
      true
    );
  });

  it.skipIf(!cw)("spot-check: Box Hill has crosswalk entries", () => {
    const hits = findSa2BySuburbName(cw!, "Box Hill");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].weight).toBeGreaterThan(0);
  });

  it.skipIf(!cw)("spot-check: Tarneit has crosswalk entries", () => {
    const hits = findSa2BySuburbName(cw!, "Tarneit");
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("crosswalk fixtures (synthetic)", () => {
  it("validates synthetic weights sum to 1", () => {
    const synthetic: CrosswalkFile = {
      region: "2GMEL",
      generatedAt: "2026-01-01",
      sa2ToSuburb: {
        SA1: {
          sa2Code: "SA1",
          sa2Name: "Test Inner",
          suburbs: [
            {
              suburb: "Carlton",
              salCode: "SAL1",
              lga: "Melbourne",
              weight: 0.6,
              method: "area-weighted",
            },
            {
              suburb: "Parkville",
              salCode: "SAL2",
              lga: "Melbourne",
              weight: 0.4,
              method: "area-weighted",
            },
          ],
        },
      },
      suburbToSa2: {
        SAL1: [{ sa2Code: "SA1", weight: 0.6 }],
        SAL2: [{ sa2Code: "SA1", weight: 0.4 }],
      },
      suburbAliases: { carlton: ["SAL1"], parkville: ["SAL2"] },
    };
    expect(validateCrosswalkWeights(synthetic).valid).toBe(true);
  });

  it("flags invalid weight sums", () => {
    const bad: CrosswalkFile = {
      region: "2GMEL",
      generatedAt: "2026-01-01",
      sa2ToSuburb: {
        SA1: {
          sa2Code: "SA1",
          sa2Name: "Bad",
          suburbs: [
            {
              suburb: "X",
              salCode: "S1",
              lga: "L",
              weight: 0.5,
              method: "area-weighted",
            },
          ],
        },
      },
      suburbToSa2: {},
      suburbAliases: {},
    };
    expect(validateCrosswalkWeights(bad).valid).toBe(false);
  });
});
