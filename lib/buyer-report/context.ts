/**
 * Shared per-build state threaded through the finding collectors - the locals
 * the monolithic buildBuyerReport computed up front before its finding
 * sections ran. Internal only; never exported from the lib/buyer-report barrel.
 */
import type { Place } from "../types";
import type { BuildBuyerReportInput } from "./types";

export interface EngineCtx {
  input: BuildBuyerReportInput;
  place: Place | null;
  mode: "pin" | "sa2";
  hasPoint: boolean;
  /** The point used for nearby maths: the pin, else the SA2 centroid. */
  point: { lat: number; lng: number } | null;
  /** The straight-line 15-minute-walk phrasing used across findings. */
  walkPhrase: string;
  /** STRAIGHT_LINE_CAVEAT - distances are straight-line, not routes. */
  amenityCaveat: string;
  /** Total reachable POIs per category after park dedupe. */
  amenityCountsByCategory: Record<string, number>;
  /** How many of the everyday WALK_CATEGORY_IDS have at least one reachable POI. */
  reachableEveryday: number;
  /** A point exists AND POIs were supplied - the nearby lens has data. */
  haveNearbyData: boolean;
}
