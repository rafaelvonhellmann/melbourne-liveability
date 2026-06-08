import { describe, it, expect } from "vitest";
import { highestAnef } from "./aircraft-noise";

describe("highestAnef", () => {
  it("returns the highest ANEF band the point is inside (nested contours)", () => {
    expect(
      highestAnef([
        { anef: 35, hit: false },
        { anef: 30, hit: true },
        { anef: 25, hit: true },
        { anef: 20, hit: true },
      ])
    ).toBe(30);
  });

  it("returns the outer band when only it is hit", () => {
    expect(
      highestAnef([
        { anef: 35, hit: false },
        { anef: 30, hit: false },
        { anef: 25, hit: false },
        { anef: 20, hit: true },
      ])
    ).toBe(20);
  });

  it("returns 0 when outside all contours", () => {
    expect(highestAnef([{ anef: 20, hit: false }])).toBe(0);
  });
});
