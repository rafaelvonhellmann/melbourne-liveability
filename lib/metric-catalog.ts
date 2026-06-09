import type { DomainId } from "./types";

/**
 * Single source of truth for the scored sub-indicators we hold per SA2: the
 * human label, unit, value-formatting hint, and directionality.
 *
 * It mirrors the indicators emitted by `scripts/score.ts` (one entry per
 * `subIndicators` key per scored domain). `higherIsBetter` records the honest
 * direction; it matches the `invert` flag used when percentile-ranking each
 * indicator (inverted indicators are "lower is better"). This catalog is reused
 * by the server-side Greater-Melbourne benchmark computation and by the
 * client-side metric cards so the two can never drift.
 */

export type MetricFormat =
  | "ratio"
  | "count"
  | "km"
  | "percent"
  | "currency"
  | "rate";

export type MetricDef = {
  domain: DomainId;
  /** Matches the `subIndicators` key in `place.domains[domain]`. */
  key: string;
  label: string;
  unit: string;
  format: MetricFormat;
  /** Honest directionality - "higher is better" vs "lower is better". */
  higherIsBetter: boolean;
  description: string;
};

export const METRIC_CATALOG: MetricDef[] = [
  {
    domain: "affordability",
    key: "rentToIncome",
    label: "Rent-to-income",
    unit: "ratio",
    format: "ratio",
    higherIsBetter: false,
    description:
      "Median weekly rent ÷ LOCAL equivalised household income - a cost-pressure proxy (lower is better). Wealthy areas can look affordable because residents' incomes are high, not because rents are low. No sale-price data.",
  },
  {
    domain: "transport",
    key: "stops800m",
    label: "PT stops within 800 m",
    unit: "stops",
    format: "count",
    higherIsBetter: true,
    description: "Train, tram and bus stops within an 800 m walk of the area's centre.",
  },
  {
    domain: "transport",
    key: "amPeakFreq",
    label: "AM-peak scheduled trips",
    unit: "trips",
    format: "count",
    higherIsBetter: true,
    description: "Weekday AM-peak (07:00–09:59) scheduled trip count.",
  },
  {
    domain: "transport",
    key: "ptModes",
    label: "Transport mode mix",
    unit: "modes",
    format: "count",
    higherIsBetter: true,
    description: "How many of train / tram / bus have a stop within 800 m (about a 10-minute walk) of the area centre.",
  },
  {
    domain: "safety",
    key: "propertyCrime",
    label: "Property crime",
    unit: "rate",
    format: "rate",
    higherIsBetter: false,
    description:
      "Recorded property offences (theft, burglary, car crime) per person, for the wider suburb / council area.",
  },
  {
    domain: "safety",
    key: "violentCrime",
    label: "Violent crime",
    unit: "rate",
    format: "rate",
    higherIsBetter: false,
    description:
      "Recorded offences against the person (assault and similar) per person, for the wider suburb / council area.",
  },
  {
    domain: "health",
    key: "hospitalDistKm",
    label: "Distance to public hospital",
    unit: "km",
    format: "km",
    higherIsBetter: false,
    description: "Straight-line distance to the nearest general hospital.",
  },
  {
    domain: "health",
    key: "gpCount2km",
    label: "GPs / clinics within 2 km",
    unit: "GPs",
    format: "count",
    higherIsBetter: true,
    description: "GP and medical-clinic locations within 2 km.",
  },
  {
    domain: "income",
    key: "medianDhi",
    label: "Median household income",
    unit: "$/week",
    format: "currency",
    higherIsBetter: true,
    description: "Median equivalised household income, weekly (ABS 2021).",
  },
  {
    domain: "income",
    key: "employmentRatio",
    label: "Employment-to-population",
    unit: "ratio",
    format: "ratio",
    higherIsBetter: true,
    description: "Share of residents who are in a job.",
  },
  {
    domain: "income",
    key: "participationRate",
    label: "Labour-force participation",
    unit: "%",
    format: "percent",
    higherIsBetter: true,
    description: "Share of working-age residents who are working or actively looking for work - a measure of how economically active the area is.",
  },
  {
    domain: "hazards",
    key: "bushfirePct",
    label: "Bushfire-overlay land",
    unit: "% of area",
    format: "percent",
    higherIsBetter: false,
    description:
      "How much of this area is officially mapped as bushfire-prone, which can trigger building rules. It is a planning flag, not a prediction that a specific home will burn - always check the exact address.",
  },
  {
    domain: "hazards",
    key: "floodPct",
    label: "Flood-overlay land",
    unit: "% of area",
    format: "percent",
    higherIsBetter: false,
    description:
      "How much of this area sits inside a flood planning overlay, which can trigger building rules. It is a planning flag, not a prediction that a specific home will flood - always check the exact address.",
  },
  {
    domain: "education",
    key: "schools2km",
    label: "Schools within 2 km",
    unit: "schools",
    format: "count",
    higherIsBetter: true,
    description: "Schools within 2 km of the area's centre.",
  },
  {
    domain: "education",
    key: "preschoolEnrolled",
    label: "Children enrolled in preschool",
    unit: "children",
    format: "count",
    higherIsBetter: true,
    description: "Number of local children enrolled in preschool.",
  },
];

export function metricsForDomain(domain: DomainId): MetricDef[] {
  return METRIC_CATALOG.filter((m) => m.domain === domain);
}

/** Format a raw indicator value for display, honouring its format hint. */
export function formatMetricValue(
  raw: number | null,
  format: MetricFormat
): string {
  if (raw == null || !Number.isFinite(raw)) return "—";
  switch (format) {
    case "ratio":
      return raw.toFixed(2);
    case "km":
      return raw.toFixed(2);
    case "percent":
      return raw.toFixed(1);
    case "currency":
      return `$${Math.round(raw).toLocaleString("en-AU")}`;
    case "count":
      return Math.round(raw).toLocaleString("en-AU");
    case "rate":
      return Math.abs(raw) >= 1000
        ? Math.round(raw).toLocaleString("en-AU")
        : raw.toFixed(1);
    default:
      return String(raw);
  }
}
