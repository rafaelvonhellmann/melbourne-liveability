/**
 * Personal "fit for your life" + deal-breaker evaluation (context only, never
 * scored). A buyer (or an agent acting for a client) records lightweight, local
 * preferences; we re-FRAME the sourced facts against them - we never change the
 * locked composite score, and a deal-breaker is a prompt to VERIFY, not a verdict.
 *
 * Pure + deterministic: callers extract `FitSignals` from a place + its buyer
 * report and pass them in, so this module stays testable and free of data wiring.
 */

import type { BuyerAnchor } from "./anchors";

export type ProfileMode = "buyer" | "agent";
export type BuyerIntent = "buy" | "rent";
export type HouseholdType = "solo" | "couple" | "family" | "share" | "retiree";
export type CarAccess = "no_car" | "one_car" | "multi_car";
export type Importance = "low" | "medium" | "high";

/** Things a user can mark as a deal-breaker to be flagged for verification. */
export type DealBreakerId =
  | "flood"
  | "bushfire"
  | "heritage"
  | "noise"
  | "industry"
  | "poor_transport";

export type BuyerProfile = {
  /** "buyer" (default) or the agent-acting-for-a-client variant (reframes copy). */
  mode: ProfileMode;
  intent?: BuyerIntent;
  household?: HouseholdType;
  car?: CarAccess;
  /** A commute destination to sanity-check against (label only at this layer). */
  commuteLabel?: string;
  /** Real-life anchors (work / school / family) to measure each property against. */
  anchors?: BuyerAnchor[];
  schools?: Importance;
  quiet?: Importance;
  safety?: Importance;
  transport?: Importance;
  walkability?: Importance;
  dealBreakers?: DealBreakerId[];
  updatedAt?: string;
};

export const DEAL_BREAKERS: { id: DealBreakerId; label: string }[] = [
  { id: "flood", label: "Significant flood overlay" },
  { id: "bushfire", label: "Bushfire-prone overlay" },
  { id: "heritage", label: "Heritage Overlay restrictions" },
  { id: "noise", label: "Close to rail / tram / freeway noise" },
  { id: "industry", label: "Close to industry / waste / pollution source" },
  { id: "poor_transport", label: "Weak public transport" },
];

/** Facts a caller extracts from a place + its buyer report to evaluate fit. */
export type FitSignals = {
  /** % of the area under a flood overlay (hazards), or null if unknown. */
  floodPct?: number | null;
  /** % under a bushfire overlay. */
  bushfirePct?: number | null;
  /** % under a Heritage Overlay (planning). */
  heritagePct?: number | null;
  /** Transport domain percentile (0-100). */
  transportPct?: number | null;
  /** The buyer report produced a transport-noise proximity flag. */
  hasNoiseFlag?: boolean;
  /** The buyer report produced an industrial/nuisance proximity flag. */
  hasNuisanceFlag?: boolean;
};

/** Material-overlay thresholds (share %) for treating a hazard as a deal-breaker. */
const FLOOD_BUSHFIRE_PCT = 10;
const HERITAGE_PCT = 25;
const WEAK_TRANSPORT_PCT = 30;

export type DealBreakerHit = {
  id: DealBreakerId;
  label: string;
  detail: string;
};

export type FitResult = {
  /** Deal-breakers the user set that the data suggests are worth verifying here. */
  hits: DealBreakerHit[];
  /** Plain-language "fit" notes for the preferences the user marked as mattering. */
  notes: string[];
  /** Which profile produced this (drives buyer vs client-facing copy). */
  mode?: ProfileMode;
};

function pct(n: number | null | undefined): string {
  return n == null ? "unknown" : `${Math.round(n)}%`;
}

/**
 * Evaluate a profile against a place's signals. Returns deal-breakers to verify
 * + fit notes. Honest: only flags a deal-breaker when the data is present AND
 * material; missing data is never treated as a pass or a fail.
 */
export function evaluateFit(
  profile: BuyerProfile | null | undefined,
  signals: FitSignals
): FitResult {
  const hits: DealBreakerHit[] = [];
  const notes: string[] = [];
  if (!profile) return { hits, notes };
  const mode = profile.mode;

  const wants = new Set(profile.dealBreakers ?? []);
  const material = (v: number | null | undefined, threshold: number) =>
    v != null && v >= threshold;

  if (wants.has("flood") && material(signals.floodPct, FLOOD_BUSHFIRE_PCT)) {
    hits.push({
      id: "flood",
      label: "Flood overlay",
      detail: `You flagged flood as a deal-breaker - about ${pct(signals.floodPct)} of this area is under a flood overlay. Verify the specific parcel.`,
    });
  }
  if (wants.has("bushfire") && material(signals.bushfirePct, FLOOD_BUSHFIRE_PCT)) {
    hits.push({
      id: "bushfire",
      label: "Bushfire overlay",
      detail: `You flagged bushfire as a deal-breaker - about ${pct(signals.bushfirePct)} of this area is bushfire-prone overlay. Verify the parcel + BAL rating.`,
    });
  }
  if (wants.has("heritage") && material(signals.heritagePct, HERITAGE_PCT)) {
    hits.push({
      id: "heritage",
      label: "Heritage Overlay",
      detail: `You flagged heritage controls as a deal-breaker - about ${pct(signals.heritagePct)} of this area is under a Heritage Overlay, which can restrict changes. Verify whether the parcel is included.`,
    });
  }
  if (wants.has("noise") && signals.hasNoiseFlag) {
    hits.push({
      id: "noise",
      label: "Transport noise",
      detail:
        "You flagged noise as a deal-breaker - this point is close to a rail line, tram line or freeway/major road. Visit at peak and after dark.",
    });
  }
  if (wants.has("industry") && signals.hasNuisanceFlag) {
    hits.push({
      id: "industry",
      label: "Industry / pollution source",
      detail:
        "You flagged industry/pollution as a deal-breaker - this point is near a mapped industrial area, waste/sewage site or quarry. Check wind direction and any EPA licences.",
    });
  }
  if (
    wants.has("poor_transport") &&
    signals.transportPct != null &&
    signals.transportPct < WEAK_TRANSPORT_PCT
  ) {
    hits.push({
      id: "poor_transport",
      label: "Weak transport",
      detail: `You flagged transport as a deal-breaker - this area's public-transport access ranks low (${pct(signals.transportPct)} percentile in Greater Melbourne).`,
    });
  }

  // Lightweight fit notes for priorities the user said matter (not deal-breakers).
  if (profile.transport === "high" && signals.transportPct != null) {
    notes.push(
      `Transport matters to you: this area ranks ${pct(signals.transportPct)} for public transport in Greater Melbourne.`
    );
  }
  if (profile.car === "no_car" && signals.transportPct != null && signals.transportPct < WEAK_TRANSPORT_PCT) {
    notes.push(
      "You don't drive, and this area's public transport ranks low - check the actual walk to stops and service frequency."
    );
  }
  if (profile.quiet === "high" && signals.hasNoiseFlag) {
    notes.push(
      "You value quiet, and this point is close to a transport-noise source - worth a peak-hour and after-dark visit."
    );
  }

  return { hits, notes, mode };
}
