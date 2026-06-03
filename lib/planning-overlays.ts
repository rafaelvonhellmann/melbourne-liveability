/**
 * Planning-overlay context (context-only, never scored).
 *
 * We report the AREA SHARE of an SA2 within a Heritage Overlay (HO). A Heritage
 * Overlay is a planning CONTROL - it can restrict demolition, external changes
 * and subdivision - so for a buyer it is a real due-diligence signal. But it is
 * an area share, NOT a parcel-level result: a property inside a "0%" SA2 could
 * still be individually affected, and vice versa. Always defer to the planning
 * certificate for the specific property. Nothing here enters any score.
 */
import type { PlanningOverlays, ConservationOverlayCode } from "./types";

export type { PlanningOverlays, ConservationOverlayCode };

/** Round an overlay share to 1 dp, null-safe + clamped to 0-100. */
export function roundOverlayPct(pct: number | null): number | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

/**
 * Coarse buyer-facing band for heritage-overlay coverage. Deliberately
 * conservative: below 1% reads as "little/none" rather than implying precision
 * the area share doesn't have.
 */
export function heritageCoverageBand(
  pct: number | null
): "unknown" | "minimal" | "partial" | "extensive" {
  if (pct == null) return "unknown";
  if (pct < 1) return "minimal";
  if (pct < 25) return "partial";
  return "extensive";
}

/**
 * Conservation / restriction overlay metadata - plain-English meaning for a
 * buyer and a rough materiality used only to order the buyer's attention. These
 * are planning CONTROLS surfaced as an SA2 area share; nothing here is scored.
 */
export type OverlayMeta = {
  code: ConservationOverlayCode;
  /** Full overlay name. */
  name: string;
  /** What it means / restricts for a buyer, in plain English. */
  buyerMeaning: string;
  /** How decision-critical it is for ordering (PAO/EAO are the ones not to miss). */
  materiality: "high" | "medium";
};

export const CONSERVATION_OVERLAY_META: Record<ConservationOverlayCode, OverlayMeta> = {
  PAO: {
    code: "PAO",
    name: "Public Acquisition Overlay",
    buyerMeaning:
      "Land is reserved for a future public work (such as a road, rail or school) and can be compulsorily acquired by the authority named in the overlay.",
    materiality: "high",
  },
  EAO: {
    code: "EAO",
    name: "Environmental Audit Overlay",
    buyerMeaning:
      "The land may be contaminated (often former industrial use). An environmental audit can be required before a sensitive use such as housing or childcare.",
    materiality: "high",
  },
  ESO: {
    code: "ESO",
    name: "Environmental Significance Overlay",
    buyerMeaning:
      "Building and vegetation removal are controlled to protect an environmental value such as water, habitat or coast.",
    materiality: "medium",
  },
  SLO: {
    code: "SLO",
    name: "Significant Landscape Overlay",
    buyerMeaning:
      "Building form, siting and vegetation are controlled to protect a valued landscape character.",
    materiality: "medium",
  },
  VPO: {
    code: "VPO",
    name: "Vegetation Protection Overlay",
    buyerMeaning:
      "A planning permit is needed to remove, destroy or lop protected vegetation.",
    materiality: "medium",
  },
  EMO: {
    code: "EMO",
    name: "Erosion Management Overlay",
    buyerMeaning:
      "Building and works are controlled because the land is prone to erosion or landslip.",
    materiality: "medium",
  },
};

/** Codes ordered most-material-first, for stable display + selection. */
export const CONSERVATION_OVERLAY_CODES: ConservationOverlayCode[] = [
  "PAO",
  "EAO",
  "ESO",
  "SLO",
  "VPO",
  "EMO",
];

export type OverlayShares = Partial<Record<ConservationOverlayCode, number>>;

/**
 * The conservation overlays present in an SA2 at or above `minPct` area share,
 * returned most-material-first (high materiality, then larger share). Used by
 * the buyer report; the same 1% floor as heritage avoids surfacing noise.
 */
export function presentOverlays(
  shares: OverlayShares | null | undefined,
  minPct = 1
): OverlayMeta[] {
  if (!shares) return [];
  const matRank = (m: OverlayMeta["materiality"]) => (m === "high" ? 0 : 1);
  return CONSERVATION_OVERLAY_CODES.filter((c) => (shares[c] ?? 0) >= minPct)
    .map((c) => CONSERVATION_OVERLAY_META[c])
    .sort(
      (a, b) =>
        matRank(a.materiality) - matRank(b.materiality) ||
        (shares[b.code] ?? 0) - (shares[a.code] ?? 0)
    );
}
