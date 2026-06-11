/**
 * Schools lens: the address-level government school-zone match (pin mode) and
 * its honest "not matched / needs an exact address" fallback.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { resolveSchoolZones } from "../school-zones";
import { getSourcesByIds } from "../source-manifest";
import type { BuyerFinding } from "./types";
import { SCHOOL_ZONE_REF } from "./helpers";
import type { EngineCtx } from "./context";

/**
 * 7) School zones. Address-level: which Victorian Government school zone(s)
 *    contain the pin (point-in-polygon, never from an SA2 centroid). Resolved
 *    only in pin mode when the zone set is loaded; otherwise an honest
 *    "not matched here" fallback. Context only, never scored.
 */
export function pushSchoolZoneFindings(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode, point } = ctx;
  const zones =
    point && mode === "pin" && input.schoolZones
      ? resolveSchoolZones(point, input.schoolZones)
      : { primary: null, secondary: null };
  if (zones.primary || zones.secondary) {
    const zoneYear = input.schoolZones?.year;
    const parts: string[] = [];
    if (zones.primary) parts.push(`primary at ${zones.primary}`);
    if (zones.secondary) parts.push(`secondary (Year 7) at ${zones.secondary}`);
    findings.push({
      id: "school-zones",
      kind: "neutral",
      severity: "info",
      title: "Government school zones for this location",
      summary: `This location falls in the ${zoneYear ? `${zoneYear} ` : ""}Victorian Government school zone for ${parts.join(", and ")}.`,
      whyItMatters:
        "Your address-based zone is the government school you are guaranteed a place at; it shapes schooling options and can affect resale appeal to families.",
      verifyAction:
        "Confirm the exact address on findmyschool.vic.gov.au - zones are set each year and the boundary can move.",
      confidence: "high",
      geography: "pin",
      caveat:
        "Official DataVic zones simplified (~30 m) for display; a result near a boundary is indicative - confirm the exact address on findmyschool.vic.gov.au. Selective-entry, specialist and non-government schools are not zoned.",
      sourceRefs: getSourcesByIds(["vic-school-zones"]),
    });
  } else {
    findings.push({
      id: "school-zones",
      kind: "unavailable",
      severity: "info",
      title:
        mode === "pin" ? "No government school zone matched here" : "School zones need an exact address",
      summary:
        mode === "pin"
          ? "We could not match a Victorian Government primary or secondary zone to this exact point (it may be outside Greater Melbourne, or in an unzoned/selective area)."
          : "Official school-zone matching needs a dropped pin - it is address-level, not an area average.",
      verifyAction:
        "Confirm the address on findmyschool.vic.gov.au if schools matter to you.",
      confidence: "unknown",
      geography: "unknown",
      caveat:
        "Government school zones change yearly and must be checked at the exact address; selective-entry and non-government schools are not zoned.",
      sourceRefs: [SCHOOL_ZONE_REF],
    });
  }
}
