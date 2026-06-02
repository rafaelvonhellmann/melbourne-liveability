import { describe, it, expect } from "vitest";
import { sunAspect, compass } from "../lib/sun";

describe("sunAspect (Melbourne, lat -37.81)", () => {
  it("summer: sun rises ~ESE, long day, high noon sun", () => {
    const s = sunAspect(-37.81).summer;
    expect(s.sunriseAz).toBeGreaterThan(110);
    expect(s.sunriseAz).toBeLessThan(130); // ~120
    expect(s.sunsetAz).toBeCloseTo(360 - s.sunriseAz, 5);
    expect(s.dayHours).toBeGreaterThan(14); // ~14.6 h
    expect(s.noonElevation).toBeGreaterThan(70); // ~76 deg
  });

  it("winter: sun rises ~ENE, short day, low noon sun", () => {
    const w = sunAspect(-37.81).winter;
    expect(w.sunriseAz).toBeGreaterThan(50);
    expect(w.sunriseAz).toBeLessThan(70); // ~60
    expect(w.dayHours).toBeLessThan(10); // ~9.4 h
    expect(w.noonElevation).toBeLessThan(35); // ~29 deg
  });

  it("hemisphere drives the sun side", () => {
    expect(sunAspect(-37.81).sunSide).toBe("north");
    expect(sunAspect(40).sunSide).toBe("south");
  });
});

describe("compass", () => {
  it("maps azimuth to a 16-point label", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(180)).toBe("S");
    expect(compass(270)).toBe("W");
    expect(compass(45)).toBe("NE");
    expect(compass(359)).toBe("N");
  });
});
