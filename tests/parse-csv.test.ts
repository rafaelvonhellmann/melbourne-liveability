import { describe, it, expect } from "vitest";
import { csvTable } from "../scripts/lib/parse-csv.js";

/**
 * Pins the header-trimming behaviour that the Transperth GTFS feed forced:
 * its stops.txt header is "location_type, parent_station, stop_id, ..." with
 * spaces after the commas. Untrimmed headers made every keyed lookup miss and
 * the Perth bake died on the zero-stops guard (run 27417103071).
 */
describe("csvTable", () => {
  it("trims stray whitespace in header cells (Transperth-style feeds)", () => {
    const rows = csvTable("stop_id, stop_lat, stop_lon\n10000,-32.14,116.02\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]["stop_lat"]).toBe("-32.14");
    expect(rows[0]["stop_lon"]).toBe("116.02");
    expect(rows[0][" stop_lat"]).toBeUndefined();
  });

  it("leaves clean headers untouched", () => {
    const rows = csvTable("a,b\n1,2\n");
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });
});
