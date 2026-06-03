import { describe, it, expect } from "vitest";
import { nearestBusStop, type BusStop } from "../lib/transit";

const PIN: [number, number] = [144.965, -37.81];

describe("nearestBusStop", () => {
  it("returns nearest distance, that stop's route count, and stops within 400 m", () => {
    const stops: BusStop[] = [
      [144.965, -37.8102, 8], // ~22 m, 8 routes
      [144.965, -37.8106, 3], // ~66 m, 3 routes
      [144.965, -37.79, 1], // ~2.2 km
    ];
    const r = nearestBusStop(PIN, stops);
    expect(r).not.toBeNull();
    expect(r!.distanceM).toBeLessThan(40);
    expect(r!.routeCount).toBe(8);
    expect(r!.stopsWithin400).toBe(2); // the two close stops; the 2.2 km one excluded
  });

  it("returns null for empty / missing input", () => {
    expect(nearestBusStop(PIN, [])).toBeNull();
    expect(nearestBusStop(PIN, null)).toBeNull();
  });
});
