import type { DomainId } from "./types";

export type DomainConfig = {
  id: DomainId;
  label: string;
  scored: boolean;
  defaultWeight: number;
  layer: "choropleth" | "choropleth+pins" | "context";
  pinTypes?: string[];
  description: string;
};

/** Scored domains (ULTRAPLAN §1 weights: 30+18+14+14+8+8+8 = 100). */
export const V1_SCORED_DOMAINS: DomainId[] = [
  "affordability",
  "transport",
  "safety",
  "health",
  "hazards",
  "education",
  "income",
];

export const DOMAIN_REGISTRY: DomainConfig[] = [
  {
    id: "affordability",
    label: "Rent vs income",
    scored: true,
    defaultWeight: 30,
    layer: "choropleth",
    description:
      "Median rent relative to LOCAL median income - a cost-pressure measure for residents, not a sale price. High-income suburbs can score well even with high rents, so it is not a guide to how cheap an area is to move into.",
  },
  {
    id: "transport",
    label: "Transport",
    scored: true,
    defaultWeight: 18,
    layer: "choropleth+pins",
    pinTypes: [],
    description: "Public-transport stops within 800 m, the mix of modes, and morning-peak frequency.",
  },
  {
    id: "safety",
    label: "Safety (less crime)",
    scored: true,
    defaultWeight: 14,
    layer: "choropleth+pins",
    pinTypes: ["police"],
    description:
      "Recorded property and violent crime, ranked against Greater Melbourne - greener = lower crime. It is a relative rank, so an area with low crime can still sit mid-pack if most of Melbourne is lower. Nearby police stations shown as context.",
  },
  {
    id: "health",
    label: "Health",
    scored: true,
    defaultWeight: 14,
    layer: "choropleth+pins",
    pinTypes: ["hospital", "gp"],
    description:
      "Distance to public hospitals and the number of GPs / clinics nearby.",
  },
  {
    id: "hazards",
    label: "Hazards",
    scored: true,
    defaultWeight: 8,
    layer: "choropleth",
    description:
      "Share of the area under bushfire-prone and flood planning overlays - less overlay scores better.",
  },
  {
    id: "education",
    label: "Education",
    scored: true,
    defaultWeight: 8,
    layer: "choropleth+pins",
    pinTypes: ["school", "childcare"],
    description: "Schools within 2 km and preschool enrolment.",
  },
  {
    id: "income",
    label: "Economy",
    scored: true,
    defaultWeight: 8,
    layer: "choropleth",
    description:
      "Median household income, employment-to-population ratio, and participation rate.",
  },
  {
    id: "equity",
    label: "Equity",
    scored: false,
    defaultWeight: 0,
    layer: "context",
    description: "SEIFA deciles - context only, never scored.",
  },
  {
    id: "population",
    label: "Community",
    scored: false,
    defaultWeight: 0,
    layer: "context",
    description: "Tenure, dwelling mix, First Nations % - context only.",
  },
  {
    id: "environment",
    label: "Environment",
    scored: false,
    defaultWeight: 0,
    layer: "context",
    description: "Heat and air quality - deferred to v2.",
  },
  {
    id: "politics",
    label: "Politics",
    scored: false,
    defaultWeight: 0,
    layer: "context",
    description: "Federal election booth aggregation - deferred to v2.",
  },
];

export function getDomain(id: DomainId): DomainConfig | undefined {
  return DOMAIN_REGISTRY.find((d) => d.id === id);
}

export function defaultV1Weights(): Record<DomainId, number> {
  const w: Partial<Record<DomainId, number>> = {};
  for (const d of DOMAIN_REGISTRY) {
    if (d.scored) w[d.id] = d.defaultWeight;
  }
  return w as Record<DomainId, number>;
}
