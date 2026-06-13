import type { DomainId } from "./types";
import { NEG_LABEL, POS_LABEL } from "./area-summary";

export type VerdictBandId =
  | "well-below"
  | "below"
  | "average"
  | "above"
  | "excellent";

export type VerdictBand = {
  id: VerdictBandId;
  label: string;
  tone: "negative" | "neutral" | "positive";
};

export type DomainVerdict = {
  headline: string;
  band: VerdictBand;
};

const BANDS: VerdictBand[] = [
  { id: "well-below", label: "Well below average", tone: "negative" },
  { id: "below", label: "Below average", tone: "negative" },
  { id: "average", label: "Around average", tone: "neutral" },
  { id: "above", label: "Above average", tone: "positive" },
  { id: "excellent", label: "Excellent", tone: "positive" },
];

const AVERAGE_NOUN: Partial<Record<DomainId, string>> = {
  affordability: "rent burden",
  safety: NEG_LABEL.safety,
  hazards: NEG_LABEL.hazards,
  transport: POS_LABEL.transport,
  health: POS_LABEL.health,
  education: POS_LABEL.education,
  income: POS_LABEL.income,
};

export function bandFor(pct: number | null): VerdictBand | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const v = Math.max(0, Math.min(100, pct));
  if (v < 20) return BANDS[0];
  if (v < 40) return BANDS[1];
  if (v < 60) return BANDS[2];
  if (v < 80) return BANDS[3];
  return BANDS[4];
}

function comparativeHeadline(domain: DomainId, pct: number, regionLabel: string): string {
  switch (domain) {
    case "affordability":
      return `Lower rent burden than ${pct}% of ${regionLabel}`;
    case "safety":
      return `Safer than ${pct}% of ${regionLabel}`;
    case "hazards":
      return `Lower bushfire & flood exposure than ${pct}% of ${regionLabel}`;
    case "transport":
      return `Better public transport access than ${pct}% of ${regionLabel}`;
    case "health":
      return `Better health access than ${pct}% of ${regionLabel}`;
    case "education":
      return `Better school access than ${pct}% of ${regionLabel}`;
    case "income":
      return `Stronger local economy than ${pct}% of ${regionLabel}`;
    default:
      return `Better ${POS_LABEL[domain] ?? domain} than ${pct}% of ${regionLabel}`;
  }
}

export function domainVerdict(
  domain: DomainId,
  pct: number | null,
  regionLabel: string
): DomainVerdict | null {
  const band = bandFor(pct);
  if (!band || pct == null || !Number.isFinite(pct)) return null;

  if (band.id === "average") {
    return {
      headline: `Around the ${regionLabel} average for ${AVERAGE_NOUN[domain] ?? domain}`,
      band,
    };
  }

  return {
    headline: comparativeHeadline(domain, Math.round(pct), regionLabel),
    band,
  };
}
