/**
 * Buyer "Location Check" due-diligence report - a deterministic, sourced
 * findings engine. Given a point (and the SA2 it falls in) it produces a
 * plain-English screening report: what looks positive, what to verify, what is
 * nearby, and what we cannot determine yet.
 *
 * Hard rules (see Buyer-Mode strategy + product spec):
 * - NO AI calls, NO network, NO randomness - pure + testable.
 * - NEVER invents data. Missing layers (price, school catchments, parcel-level
 *   overlays) are surfaced as `unavailable` / `verify` with confidence markers,
 *   never fabricated.
 * - NEVER property/financial/legal/insurance/planning advice. Every finding is
 *   an indicator with a geography + confidence + "what to verify" action.
 * - This layer is a context lens; it is NOT folded into the scored liveability
 *   composite.
 *
 * P1-10: the engine now lives in lib/buyer-report/* split by lens family
 * (types, amenities, transit-noise, planning-hazards, environment,
 * area-context, schools, prices, summary, build). This barrel re-exports the
 * ENTIRE public API so every consumer + test import stays unchanged.
 */
export type {
  FutureStationLite,
  BuyerConfidence,
  BuyerFindingKind,
  BuyerFindingSeverity,
  BuyerGeography,
  BuyerSourceRef,
  BuyerFinding,
  NearbyAmenity,
  BuyerReport,
  BuildBuyerReportInput,
} from "./buyer-report/types";
export {
  DEFAULT_RADIUS_METERS,
  ADJACENCY_THRESHOLD_KM,
  MAJOR_PROJECT_THRESHOLD_KM,
  STRAIGHT_LINE_CAVEAT,
  STREET_NETWORK_CAVEAT,
  BUYER_DISCLAIMER,
  UNCONFIRMED_PARCEL_CAVEAT,
  AMENITY_GROUPS,
} from "./buyer-report/types";
export {
  findContainingSa2,
  getNearbyAmenities,
  dedupeParkAmenities,
  PARK_MERGE_METERS,
} from "./buyer-report/amenities";
export { buildBuyerReport } from "./buyer-report/build";
