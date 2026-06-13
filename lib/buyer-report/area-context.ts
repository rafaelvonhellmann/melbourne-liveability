/**
 * Area-context lens: the SA2 overall-liveability finding, health-access
 * percentile, local safety/crime context and the data-confidence meta note.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import { getSourcesByIds } from "../source-manifest";
import { domainVerdict } from "../verdict";
import type { BuyerFinding } from "./types";
import { pctOf, METHODOLOGY_REF } from "./helpers";
import type { EngineCtx } from "./context";

const REGION_LABEL = "Greater Melbourne";

/**
 * 2) Overall area liveability (SA2). `overall` is the safe overall score the
 *    orchestrator derived (null = unscored / non-residential).
 */
export function pushLiveabilityFinding(findings: BuyerFinding[], overall: number | null): void {
  if (overall != null) {
    if (overall >= 65) {
      findings.push({
        id: "liveability-strong",
        kind: "positive",
        severity: "info",
        title: "Strong area-level liveability score",
        summary: `The surrounding area scores ${Math.round(overall)}/100 on the current liveability model.`,
        confidence: "medium",
        geography: "sa2",
        caveat: "This is an area-level score and may not reflect the exact street or property.",
        sourceRefs: [METHODOLOGY_REF],
      });
    } else if (overall <= 45) {
      findings.push({
        id: "liveability-review",
        kind: "verify",
        severity: "low",
        title: "Review area-level liveability trade-offs",
        summary: `The surrounding area scores ${Math.round(overall)}/100 and has some weaker indicators in the current model.`,
        verifyAction: "Review the domain breakdown rather than relying on the overall score.",
        confidence: "medium",
        geography: "sa2",
        sourceRefs: [METHODOLOGY_REF],
      });
    }
  }
}

/** 4) Health access (SA2 domain). */
export function pushHealthFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const healthPct = pctOf(place, "health");
  const healthVerdict = domainVerdict("health", healthPct, REGION_LABEL);
  if (healthPct != null && healthPct >= 70) {
    findings.push({
      id: "health-strong",
      kind: "positive",
      severity: "info",
      title: "Good access to health services",
      summary: `${healthVerdict?.headline ?? "Health access scores strongly"} for this wider area.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["vic-mapshare-hospitals", "osm-health"]),
    });
  }

  const mmm = place?.domains?.health?.subIndicators?.modifiedMonashModel;
  const mmmCode = typeof mmm?.raw === "number" && Number.isFinite(mmm.raw) ? mmm.raw : null;
  const mmmNote = mmm?.note;
  if (mmmCode != null) {
    findings.push({
      id: "health-mmm-context",
      kind: "neutral",
      severity: "info",
      title: "Health-access remoteness context",
      summary: `Modified Monash Model ${mmmCode} for this SA2, rolled up from SA1 areas. This is context only and is not included in the health score.`,
      whyItMatters:
        "MMM is used nationally to describe relative remoteness for health workforce and access programs; metro areas usually sit at the low-remoteness end.",
      caveat: mmmNote,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["doh-mmm-2023"]),
    });
  }
}

/**
 * 6) Local safety / crime context (LGA). Property + offences-against-the-person
 *    split (VCSA). Off-coverage pins (no SA2 match) drop precision to "unknown".
 */
export function pushSafetyFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const safetyVerdict = domainVerdict("safety", pctOf(place, "safety"), REGION_LABEL);
  findings.push({
    id: "safety-context",
    kind: "verify",
    severity: "low",
    title: "Review local safety context",
    summary: !place
      ? "This point is outside our Greater Melbourne coverage, so no local crime context is available here. Recorded offences are published at suburb or council-area level - check the VCSA data for the actual area."
      : safetyVerdict
        ? `${safetyVerdict.headline}, measured at suburb or council-area level - not the specific street.`
        : "We do not hold recorded-offence figures for this specific area - check VCSA crime data for the wider council area.",
    verifyAction: "Walk the immediate street at different times and check recent local reports.",
    caveat:
      "Recorded offences reflect reporting and policing, not true crime levels; percentiles rank areas and do not predict a specific street.",
    confidence: place && safetyVerdict ? "medium" : "unknown",
    geography: place && safetyVerdict ? "lga" : "unknown",
    sourceRefs: getSourcesByIds(["vcsa-recorded-offences"]),
  });
}

/** 9) Data confidence (meta; neutral). */
export function pushDataConfidenceFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { place } = ctx;
  const dc = place?.dataConfidence?.score;
  if (typeof dc === "number" && Number.isFinite(dc)) {
    findings.push({
      id: "data-confidence",
      kind: "neutral",
      severity: "info",
      title: "Data completeness for this area",
      summary: `Our pipeline rates this area ${Math.round(dc)}/100 for data completeness. This describes how well-measured the area is, not how good it is to live in.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: [METHODOLOGY_REF],
    });
  }
}
