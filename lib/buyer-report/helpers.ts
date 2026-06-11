/**
 * Internal helpers shared by the buyer-report finding collectors: domain
 * raw/percentile accessors, the "as at" phrase for negative findings, the
 * safe overall-score guard and the shared non-dataset source refs.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 * NOT part of the public barrel API.
 */
import type { Place } from "../types";
import { computeWeightedScore } from "../scoring";
import { getDefaultWeights } from "../weights";
import { sourceAsAt } from "../source-manifest";
import { PRODUCT_NAME } from "../brand";
import type { BuyerSourceRef } from "./types";

export const METHODOLOGY_REF: BuyerSourceRef = {
  id: "methodology",
  label: `${PRODUCT_NAME} liveability methodology`,
  url: "/methodology",
};

export const SCHOOL_ZONE_REF: BuyerSourceRef = {
  id: "vic-findmyschool",
  label: "Find My School - official Victorian school-zone lookup",
  url: "https://www.findmyschool.vic.gov.au/",
};

// ---- Finding-rule helpers --------------------------------------------------

export function rawOf(place: Place | null | undefined, domain: keyof Place["domains"], sub: string): number | null {
  const v = place?.domains?.[domain]?.subIndicators?.[sub]?.raw;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function pctOf(place: Place | null | undefined, domain: keyof Place["domains"]): number | null {
  const v = place?.domains?.[domain]?.percentile;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * First known dataset vintage among `refs` as an inline " as at <date>" phrase
 * (leading space so it splices into a sentence), or "" when no date is recorded.
 * Used by NEGATIVE findings ("no X overlay here") - an undated "all clear" is
 * the s18 exposure this defuses.
 */
export function asAtPhrase(refs: BuyerSourceRef[]): string {
  for (const r of refs) {
    const d = sourceAsAt(r);
    if (d) return ` as at ${d}`;
  }
  return "";
}

export function safeOverallScore(place: Place | null | undefined, override?: number | null): number | null {
  if (override != null && Number.isFinite(override)) return override;
  // Non-residential SA2s (airports, racecourse, parkland, industrial) carry no
  // scored domains, so computeWeightedScore returns 0 - that is "unscored", NOT
  // a real 0/100. Return null so callers never frame these as a poor place to
  // live (and skip the liveability finding entirely).
  if (!place || place.nonResidential) return null;
  try {
    const s = computeWeightedScore(place, getDefaultWeights()).total;
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}
