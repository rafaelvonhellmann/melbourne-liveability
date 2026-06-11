/**
 * Summary glue: the deterministic executive summary (headline + subheadline +
 * confidence), the ranked "before you offer" priority checks and the
 * report-level source-manifest aggregation.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import type { Place } from "../types";
import type {
  BuyerConfidence,
  BuyerFinding,
  BuyerFindingSeverity,
  BuyerSourceRef,
  NearbyAmenity,
} from "./types";
import { METHODOLOGY_REF } from "./helpers";

// ---- Executive summary (deterministic template) -----------------------------

export function buildReportSummary(args: {
  findings: BuyerFinding[];
  place: Place | null;
  sa2Name?: string;
  haveNearbyData: boolean;
  reachableEveryday: number;
  overall: number | null;
}): {
  summary: { headline: string; subheadline: string; confidence: BuyerConfidence };
  priorityChecks: BuyerFinding[];
} {
  const { findings, place, sa2Name, haveNearbyData, reachableEveryday, overall } = args;
  const verifyFindings = findings.filter((f) => f.kind === "red_flag" || f.kind === "verify");
  const verifyCount = verifyFindings.length;
  const areaName = place?.name ?? sa2Name ?? "this location";

  let confidence: BuyerConfidence;
  if (!place) confidence = "low";
  else confidence = "medium";

  // "Before you offer, check these first": the most material verify/red_flag
  // items, ranked by severity then by how decision-critical the category is.
  // The report's decision TL;DR (Codex review: lead with the next action, not a
  // count). Unknown ids fall to the default rank, so severity still drives order.
  const SEV_RANK: Record<BuyerFindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  const MATERIALITY: Record<string, number> = {
    "hazard-overlays": 0,
    "coastal-inundation": 1,
    "conservation-overlays": 1,
    "heritage-overlay": 2,
    "safety-context": 3,
    "transport-noise": 4,
    "nuisance-proximity": 5,
    "transport-check": 6,
    "amenity-access-low": 7,
  };
  const priorityChecks = [...verifyFindings]
    .sort(
      (a, b) =>
        SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
        (MATERIALITY[a.id] ?? 9) - (MATERIALITY[b.id] ?? 9)
    )
    .slice(0, 3);

  const headline = place
    ? verifyCount > 0
      ? `${areaName}: ${verifyCount} thing${verifyCount === 1 ? "" : "s"} to check before you offer`
      : `${areaName}: no major flags in the open data - still verify on site`
    : "Location outside our Greater Melbourne coverage";

  const amenitySentence = haveNearbyData
    ? reachableEveryday >= 5
      ? "Everyday amenities look well-covered within a short walk."
      : reachableEveryday <= 2
        ? "Few everyday amenities were found nearby in the open data - worth checking on foot."
        : "Some everyday amenities are nearby; check the rest on foot."
    : "Drop a pin on the map to measure what is nearby on foot.";
  const liveabilitySentence =
    overall != null
      ? overall >= 65
        ? "The surrounding area scores well on liveability."
        : overall <= 45
          ? "The surrounding area has some liveability trade-offs to review."
          : "The surrounding area is around the Greater-Melbourne median on liveability."
      : "";
  const subheadline = place
    ? `${amenitySentence} ${liveabilitySentence} The detail, sources and caveats are below - use the checklist to verify anything material before you offer.`.replace(
        /\s+/g,
        " "
      ).trim()
    : "We could not match this point to a Greater Melbourne area. Drop the pin on a Melbourne property to get the full report.";

  return { summary: { headline, subheadline, confidence }, priorityChecks };
}

// ---- Report-level source manifest --------------------------------------------

export function collectReportSourceRefs(
  findings: BuyerFinding[],
  nearbyAmenities: NearbyAmenity[]
): BuyerSourceRef[] {
  const refMap = new Map<string, BuyerSourceRef>();
  for (const f of findings)
    for (const r of f.sourceRefs ?? []) if (!refMap.has(r.id)) refMap.set(r.id, r);
  for (const a of nearbyAmenities)
    for (const r of a.sourceRefs ?? []) if (!refMap.has(r.id)) refMap.set(r.id, r);
  if (!refMap.has("methodology")) refMap.set("methodology", METHODOLOGY_REF);
  return [...refMap.values()];
}
