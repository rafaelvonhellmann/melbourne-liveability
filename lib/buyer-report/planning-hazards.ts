/**
 * Planning / hazards lens: bushfire + flood overlay shares, the parcel-level
 * VicPlan zone/overlay lookup, heritage + conservation overlay shares, coastal
 * inundation, fire history, growth projections, the development pipeline,
 * activity-centre zoning and lot size.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { getSourceById, getSourcesByIds } from "../source-manifest";
import { presentOverlays } from "../planning-overlays";
import { worstCoastalScenario } from "../coastal";
import { projectedGrowth } from "../vif";
import { activityCentreAt } from "../activity-centres";
import {
  PARCEL_OVERLAY_META,
  WHITELISTED_OVERLAY_PARENTS,
  zoneGroupMeaning,
} from "../planning-at";
import {
  UNCONFIRMED_PARCEL_CAVEAT,
  type BuyerFinding,
  type BuyerSourceRef,
} from "./types";
import { rawOf, asAtPhrase } from "./helpers";
import type { EngineCtx } from "./context";

/**
 * 5) Hazard & planning overlays (SA2 share; parcel-level NOT matched).
 *    Established/inner SA2s typically have ~no bushfire/flood overlay - there we
 *    surface a calm "none mapped" note rather than a "verify" flag (a flood/fire
 *    warning in the CBD is noise). Material overlay share keeps the verify/red-flag.
 */
export function pushHazardOverlayFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const bushfire = rawOf(place, "hazards", "bushfirePct");
  const flood = rawOf(place, "hazards", "floodPct");
  const hazardRefs = getSourcesByIds(["vic-planning-bpa", "vic-planning-flood"]);
  // Negative ("no overlay") statements must carry the dataset vintage inline -
  // an undated all-clear is the claim a buyer could rely on past its shelf life.
  const hazardAsAt = asAtPhrase(hazardRefs);
  const haveHazardData = bushfire != null || flood != null;
  const negligibleHazard = (bushfire ?? 0) < 1 && (flood ?? 0) < 1;
  const elevatedHazard = (bushfire != null && bushfire >= 50) || (flood != null && flood >= 10);
  const hazardBits: string[] = [];
  // Only mention an overlay it actually has - a "0%" bit (e.g. no bushfire but
  // some flood) reads as noise, so suppress any share that rounds to zero.
  if (bushfire != null && Math.round(bushfire) >= 1) hazardBits.push(`about ${Math.round(bushfire)}% mapped as bushfire-prone overlay`);
  if (flood != null && Math.round(flood) >= 1) hazardBits.push(`about ${Math.round(flood)}% under a flood planning overlay`);
  if (haveHazardData && negligibleHazard) {
    findings.push({
      id: "hazard-overlays",
      kind: "neutral",
      severity: "info",
      title: "Little bushfire or flood overlay here",
      summary: `No bushfire or flood overlay in the Vicmap Planning data${hazardAsAt} for almost all of this area. Overlays still apply parcel by parcel - confirm the exact property.`,
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Absence of a mapped planning overlay is not a guarantee - flood or fire risk can exist without one.",
      sourceRefs: hazardRefs,
    });
  } else if (hazardBits.length) {
    findings.push({
      id: "hazard-overlays",
      kind: elevatedHazard ? "red_flag" : "verify",
      severity: elevatedHazard ? "high" : "medium",
      title: "Check bushfire / flood overlays",
      summary: `Of this area, ${hazardBits.join(" and ")}. Confirm whether this exact parcel is affected.`,
      whyItMatters: "Overlays drive building controls, insurance cost and what you can do with the land.",
      verifyAction:
        "Check the council planning certificate, VicPlan and an insurance quote before buying.",
      confidence: "medium",
      geography: "sa2",
      sourceRefs: hazardRefs,
    });
  } else {
    // No overlay data matched (e.g. off-coverage). A known gap, not a prominent
    // "verify" - keep it out of the before-you-offer priority list.
    findings.push({
      id: "hazard-overlays",
      kind: "unavailable",
      severity: "info",
      title: "Bushfire / flood overlays not matched here",
      summary: `No bushfire or flood overlay could be matched to this point in the Vicmap Planning data${hazardAsAt}.`,
      verifyAction: "Check the council planning certificate and VicPlan for the exact address.",
      confidence: "unknown",
      geography: "unknown",
      caveat: "Absence of a mapped overlay is not a guarantee - risk can exist without one.",
      sourceRefs: hazardRefs,
    });
  }
}

/**
 * 5a') Parcel-level planning zone + overlays (pin mode only - a runtime
 *      VicPlan point lookup, see lib/planning-at). When the lookup resolved,
 *      the point answer REPLACES the SA2 heritage/conservation area-share
 *      findings below: "a heritage permit is needed here (Heritage Overlay
 *      HO123)" (or a dated all-clear) beats "31% of this area has a Heritage
 *      Overlay". The SA2
 *      findings remain the fallback whenever the lens is null (lookup failed
 *      or sa2 mode). The bushfire/flood hazard finding (5) is NOT suppressed:
 *      its bushfire share is the Bushfire-Prone Area, a separate instrument a
 *      BMO point answer does not cover.
 *
 * Returns `parcelPlanningDefinitive`: the lookup succeeded AND the point sits
 * in a planning scheme - the flag that suppresses the SA2 heritage/conservation
 * fallbacks (5b/5c). A zone-less success (e.g. off-state) must not suppress them.
 */
export function pushParcelPlanningFindings(findings: BuyerFinding[], ctx: EngineCtx): boolean {
  const { input, mode } = ctx;
  const planningAt = mode === "pin" ? (input.planning ?? null) : null;
  // Definitive = the lookup succeeded AND the point sits in a planning scheme.
  // A zone-less success (e.g. off-state) must not suppress the SA2 fallback.
  const parcelPlanningDefinitive = planningAt?.zone != null;
  // Cited via getSourceById so data:verify proves the manifest entry exists -
  // an inline ref literal bypasses extractReferencedSourceIds (dangling-
  // citation check). The entry lives in data/generated/sources.json.
  const vicplanLiveRef = getSourceById("vicplan-live");
  const VICPLAN_LIVE_REFS: BuyerSourceRef[] = vicplanLiveRef ? [vicplanLiveRef] : [];
  // Until the user confirms the highlighted lot (ParcelConfirmCard), every
  // parcel-geography finding carries an explicit wrong-lot caveat.
  const parcelConfirmed = input.confirmedParcel != null;
  const withParcelCaveat = (caveat: string): string =>
    parcelConfirmed ? caveat : `${caveat} ${UNCONFIRMED_PARCEL_CAVEAT}`;
  if (planningAt) {
    const zone = planningAt.zone;
    if (zone) {
      findings.push({
        id: "planning-zone",
        kind: "neutral",
        severity: "info",
        // Plain words lead, the code follows in parentheses - never the
        // other way round.
        title: `Zoning here: ${zone.description} (${zone.code})`,
        // Body text stays code-free plain English (the title carries the code);
        // the vintage rides on `asAt`, rendered only in full-report variants.
        summary: `${zoneGroupMeaning(zone.parent)}${
          zone.gazetted
            ? ""
            : " This zoning is only proposed and not yet in force - check its current status."
        }`,
        asAt: zone.asAt,
        whyItMatters:
          "The zone decides what can be built or run on this land and around it - by you and by your neighbours.",
        verifyAction:
          "Confirm the zoning on the planning certificate (Section 32) and check the detailed rules in the council planning scheme.",
        confidence: "high",
        geography: "parcel",
        caveat: withParcelCaveat(
          "Live point lookup of the Vicmap planning-scheme maps at the dropped pin - a pin a few metres off can sit in a neighbouring zone, so confirm against the property's planning certificate."
        ),
        sourceRefs: VICPLAN_LIVE_REFS,
      });
    }
    const isWhitelisted = (parent: string) =>
      (WHITELISTED_OVERLAY_PARENTS as readonly string[]).includes(parent);
    const materialOverlays = planningAt.overlays.filter((o) => isWhitelisted(o.parent));
    const otherOverlays = planningAt.overlays.filter((o) => !isWhitelisted(o.parent));
    for (const o of materialOverlays) {
      const meta = PARCEL_OVERLAY_META[o.parent as keyof typeof PARCEL_OVERLAY_META];
      findings.push({
        id: `parcel-overlay-${o.code}`,
        kind: "verify",
        severity: meta.severity,
        // Plain words lead ("Changes to the outside of this home need a
        // heritage permit"), the proper name + code follow in parentheses.
        title: `${meta.plainTitle} (${meta.name} ${o.code})`,
        // The title carries the overlay code; the body stays code-free plain
        // English, and the "as at" vintage rides on `asAt` (full report only).
        summary: `${meta.buyerMeaning} This rule is mapped over this exact spot.`,
        asAt: o.asAt,
        whyItMatters:
          "Rules like this control what you can build, change or remove - they affect cost, insurance and whether your plans are possible.",
        verifyAction:
          "Confirm this rule and its exact requirements on the planning certificate (Section 32) or VicPlan before you offer.",
        confidence: "high",
        geography: "parcel",
        caveat: withParcelCaveat(
          "Point lookup of the Vicmap planning overlay maps - the schedule detail and exact extent come from the planning certificate."
        ),
        sourceRefs: VICPLAN_LIVE_REFS,
      });
    }
    if (otherOverlays.length > 0) {
      // Plain words lead; the control names ride in parentheses - the
      // planning certificate carries the exact codes.
      const list = otherOverlays.map((o) => o.description).join("; ");
      findings.push({
        id: "parcel-overlay-other",
        kind: "neutral",
        severity: "info",
        title: "Other council rules here",
        summary: `This spot also has some additional council rules - things like parking requirements or developer contributions (${list}). These rarely affect everyday buyers; the planning certificate your conveyancer orders lists them all.`,
        confidence: "high",
        geography: "parcel",
        caveat: withParcelCaveat("Point lookup of the Vicmap planning overlay maps."),
        sourceRefs: VICPLAN_LIVE_REFS,
      });
    }
    // P1-2 negative-finding convention: an all-clear must carry its as-at date
    // (on `asAt`, rendered in full-report variants - never in the live glimpse),
    // plus the absence-is-not-a-guarantee caveat.
    if (zone && materialOverlays.length === 0) {
      findings.push({
        id: "parcel-overlays-clear",
        kind: "neutral",
        severity: "info",
        title: "No major planning restrictions here",
        summary: `We checked the planning rules that matter most when buying - heritage protection, flood and bushfire zones, land contamination, compulsory government acquisition, protected vegetation, airport noise and design controls. None applies at this exact spot.${
          otherOverlays.length > 0 ? " Some minor rules do apply - see 'Other council rules here'." : ""
        }`,
        asAt: planningAt.checkedAt,
        verifyAction:
          "Confirm on the property's planning certificate (Section 32) before you offer.",
        confidence: "high",
        geography: "parcel",
        caveat: withParcelCaveat(
          "Absence of a mapped overlay is not a guarantee - planning maps change through amendments, and risk can exist without an overlay. The planning certificate is the authoritative list."
        ),
        sourceRefs: VICPLAN_LIVE_REFS,
      });
    }
  }
  return parcelPlanningDefinitive;
}

/**
 * 5b) Heritage Overlay (context - a planning CONTROL, never scored). Only
 *     surfaced when there is material coverage; an AREA share, not parcel-level.
 *     Skipped when the parcel-level lens (5a') answered for this exact point.
 */
export function pushHeritageFinding(
  findings: BuyerFinding[],
  ctx: EngineCtx,
  parcelPlanningDefinitive: boolean
): void {
  const { place } = ctx;
  const heritagePct = place?.context?.planning?.heritageOverlayPct ?? null;
  if (heritagePct != null && heritagePct >= 1 && !parcelPlanningDefinitive) {
    const extensive = heritagePct >= 25;
    findings.push({
      id: "heritage-overlay",
      kind: "verify",
      severity: extensive ? "medium" : "info",
      title: extensive
        ? "Much of this area is under a Heritage Overlay"
        : "Part of this area is under a Heritage Overlay",
      summary: `About ${Math.round(heritagePct)}% of this area sits inside a Heritage Overlay. Whether THIS property is affected needs a check of its planning certificate.`,
      whyItMatters:
        "A Heritage Overlay can restrict demolition, external changes and subdivision - it shapes what you can do with the property.",
      verifyAction:
        "Check the property's planning certificate / VicPlan for a Heritage Overlay before you offer.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Area share, not a parcel-level result - a property can be affected even where the area share is low, and vice versa.",
      sourceRefs: getSourcesByIds(["vic-planning-heritage"]),
    });
  }
}

/**
 * 5c) Conservation & restriction overlays (context - planning CONTROLS, never
 *     scored). ESO/SLO/VPO/EMO control development + vegetation; EAO flags
 *     possible contamination; PAO can mean the land is reserved for compulsory
 *     public acquisition. SA2 area share only, never parcel-level - always a
 *     "verify", surfaced most-material-first (PAO/EAO are the ones not to miss).
 *     Skipped when the parcel-level lens (5a') answered for this exact point
 *     (every conservation family below is in its whitelist).
 */
export function pushConservationFinding(
  findings: BuyerFinding[],
  ctx: EngineCtx,
  parcelPlanningDefinitive: boolean
): void {
  const { place } = ctx;
  const overlayShares = place?.context?.planning?.overlays ?? null;
  const presentOverlayList = presentOverlays(overlayShares, 1);
  if (presentOverlayList.length > 0 && !parcelPlanningDefinitive) {
    const hasHigh = presentOverlayList.some((o) => o.materiality === "high");
    const lead = presentOverlayList[0];
    // Body stays code-free plain English - the lead overlay's code already
    // sits in the title where present.
    const shareList = presentOverlayList
      .map((o) => `${o.name} ~${Math.round(overlayShares?.[o.code] ?? 0)}%`)
      .join(", ");
    findings.push({
      id: "conservation-overlays",
      kind: "verify",
      severity: hasHigh ? "high" : "medium",
      title: hasHigh
        ? `Check the ${lead.name} (${lead.code}) on this property`
        : presentOverlayList.length === 1
          ? `${lead.name} (${lead.code}) controls development here`
          : "Planning overlays control development here",
      summary: `Part of this area is within ${
        presentOverlayList.length === 1
          ? "a planning overlay"
          : `${presentOverlayList.length} planning overlays`
      } (${shareList}). ${lead.buyerMeaning}`,
      whyItMatters:
        "Planning overlays control what you can build, remove or change - and a Public Acquisition Overlay can mean the land is reserved for a public work. They affect the cost, feasibility and even the ownership of your plans.",
      verifyAction:
        "Check the property's planning certificate (Section 32) and VicPlan for the exact overlays on THIS parcel before you offer.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Area share for the wider SA2, not a parcel-level result - your specific property may or may not be affected.",
      sourceRefs: getSourcesByIds(["vic-planning-overlays"]),
    });
  }
}

/**
 * 5d) Coastal inundation (sea-level rise) - context, never scored. SA2 area
 *     share under DEECA Future Coasts modelled inundation by projection year;
 *     a PROJECTION/scenario at ~1:75,000, never a parcel verdict.
 */
export function pushCoastalFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const coastalShares = place?.context?.coastalInundation?.scenarioShares ?? null;
  const worstCoastal = worstCoastalScenario(coastalShares, 1);
  if (worstCoastal) {
    findings.push({
      id: "coastal-inundation",
      kind: "verify",
      tone: "concern",
      severity: worstCoastal.pct >= 10 ? "high" : "medium",
      title: "Sea-level-rise inundation projected for part of this area",
      summary: `Under a sea-level-rise projection (about ${worstCoastal.slr} by ${worstCoastal.label}), roughly ${Math.round(worstCoastal.pct)}% of this area's land is modelled as subject to coastal inundation.`,
      whyItMatters:
        "Coastal-inundation risk shapes insurance, future planning controls and long-term value over the decades you would own the property.",
      verifyAction:
        "Check the property's elevation and the council / VicPlan coastal-hazard + flood overlays before you offer - this is area-level, not parcel-level.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Modelled projection from DEECA Future Coasts at ~1:75,000 - an indicative area share for the wider SA2, NOT a parcel-level result, and a scenario rather than a forecast.",
      sourceRefs: getSourcesByIds(["vic-coastal-inundation"]),
    });
  }
}

/**
 * 5e) Past-fire history (context, never scored). % of SA2 mapped as burnt in
 *     the Vicmap record - HISTORY, distinct from the forward-looking bushfire
 *     overlay; only surfaced at meaningful coverage. NOT parcel-level.
 */
export function pushFireHistoryFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const burntPct = place?.context?.fireHistory?.burntPct ?? null;
  if (burntPct != null && burntPct >= 10) {
    findings.push({
      id: "fire-history",
      kind: "verify",
      tone: "concern",
      severity: burntPct >= 40 ? "high" : "medium",
      title: "This area has a history of bushfire",
      summary: `About ${Math.round(burntPct)}% of this area's land is mapped as burnt by past fires in the Victorian record.`,
      whyItMatters:
        "Fire in the surrounding landscape signals bushfire exposure that affects safety, insurance and what you must build to.",
      verifyAction:
        "Check the bushfire planning overlay (Bushfire Management Overlay / Bushfire-Prone Area), the local fire-history record and an insurance quote; confirm the property's Bushfire Attack Level (BAL) rating.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Mapped fire HISTORY (fires since ~1903; severity from 2006, private-land fires from 2009) - an area share, NOT a parcel result and NOT the forward-looking bushfire-prone overlay.",
      sourceRefs: getSourcesByIds(["vic-fire-history"]),
    });
  }
}

/**
 * 5f) Growth / "what's coming" (context, never scored). Official Victoria in
 *     Future projections of dwellings + population to 2036 - the forward lens.
 *     A projection, not a forecast/target; neutral (growth can be good or bad
 *     depending on the buyer).
 */
export function pushGrowthFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const vifGrowth = projectedGrowth(place?.context?.projections);
  if (vifGrowth.dwellingGrowthPct != null || vifGrowth.populationGrowthPct != null) {
    const bits: string[] = [];
    if (vifGrowth.dwellingGrowthPct != null)
      bits.push(`dwellings ${vifGrowth.dwellingGrowthPct >= 0 ? "+" : ""}${vifGrowth.dwellingGrowthPct}%`);
    if (vifGrowth.populationGrowthPct != null)
      bits.push(`population ${vifGrowth.populationGrowthPct >= 0 ? "+" : ""}${vifGrowth.populationGrowthPct}%`);
    const fastGrowth = (vifGrowth.dwellingGrowthPct ?? 0) >= 20;
    findings.push({
      id: "growth-projection",
      kind: "neutral",
      severity: "info",
      title: fastGrowth ? "Strong growth projected for this area" : "Projected change to 2036",
      summary: `Official projections (Victoria in Future) to 2036: ${bits.join(", ")} vs 2021.`,
      whyItMatters:
        "Where dwellings are projected to grow fast, expect more development, density and streetscape change over the years you would own here.",
      verifyAction:
        "Check the council planning scheme and any activity-centre / housing-target plans for what can be built nearby.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "A modelled PROJECTION at SA2 level (Victoria in Future 2023), not a forecast or target; only 5-yearly years (2021/2026/2031/2036) are published.",
      sourceRefs: getSourcesByIds(["vif2023-sa2"]),
    });
  }
}

/**
 * 5g) Development pipeline (context, never scored). ABS building approvals -
 *     dwelling units approved in the trailing 12 months, split houses vs
 *     higher-density, with a year-on-year trend. The "what's being built"
 *     signal: built-form + supply only, never an inference about residents.
 */
export function pushPipelineFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const pipe = place?.context?.developmentPipeline;
  if (pipe) {
    const { trailing12, prior12, housePct, period } = pipe;
    const mix =
      housePct == null
        ? ""
        : housePct >= 80
          ? "almost all detached houses"
          : housePct >= 55
            ? "mostly houses"
            : housePct <= 20
              ? "almost all townhouses or apartments"
              : housePct <= 45
                ? "mostly townhouses or apartments"
                : "a mix of houses and higher-density homes";
    let trend = "";
    if (prior12 != null && prior12 > 0) {
      const r = trailing12 / prior12;
      trend =
        r >= 1.25
          ? "up sharply on the year before"
          : r >= 1.1
            ? "up on the year before"
            : r <= 0.75
              ? "down sharply on the year before"
              : r <= 0.9
                ? "down on the year before"
                : "broadly steady year on year";
    }
    const active = trailing12 >= 300;
    const moderate = trailing12 >= 50;
    findings.push({
      id: "development-pipeline",
      kind: "neutral",
      severity: "info",
      title:
        trailing12 === 0
          ? "No new dwellings approved here recently"
          : active
            ? "Active development pipeline nearby"
            : moderate
              ? "Steady development pipeline nearby"
              : "A few new dwellings approved nearby",
      summary:
        trailing12 === 0
          ? `No new dwellings were approved across this area in the ${period} (ABS building approvals).`
          : `About ${trailing12.toLocaleString("en-AU")} new ${trailing12 === 1 ? "dwelling was" : "dwellings were"} approved across this area in the ${period}${mix ? ` - ${mix}` : ""}${trend ? `, ${trend}` : ""}.`,
      whyItMatters:
        "Approvals are a leading sign of construction: more building work, new supply and streetscape change ahead. They come before - and do not guarantee - completed homes.",
      verifyAction:
        "Check the council planning register and VicPlan for current applications and any major projects near the address.",
      confidence: "high",
      geography: "sa2",
      caveat:
        "ABS building approvals counted at SA2 (whole-area) level, not your street; an approval is a leading indicator, not a completed home, and the most recent month or two may be revised.",
      sourceRefs: getSourcesByIds(["abs-building-approvals"]),
    });
  }
}

/**
 * 5k) Activity-centre zoning (context, never scored). Is the pin inside an
 *     Activity Centre Zone - the statutory instrument steering higher-density
 *     development. Forward "where growth is directed" signal; built form only.
 */
export function pushActivityCentreFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode, point } = ctx;
  const acz =
    point && mode === "pin" && input.activityCentres
      ? activityCentreAt([point.lng, point.lat], input.activityCentres)
      : null;
  if (acz) {
    const lga = acz.lga
      ? acz.lga.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    findings.push({
      id: "activity-centre",
      kind: "neutral",
      severity: "info",
      title: "Inside a designated activity centre",
      summary: `This location sits in an Activity Centre Zone (${acz.zone}${lga ? `, ${lga}` : ""}) - land the planning scheme steers toward higher-density housing, shops and services.`,
      whyItMatters:
        "Activity-centre zoning points to more apartments, mixed-use and streetscape change over time - convenient for some buyers, denser for others.",
      verifyAction:
        "Check the council's activity-centre / structure plan for the height and built-form controls that apply near the address.",
      confidence: "high",
      geography: "pin",
      caveat:
        "The Activity Centre Zone is the statutory upzoning instrument - it covers only centres that have adopted it (not every Plan Melbourne centre), built-form controls vary by schedule, and the mapped boundary is simplified, so confirm the exact frontage on the council planning scheme map.",
      sourceRefs: getSourcesByIds(["vic-activity-centres"]),
    });
  }
}

/**
 * 5l) Lot size (context, never scored). Runtime parcel area at the pin from the
 *     Vicmap parcel WFS (turf-derived; a single parcel, not merged lots).
 *     Pin-mode only - a parcel under an SA2 centroid is not the user's property.
 */
export function pushLotSizeFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, mode } = ctx;
  const parcel = mode === "pin" ? input.parcel : null;
  if (parcel && parcel.areaM2 > 0) {
    const m2 = Math.round(parcel.areaM2);
    findings.push({
      id: "lot-size",
      kind: "neutral",
      severity: "info",
      title: "Approximate lot size",
      summary: `The parcel at this point is about ${m2.toLocaleString("en-AU")} m2${parcel.lot ? ` (Lot ${parcel.lot}${parcel.plan ? ` ${parcel.plan}` : ""})` : ""}.`,
      whyItMatters:
        "Lot size shapes what you can build, extend or subdivide, and underpins the land value beneath the home.",
      verifyAction:
        "Confirm the exact area and boundaries on the title and plan of subdivision before you offer.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Area is geometry-derived from the Vicmap parcel boundary (CC BY 4.0) at the dropped point - indicative, a SINGLE parcel (not merged or adjoining lots), and not a substitute for the title.",
      sourceRefs: getSourcesByIds(["vic-parcel"]),
    });
  }
}
