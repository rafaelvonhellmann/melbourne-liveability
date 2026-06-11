/**
 * Environment lens: sun & aspect (deterministic solar geometry), the water
 * retailer and the nearest EPA air monitor.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { sunAspect } from "../sun";
import { nearestAirSite } from "../epa-air";
import { getSourcesByIds } from "../source-manifest";
import type { BuyerFinding } from "./types";
import { METHODOLOGY_REF } from "./helpers";
import type { EngineCtx } from "./context";

/**
 * 1d) Sun & aspect - proprietary, deterministic solar geometry from the pin's
 *     latitude (no external shade service). Aspect can't be changed, so it's a
 *     real due-diligence factor.
 */
export function pushSunAspectFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, hasPoint } = ctx;
  if (hasPoint) {
    const sun = sunAspect(input.lat as number);
    const sunny = sun.sunSide === "north" ? "North" : "South";
    findings.push({
      id: "sun-aspect",
      kind: "neutral",
      severity: "info",
      title: "Sun & aspect",
      summary: `The midday sun is to the ${sunny.toLowerCase()} here, so ${sunny.toLowerCase()}-facing living areas, windows and yards get the best, warmest light - which way the property faces is what decides it (see the sun diagram).`,
      whyItMatters:
        "Which way the main rooms face decides natural light and winter warmth - and it can't be changed.",
      verifyAction:
        "Visit at the time of day you'd use the main rooms and check which way they face.",
      confidence: "high",
      geography: "pin",
      caveat:
        "Based on the sun's path at this latitude (same for the whole street). Actual light depends on the dwelling's orientation, windows, trees and nearby buildings. Full sun-path detail is in the methodology.",
      sourceRefs: [METHODOLOGY_REF],
    });
  }
}

/**
 * 5i) Water retailer (context, never scored). Which corporation services the
 *     area, from the Vicmap water-corporation boundaries (area-level).
 */
export function pushWaterRetailerFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const water = place?.context?.waterRetailer;
  if (water?.name) {
    findings.push({
      id: "water-retailer",
      kind: "neutral",
      severity: "info",
      title: `Water retailer: ${water.name}`,
      summary: `${water.name} is the water corporation servicing this area - your water and sewerage bills come from them.`,
      verifyAction:
        "Confirm on a current water / rates notice for the exact property; a few boundary streets can differ.",
      confidence: "high",
      geography: "sa2",
      caveat:
        "Resolved from the Vicmap water-corporation boundary at the area level - confirm the exact address on your water bill.",
      sourceRefs: getSourcesByIds(["vic-water-corp"]),
    });
  }
}

/**
 * 5j) Air quality (context, never scored). Nearest EPA monitor + its last
 *     CAPTURED band (dated - air is hourly and this site is static, so we
 *     always point to live AirWatch). Network is sparse, so caveat distance.
 */
export function pushAirQualityFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode, point } = ctx;
  const air =
    point && mode === "pin" && input.epaAir
      ? nearestAirSite([point.lng, point.lat], input.epaAir)
      : null;
  if (air && air.distanceMeters <= 15000) {
    const dist =
      air.distanceMeters < 1000
        ? `${air.distanceMeters} m`
        : `${(air.distanceMeters / 1000).toFixed(1)} km`;
    const when = /^\d{4}-\d{2}/.test(air.since ?? "")
      ? ` (reading ${air.since!.slice(0, 10)})`
      : "";
    findings.push({
      id: "air-quality",
      kind: "neutral",
      severity: "info",
      title: "Air quality monitored nearby",
      summary: air.band
        ? `The nearest EPA air monitor, ${air.name} (~${dist} away), last read ${air.param ?? "air quality"} "${air.band}"${when}.`
        : `The nearest EPA air monitor is ${air.name} (~${dist} away).`,
      whyItMatters:
        "Air quality affects health - it can spike near busy roads and during bushfire-smoke season.",
      verifyAction:
        "Air quality changes hour to hour - check live readings at EPA AirWatch (airquality.epa.vic.gov.au).",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Nearest FIXED EPA monitor - the network is sparse so it may be several km away, and the band is the last hourly reading we captured, NOT live. Check AirWatch for current conditions.",
      sourceRefs: getSourcesByIds(["epa-air"]),
    });
  }
}
