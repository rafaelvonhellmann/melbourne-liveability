/**
 * Planning-overlay context (context-only, never scored).
 *
 * We report the AREA SHARE of an SA2 within a Heritage Overlay (HO). A Heritage
 * Overlay is a planning CONTROL — it can restrict demolition, external changes
 * and subdivision — so for a buyer it is a real due-diligence signal. But it is
 * an area share, NOT a parcel-level result: a property inside a "0%" SA2 could
 * still be individually affected, and vice versa. Always defer to the planning
 * certificate for the specific property. Nothing here enters any score.
 */
import type { PlanningOverlays } from "./types";

export type { PlanningOverlays };

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
