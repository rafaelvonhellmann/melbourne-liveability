/**
 * The buyer-report engine orchestrator. Computes the shared per-build state,
 * then runs the lens-family finding collectors in the EXACT order the
 * monolithic lib/buyer-report.ts pushed them (the findings array order is part
 * of the behavioural contract), and assembles the summary/fit/anchors glue.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { WALK_CATEGORY_IDS } from "../walk-access";
import { evaluateFit, type FitResult } from "../buyer-fit";
import { anchorDistances } from "../anchors";
import {
  BUYER_DISCLAIMER,
  DEFAULT_RADIUS_METERS,
  STRAIGHT_LINE_CAVEAT,
  STREET_NETWORK_CAVEAT,
  type BuildBuyerReportInput,
  type BuyerFinding,
  type BuyerReport,
  type NearbyAmenity,
} from "./types";
import { rawOf, pctOf, safeOverallScore } from "./helpers";
import type { EngineCtx } from "./context";
import {
  dedupeParkAmenities,
  getNearbyAmenities,
  pushAmenityAccessFindings,
  pushAdjacencyFinding,
} from "./amenities";
import {
  pushNoiseFinding,
  pushNuisanceFinding,
  pushTrainStationFinding,
  pushFutureTransportFinding,
  pushMajorProjectFinding,
  pushTransportPercentileFinding,
  pushTrafficFinding,
  pushBusFinding,
} from "./transit-noise";
import {
  pushHazardOverlayFinding,
  pushParcelPlanningFindings,
  pushHeritageFinding,
  pushConservationFinding,
  pushCoastalFinding,
  pushFireHistoryFinding,
  pushGrowthFinding,
  pushPipelineFinding,
  pushActivityCentreFinding,
  pushLotSizeFinding,
} from "./planning-hazards";
import {
  pushSunAspectFinding,
  pushWaterRetailerFinding,
  pushAirQualityFinding,
} from "./environment";
import {
  pushLiveabilityFinding,
  pushHealthFinding,
  pushSafetyFinding,
  pushDataConfidenceFinding,
} from "./area-context";
import { pushSchoolZoneFindings } from "./schools";
import { pushPriceFinding } from "./prices";
import { buildReportSummary, collectReportSourceRefs } from "./summary";

export function buildBuyerReport(input: BuildBuyerReportInput): BuyerReport {
  const place = input.place ?? null;
  const hasPoint =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);
  const mode: "pin" | "sa2" = input.mode ?? (hasPoint ? "pin" : "sa2");

  // Resolve the point used for nearby maths: the pin, else the SA2 centroid.
  let point: { lat: number; lng: number } | null = hasPoint
    ? { lat: input.lat as number, lng: input.lng as number }
    : null;
  if (!point && place?.centroid && place.centroid.length === 2) {
    point = { lat: place.centroid[1], lng: place.centroid[0] };
  }

  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const isochrone = input.isochrone;
  const accessMode: "straight" | "precise" = isochrone ? "precise" : "straight";
  const amenityCaveat = accessMode === "precise" ? STREET_NETWORK_CAVEAT : STRAIGHT_LINE_CAVEAT;
  const walkPhrase =
    accessMode === "precise"
      ? "within a ~15-minute street-network walk"
      : "within roughly a 15-minute walk";

  // Nearby amenities (display: top 8 per category) + full reachable counts. When
  // an isochrone is supplied, "reachable" means inside that walk polygon; else a
  // straight-line radius. OSM splits a single park into many nodes/segments, so
  // we collapse same-park pins (dedupeParkAmenities) before counting OR listing —
  // otherwise one park reads as a dozen. Counts + list derive from one deduped,
  // nearest-first pass.
  const allNearby = dedupeParkAmenities(
    point && input.pois
      ? getNearbyAmenities(point, input.pois, { radiusMeters, isochrone })
      : []
  );
  const amenityCountsByCategory: Record<string, number> = {};
  for (const a of allNearby) {
    amenityCountsByCategory[a.category] = (amenityCountsByCategory[a.category] ?? 0) + 1;
  }
  const perCatShown = new Map<string, number>();
  const nearbyAmenities: NearbyAmenity[] = [];
  for (const a of allNearby) {
    const n = perCatShown.get(a.category) ?? 0;
    if (n >= 8) continue;
    perCatShown.set(a.category, n + 1);
    nearbyAmenities.push(a);
  }

  const findings: BuyerFinding[] = [];
  const reachableEveryday = WALK_CATEGORY_IDS.filter(
    (id) => (amenityCountsByCategory[id] ?? 0) > 0
  ).length;
  const haveNearbyData = point != null && (input.pois?.length ?? 0) > 0;

  const ctx: EngineCtx = {
    input,
    place,
    mode,
    hasPoint,
    point,
    walkPhrase,
    amenityCaveat,
    amenityCountsByCategory,
    reachableEveryday,
    haveNearbyData,
  };

  // 2)'s input, computed up front so the summary shares the same value. Pure.
  const overall = safeOverallScore(place, input.overallScore);

  // The collector sequence below preserves the monolith's exact push order -
  // findings array order is part of the behavioural contract (UI + tests).
  pushAmenityAccessFindings(findings, ctx); // 1) everyday amenity access
  pushNoiseFinding(findings, ctx); // transport-noise proximity proxy
  pushNuisanceFinding(findings, ctx); // nuisance / disamenity proximity proxy
  pushTrainStationFinding(findings, ctx); // nearest train station
  pushFutureTransportFinding(findings, ctx); // future transport nearby
  pushAdjacencyFinding(findings, ctx); // 1b) adjacency nudge
  pushMajorProjectFinding(findings, ctx); // 1c) major transport projects
  pushSunAspectFinding(findings, ctx); // 1d) sun & aspect
  pushLiveabilityFinding(findings, overall); // 2) overall area liveability
  pushTransportPercentileFinding(findings, ctx); // 3) transport (SA2 domain)
  pushHealthFinding(findings, ctx); // 4) health access (SA2 domain)
  pushHazardOverlayFinding(findings, ctx); // 5) hazard & planning overlays
  // 5a') parcel-level planning zone + overlays; definitive answers suppress 5b/5c.
  const parcelPlanningDefinitive = pushParcelPlanningFindings(findings, ctx);
  pushHeritageFinding(findings, ctx, parcelPlanningDefinitive); // 5b) heritage overlay
  pushConservationFinding(findings, ctx, parcelPlanningDefinitive); // 5c) conservation overlays
  pushCoastalFinding(findings, ctx); // 5d) coastal inundation
  pushFireHistoryFinding(findings, ctx); // 5e) past-fire history
  pushGrowthFinding(findings, ctx); // 5f) growth projections
  pushPipelineFinding(findings, ctx); // 5g) development pipeline
  pushTrafficFinding(findings, ctx); // 5h) traffic exposure
  pushWaterRetailerFinding(findings, ctx); // 5i) water retailer
  pushAirQualityFinding(findings, ctx); // 5j) air quality
  pushActivityCentreFinding(findings, ctx); // 5k) activity-centre zoning
  pushLotSizeFinding(findings, ctx); // 5l) lot size
  pushBusFinding(findings, ctx); // 5m) bus access
  pushSafetyFinding(findings, ctx); // 6) local safety / crime context
  pushSchoolZoneFindings(findings, ctx); // 7) school zones
  pushPriceFinding(findings); // 8) price / sales context (not included)
  pushDataConfidenceFinding(findings, ctx); // 9) data confidence (meta)

  const { summary, priorityChecks } = buildReportSummary({
    findings,
    place,
    sa2Name: input.sa2Name,
    haveNearbyData,
    reachableEveryday,
    overall,
  });

  const sourceRefs = collectReportSourceRefs(findings, nearbyAmenities);

  const id = place
    ? `sa2-${place.sa2Code}${hasPoint ? `-${input.lat!.toFixed(5)}-${input.lng!.toFixed(5)}` : ""}`
    : hasPoint
      ? `pin-${input.lat!.toFixed(5)}-${input.lng!.toFixed(5)}`
      : "buyer-report";

  // Personal "fit for your life" - re-frame the sourced facts against the user's
  // profile (deal-breakers to verify + fit notes). Pure; never alters the score.
  const fit: FitResult | undefined = input.profile
    ? evaluateFit(input.profile, {
        floodPct: rawOf(place, "hazards", "floodPct"),
        bushfirePct: rawOf(place, "hazards", "bushfirePct"),
        heritagePct: place?.context?.planning?.heritageOverlayPct ?? null,
        transportPct: pctOf(place, "transport"),
        hasNoiseFlag: findings.some((f) => f.id === "transport-noise"),
        hasNuisanceFlag: findings.some((f) => f.id === "nuisance-proximity"),
      })
    : undefined;

  // Social anchors: straight-line distance from this pin to the user's real-life
  // places (work / school / family). Context only, never scored; needs a pin.
  const anchors =
    hasPoint && input.profile?.anchors?.length
      ? anchorDistances([input.lng!, input.lat!], input.profile.anchors)
      : undefined;

  return {
    id,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode,
    accessMode,
    location: {
      lat: hasPoint ? input.lat : undefined,
      lng: hasPoint ? input.lng : undefined,
      sa2Code: place?.sa2Code,
      sa2Name: place?.name ?? input.sa2Name,
      lgaName: place?.lga ?? input.lgaName,
      confirmedParcel: input.confirmedParcel ?? undefined,
    },
    summary,
    findings,
    priorityChecks,
    nearbyAmenities,
    amenityCountsByCategory,
    sourceRefs,
    disclaimers: [BUYER_DISCLAIMER],
    fit,
    anchorDistances: anchors,
  };
}
