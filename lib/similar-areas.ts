import type { DomainId, Place } from "./types";

/**
 * "Find areas like this" - a multi-criteria similarity match over the per-domain
 * liveability percentiles. Deliberately NOT a single composite or a price model:
 * two areas are "alike" when they rank similarly across the domains, so the match
 * is the mean absolute percentile gap over the domains both areas actually have.
 *
 * Honest by construction:
 * - Only domains with a real percentile in BOTH areas are compared (a missing
 *   indicator is never imputed to 0 or to the median).
 * - Equal-weighted, independent of the user's priority sliders, so an area's
 *   peers are stable and reproducible (good for the static profile pages).
 * - `sharedDomains` is surfaced so a thin match (few comparable domains) can be
 *   caveated rather than presented as confident.
 */

export type SimilarMatch = {
  place: Place;
  /** 0-100; 100 = identical percentiles across every compared domain. */
  similarity: number;
  /** Domains compared = present + non-null in BOTH areas. */
  sharedDomains: DomainId[];
  /** Up to 3 domains where both areas rank high AND close - the common strengths. */
  sharedStrengths: DomainId[];
};

/**
 * Slim, link-ready projection of a match - the only fields the UI needs. Used so
 * the static profile pages don't inline whole Place objects (with every
 * subIndicator) for each of the 6 peers, x ~354 pages.
 */
export type SimilarAreaItem = {
  slug: string;
  name: string;
  lga: string;
  similarity: number;
  sharedDomainCount: number;
  sharedStrengths: DomainId[];
};

export function toSimilarItems(matches: SimilarMatch[]): SimilarAreaItem[] {
  return matches.map((m) => ({
    slug: m.place.slug,
    name: m.place.name,
    lga: m.place.lga,
    similarity: m.similarity,
    sharedDomainCount: m.sharedDomains.length,
    sharedStrengths: m.sharedStrengths,
  }));
}

export type FindSimilarOptions = {
  /** Max matches to return. Default 6. */
  limit?: number;
  /** Minimum comparable domains required (clamped to what the reference has). Default 4. */
  minSharedDomains?: number;
};

const DEFAULT_LIMIT = 6;
const DEFAULT_MIN_SHARED = 4;
/** Both areas upper-half and within this gap → counts as a shared strength. */
const STRENGTH_FLOOR = 55;
const STRENGTH_GAP = 15;

/** The domains with a usable (scored, non-null) percentile for a place. */
function domainPercentiles(p: Place): Map<DomainId, number> {
  const m = new Map<DomainId, number>();
  for (const [id, d] of Object.entries(p.domains)) {
    if (d && d.percentile != null) m.set(id as DomainId, d.percentile);
  }
  return m;
}

export function findSimilarAreas(
  reference: Place,
  all: Place[],
  opts: FindSimilarOptions = {}
): SimilarMatch[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const refPct = domainPercentiles(reference);
  if (refPct.size === 0) return [];
  // Never demand more shared domains than the reference even has, so a data-poor
  // area still gets peers (the thin-match caveat carries the honesty instead).
  const minShared = Math.min(opts.minSharedDomains ?? DEFAULT_MIN_SHARED, refPct.size);

  const matches: SimilarMatch[] = [];
  for (const cand of all) {
    if (cand.slug === reference.slug || cand.nonResidential) continue;
    const candPct = domainPercentiles(cand);

    const shared: DomainId[] = [];
    const strengths: { id: DomainId; avg: number }[] = [];
    let sumGap = 0;
    for (const [id, rp] of refPct) {
      const cp = candPct.get(id);
      if (cp == null) continue;
      shared.push(id);
      sumGap += Math.abs(rp - cp);
      if (rp >= STRENGTH_FLOOR && cp >= STRENGTH_FLOOR && Math.abs(rp - cp) <= STRENGTH_GAP) {
        strengths.push({ id, avg: (rp + cp) / 2 });
      }
    }
    if (shared.length < minShared) continue;

    const meanGap = sumGap / shared.length; // 0-100, lower = more alike
    const similarity = Math.round(Math.max(0, 100 - meanGap));
    const sharedStrengths = strengths
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)
      .map((s) => s.id);
    matches.push({ place: cand, similarity, sharedDomains: shared, sharedStrengths });
  }

  return matches
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        b.sharedDomains.length - a.sharedDomains.length ||
        a.place.name.localeCompare(b.place.name)
    )
    .slice(0, limit);
}
