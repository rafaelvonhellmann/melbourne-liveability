import type { Place, DomainId } from "./types";
import { V1_SCORED_DOMAINS } from "./domains";

/**
 * A short, plain-English summary of an area, built ONLY from the data we already
 * hold - a quick orientation for a buyer, agent or broker. Deliberately sober
 * (an independent read, not a sales pitch) and honest-by-design: every claim is
 * a measured rank or share, it is about the wider area (its SA2), and it is
 * never advice on a specific property. Pure + deterministic; returns null when
 * there isn't enough scored data to say something useful.
 *
 * Phrasing is direction-aware: domains are scored so a HIGH percentile is good,
 * but "hazards"/"safety" need careful wording (a strong area means LOW hazard
 * exposure / low crime), so strengths and weaknesses use separate label maps.
 */
const POS_LABEL: Partial<Record<DomainId, string>> = {
  affordability: "affordability",
  transport: "public transport",
  safety: "safety",
  health: "health access",
  hazards: "low hazard exposure",
  education: "schools",
  income: "the local economy",
};

const NEG_LABEL: Partial<Record<DomainId, string>> = {
  affordability: "affordability",
  transport: "public transport",
  safety: "safety",
  health: "health access",
  hazards: "hazard exposure",
  education: "schools",
  income: "the local economy",
};

function joinPhrases(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function buildAreaSummary(place: Place): string | null {
  const scored = V1_SCORED_DOMAINS.map((d) => ({
    d,
    pct: place.domains?.[d]?.percentile ?? null,
  })).filter(
    (x): x is { d: DomainId; pct: number } =>
      typeof x.pct === "number" && Number.isFinite(x.pct)
  );
  if (scored.length < 3) return null;

  const sorted = [...scored].sort((a, b) => b.pct - a.pct);
  const strong = sorted
    .filter((x) => x.pct >= 66)
    .slice(0, 3)
    .map((x) => x.d);
  const strongSet = new Set(strong);
  const weak = sorted
    .filter((x) => x.pct <= 33 && !strongSet.has(x.d))
    .map((x) => x.d)
    .slice(-2);

  const out: string[] = [];

  const density = place.context?.population?.densityPerKm2 ?? null;
  const character =
    density == null
      ? "an area in Greater Melbourne"
      : density >= 4000
        ? "a dense, urban part of Greater Melbourne"
        : density >= 1500
          ? "an established middle-suburban area"
          : "a lower-density, outer-suburban area";
  out.push(`${place.name}${place.lga ? `, in ${place.lga},` : ""} is ${character}.`);

  if (strong.length > 0) {
    out.push(
      `Among Greater Melbourne areas it ranks strongly for ${joinPhrases(
        strong.map((d) => POS_LABEL[d] ?? d)
      )}.`
    );
  }
  if (weak.length > 0) {
    out.push(`It rates lower for ${joinPhrases(weak.map((d) => NEG_LABEL[d] ?? d))}.`);
  }

  const renter = place.context?.community?.renterPct ?? null;
  if (renter != null && Number.isFinite(renter)) {
    const mix =
      renter >= 55
        ? "predominantly a rental market"
        : renter >= 35
          ? "a mix of renters and owner-occupiers"
          : "mostly owner-occupied";
    out.push(`Housing is ${mix} (about ${Math.round(renter)}% of homes rented).`);
  }

  out.push(
    "This describes the wider area, not any single property, and is context - not advice."
  );
  return out.join(" ");
}
