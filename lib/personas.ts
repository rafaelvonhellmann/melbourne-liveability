import type { ScoreWeights } from "./types";
import { normalizeWeights } from "./weights";

export type PersonaId = "family" | "youngPro" | "retiree" | "student";

export const PERSONA_PRESETS: Record<
  PersonaId,
  { label: string; description: string; weights: ScoreWeights }
> = {
  family: {
    label: "Family",
    description: "Education, safety, and health weighted higher.",
    weights: {
      affordability: 22,
      transport: 14,
      safety: 22,
      health: 22,
      income: 6,
      hazards: 6,
      education: 28,
    },
  },
  youngPro: {
    label: "Young professional",
    description: "Transport and affordability weighted higher.",
    weights: {
      affordability: 28,
      transport: 28,
      safety: 12,
      health: 10,
      income: 12,
      hazards: 4,
      education: 6,
    },
  },
  retiree: {
    label: "Retiree",
    description: "Health, safety, and low hazard exposure.",
    weights: {
      affordability: 20,
      transport: 12,
      safety: 22,
      health: 26,
      income: 8,
      hazards: 12,
      education: 0,
    },
  },
  student: {
    label: "Student",
    description: "Affordability and transport weighted higher.",
    weights: {
      affordability: 34,
      transport: 28,
      safety: 10,
      health: 8,
      income: 8,
      hazards: 4,
      education: 8,
    },
  },
};

export function personaWeights(id: PersonaId): ScoreWeights {
  return normalizeWeights(PERSONA_PRESETS[id].weights);
}
