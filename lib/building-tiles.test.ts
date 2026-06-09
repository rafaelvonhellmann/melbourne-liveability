import { describe, it, expect } from "vitest";
import { lngLatToTile, tilePath, tilesForPin, estimateHeight, BUILDING_TILE_Z } from "./building-tiles";

describe("building-tiles", () => {
  it("maps a Melbourne lng/lat to an integer z14 tile in range", () => {
    const { x, y } = lngLatToTile(144.9631, -37.8136);
    const n = 2 ** BUILDING_TILE_Z;
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(n);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(n);
  });

  it("returns the pin tile + 8 neighbours", () => {
    const tiles = tilesForPin(144.9631, -37.8136);
    expect(tiles).toHaveLength(9);
    const { x, y } = lngLatToTile(144.9631, -37.8136);
    expect(tiles).toContainEqual({ x, y });
    expect(tiles).toContainEqual({ x: x + 1, y: y + 1 });
    expect(tiles).toContainEqual({ x: x - 1, y: y - 1 });
  });

  it("builds a root-relative tile path", () => {
    expect(tilePath(14790, 10058)).toBe("/data/buildings/14/14790/10058.json");
  });

  it("estimates height from tags (height, then levels, then default)", () => {
    expect(estimateHeight({ height: "12" })).toBe(12);
    expect(estimateHeight({ "building:levels": "3" })).toBeCloseTo(9.6, 5);
    expect(estimateHeight({})).toBe(6);
    expect(estimateHeight(null)).toBe(6);
    expect(estimateHeight({ height: "9999" })).toBe(400); // capped
  });
});
