/**
 * Social-anchor scoring (context only, never scored).
 *
 * A buyer's life is anchored to specific places - work, a school, family - not
 * just the suburb's averages. This is the wedge that a suburb-score product
 * (e.g. NestCheck) can't match: we let the user drop their real anchors and
 * measure each candidate property against THEM.
 *
 * Honest by construction: straight-line ("as the crow flies") distance only -
 * the same caveat as the 15-minute-access layer. Real drive / public-transport
 * time needs routing (a backend), so the copy always says "verify the real
 * trip". Nothing here enters the locked liveability score.
 */
import { haversineKm, type LngLat } from "./buyer-location";

export type AnchorKind = "work" | "school" | "family" | "other";

export type BuyerAnchor = {
  /** Stable id (derived from the rounded coordinate by the caller). */
  id: string;
  kind: AnchorKind;
  /** User label, e.g. "CBD office", "Mum's place". */
  label: string;
  lng: number;
  lat: number;
};

export const ANCHOR_KINDS: { id: AnchorKind; label: string; noun: string }[] = [
  { id: "work", label: "Work", noun: "commute" },
  { id: "school", label: "School / uni", noun: "school run" },
  { id: "family", label: "Family / friends", noun: "trip" },
  { id: "other", label: "Other place", noun: "trip" },
];

const KIND_LABEL: Record<AnchorKind, string> = Object.fromEntries(
  ANCHOR_KINDS.map((k) => [k.id, k.label])
) as Record<AnchorKind, string>;

const KIND_NOUN: Record<AnchorKind, string> = Object.fromEntries(
  ANCHOR_KINDS.map((k) => [k.id, k.noun])
) as Record<AnchorKind, string>;

export function anchorKindLabel(kind: AnchorKind): string {
  return KIND_LABEL[kind] ?? "Place";
}

export function anchorKindNoun(kind: AnchorKind): string {
  return KIND_NOUN[kind] ?? "trip";
}

export type DistanceBand = "very-close" | "close" | "moderate" | "far";

export type AnchorDistance = {
  anchor: BuyerAnchor;
  /** Straight-line distance from the property pin, km, rounded to 1 dp. */
  km: number;
  band: DistanceBand;
};

/**
 * Coarse distance band for plain-English framing. Deliberately conservative -
 * these are straight-line km, so the bands are wide and never imply a travel
 * time. Tuned for Greater Melbourne everyday trips.
 */
export function distanceBand(km: number): DistanceBand {
  if (km < 2) return "very-close";
  if (km < 5) return "close";
  if (km < 15) return "moderate";
  return "far";
}

export function bandLabel(band: DistanceBand): string {
  switch (band) {
    case "very-close":
      return "very close";
    case "close":
      return "close";
    case "moderate":
      return "a moderate distance";
    case "far":
      return "far";
  }
}

/**
 * Straight-line distance from a property pin ([lng, lat]) to each anchor,
 * nearest-first. Invalid anchors (non-finite coords) are dropped, not faked.
 */
export function anchorDistances(
  pin: LngLat,
  anchors: BuyerAnchor[] | null | undefined
): AnchorDistance[] {
  if (!anchors || anchors.length === 0) return [];
  const out: AnchorDistance[] = [];
  for (const a of anchors) {
    if (!Number.isFinite(a.lng) || !Number.isFinite(a.lat)) continue;
    const raw = haversineKm(pin, [a.lng, a.lat]);
    const km = Math.round(raw * 10) / 10;
    out.push({ anchor: a, km, band: distanceBand(raw) });
  }
  return out.sort((x, y) => x.km - y.km);
}
