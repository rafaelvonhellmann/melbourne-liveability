import type { DomainId, ScoreWeights } from "./types";
import { normalizeWeights } from "./weights";

/** Mover interest lenses — set default map layer + optional weight skew. */
export type InterestViewId =
  | "general"
  | "rental"
  | "homeBuyer"
  | "education"
  | "dataQuality";

export type InterestViewConfig = {
  id: InterestViewId;
  label: string;
  description: string;
  defaultDomain: DomainId;
  confidenceMode: boolean;
  /** null = keep current / default weights */
  weights: ScoreWeights | null;
};

export const INTEREST_VIEWS: Record<InterestViewId, InterestViewConfig> = {
  general: {
    id: "general",
    label: "Balanced",
    description: "Default liveability weights across all domains.",
    defaultDomain: "affordability",
    confidenceMode: false,
    weights: null,
  },
  rental: {
    id: "rental",
    label: "Renting",
    description: "Affordability and transport weighted for renters.",
    defaultDomain: "affordability",
    confidenceMode: false,
    weights: normalizeWeights({
      affordability: 40,
      transport: 24,
      safety: 14,
      health: 10,
      hazards: 6,
      education: 4,
      income: 2,
    }),
  },
  homeBuyer: {
    id: "homeBuyer",
    label: "Home buyer",
    description:
      "Context lens for buyers: affordability/cost-pressure, safety, schools, transport, low hazards. No sale-price data.",
    defaultDomain: "affordability",
    confidenceMode: false,
    weights: normalizeWeights({
      affordability: 30,
      safety: 18,
      education: 16,
      transport: 14,
      hazards: 14,
      health: 6,
      income: 2,
    }),
  },
  education: {
    id: "education",
    label: "Education",
    description: "Schools, preschool, and family-friendly safety.",
    defaultDomain: "education",
    confidenceMode: false,
    weights: normalizeWeights({
      affordability: 18,
      transport: 14,
      safety: 18,
      health: 14,
      hazards: 6,
      education: 26,
      income: 4,
    }),
  },
  dataQuality: {
    id: "dataQuality",
    label: "Data quality",
    description: "Explore how well each area is measured (context layer).",
    defaultDomain: "affordability",
    confidenceMode: true,
    weights: null,
  },
};

export function parseInterestView(raw: string | null): InterestViewId | null {
  if (!raw) return null;
  return raw in INTEREST_VIEWS ? (raw as InterestViewId) : null;
}
