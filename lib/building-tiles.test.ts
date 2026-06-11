import { describe, it, expect } from "vitest";
import {
  lngLatToTile,
  tilePath,
  tileBounds,
  tilesForPin,
  estimateHeight,
  BUILDING_TILE_Z,
} from "./building-tiles";

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

  it("tileBounds round-trips through lngLatToTile", () => {
    const { x, y } = lngLatToTile(144.9631, -37.8136);
    const b = tileBounds(x, y);
    expect(b.west).toBeLessThan(b.east);
    expect(b.south).toBeLessThan(b.north);
    const centre = lngLatToTile((b.west + b.east) / 2, (b.south + b.north) / 2);
    expect(centre).toEqual({ x, y });
  });

  describe("tilesForPin with a shadow radius (skips far neighbours)", () => {
    const { x, y } = lngLatToTile(144.9631, -37.8136);
    const b = tileBounds(x, y);

    it("pin mid-tile: only the pin tile (z14 tile is ~2.4 km, radius 350 m)", () => {
      const tiles = tilesForPin((b.west + b.east) / 2, (b.south + b.north) / 2, 350);
      expect(tiles).toEqual([{ x, y }]);
    });

    it("pin near the NW corner: 4 tiles incl. the diagonal neighbour", () => {
      // ~44 m east of the west edge, ~55 m south of the north edge.
      const tiles = tilesForPin(b.west + 0.0005, b.north - 0.0005, 350);
      expect(tiles).toHaveLength(4);
      expect(tiles).toContainEqual({ x, y });
      expect(tiles).toContainEqual({ x: x - 1, y });
      expect(tiles).toContainEqual({ x, y: y - 1 });
      expect(tiles).toContainEqual({ x: x - 1, y: y - 1 });
    });

    it("pin near the west edge, mid-height: 2 tiles", () => {
      const tiles = tilesForPin(b.west + 0.0005, (b.south + b.north) / 2, 350);
      expect(tiles).toHaveLength(2);
      expect(tiles).toContainEqual({ x, y });
      expect(tiles).toContainEqual({ x: x - 1, y });
    });

    it("without a radius the full 3x3 block is preserved", () => {
      expect(tilesForPin((b.west + b.east) / 2, (b.south + b.north) / 2)).toHaveLength(9);
    });
  });

  it("estimates height from tags (height, then levels, then default)", () => {
    expect(estimateHeight({ height: "12" })).toBe(12);
    expect(estimateHeight({ "building:levels": "3" })).toBeCloseTo(9.6, 5);
    expect(estimateHeight({})).toBe(6);
    expect(estimateHeight(null)).toBe(6);
    expect(estimateHeight({ height: "9999" })).toBe(400); // capped
  });
});
