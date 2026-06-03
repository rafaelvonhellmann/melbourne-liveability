/**
 * "Find areas like this" - a plain-language area SEARCH. The user types what they
 * want ("safe, affordable, near a train, good schools") and we rank Greater
 * Melbourne SA2s by the liveability domains those words map to.
 *
 * DETERMINISTIC, no AI: a fixed lexicon maps words/phrases to the seven scored
 * domains (all percentiles, higher = better), so the same query always returns
 * the same ranking - shareable, reproducible, and honest. We surface exactly
 * which words mapped to which domain, and flag any words we could NOT map, so
 * the search never pretends to understand more than it does.
 */
import type { DomainId, Place } from "./types";
import { getDomain } from "./domains";

type LexEntry = { domain: DomainId; terms: string[] };

/** Word/phrase -> scored domain. Generous synonyms; every match is shown to the user. */
export const SEARCH_LEXICON: LexEntry[] = [
  {
    domain: "affordability",
    terms: ["affordable", "affordability", "cheap", "cheaper", "budget", "inexpensive", "value for money", "low rent", "rent", "cost of living"],
  },
  {
    domain: "transport",
    terms: ["transport", "public transport", "transit", "train", "trains", "tram", "trams", "bus", "buses", "commute", "commuting", "station", "walkable", "walkability", "amenities", "shops", "cafes", "cafe", "restaurants", "connected", "car-free", "car free", "well connected"],
  },
  { domain: "safety", terms: ["safe", "safety", "low crime", "crime", "secure", "security"] },
  { domain: "health", terms: ["health", "healthcare", "hospital", "hospitals", "gp", "doctor", "doctors", "clinic", "clinics", "medical"] },
  { domain: "hazards", terms: ["flood", "flooding", "bushfire", "fire risk", "low risk", "hazard", "hazards", "flood-free", "no flood"] },
  { domain: "education", terms: ["school", "schools", "education", "family", "family-friendly", "families", "kids", "children", "childcare", "preschool", "good schools"] },
  { domain: "income", terms: ["high income", "affluent", "wealthy", "prosperous", "well-off", "jobs", "employment", "economy"] },
];

const STOPWORDS = new Set([
  "a", "an", "the", "i", "we", "want", "wants", "wanting", "looking", "look", "for", "with", "near", "nearby",
  "area", "areas", "suburb", "suburbs", "place", "places", "live", "living", "somewhere", "that", "is", "are",
  "to", "and", "or", "in", "of", "my", "me", "our", "good", "nice", "close", "lots", "lot", "have", "has",
  "be", "would", "like", "love", "need", "needs", "find", "show", "me", "great", "really", "very", "more", "with",
]);

export type ParsedQuery = {
  domains: DomainId[];
  /** Each user phrase we matched + the domain it mapped to (for transparency). */
  matched: { term: string; domain: DomainId; label: string }[];
  /** Words we could not map to any domain (shown so the user can rephrase). */
  unmatched: string[];
};

/** Parse free text into the set of domains to rank by + a transparent match report. */
export function parseQuery(text: string): ParsedQuery {
  const q = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  const domains = new Set<DomainId>();
  const matched: { term: string; domain: DomainId; label: string }[] = [];
  const matchedWords = new Set<string>();

  for (const entry of SEARCH_LEXICON) {
    for (const term of entry.terms) {
      const re = new RegExp(`(?:^|\\s)${term.replace(/[-]/g, "[- ]")}(?:\\s|$)`, "i");
      if (re.test(q)) {
        domains.add(entry.domain);
        matched.push({ term, domain: entry.domain, label: getDomain(entry.domain)?.label ?? entry.domain });
        for (const w of term.split(/[\s-]+/)) matchedWords.add(w);
      }
    }
  }

  const unmatched: string[] = [];
  for (const w of q.trim().split(/[\s-]+/)) {
    if (w.length < 3 || STOPWORDS.has(w) || matchedWords.has(w) || /^\d+$/.test(w)) continue;
    if (!unmatched.includes(w)) unmatched.push(w);
  }

  // De-dup matched by domain, keep the first (most specific) phrase per domain for display.
  const seen = new Set<DomainId>();
  const matchedUnique = matched.filter((m) => {
    if (seen.has(m.domain)) return false;
    seen.add(m.domain);
    return true;
  });

  return { domains: [...domains], matched: matchedUnique, unmatched };
}

export type AreaMatch = {
  slug: string;
  name: string;
  lga: string;
  /** 0-100 mean percentile across the matched domains this area has. */
  score: number;
  /** Per matched-domain percentile (rounded), for the result bars. */
  perDomain: { domain: DomainId; label: string; percentile: number }[];
};

/**
 * Rank areas by the mean of their percentiles across `domains` (equal-weighted,
 * higher = better for all seven). Only domains an area actually has are averaged;
 * areas with none of the requested domains are dropped. Returns up to `limit`.
 */
export function rankAreas(
  domains: DomainId[],
  places: Place[],
  limit = 24
): AreaMatch[] {
  if (domains.length === 0 || !Array.isArray(places)) return [];
  const out: AreaMatch[] = [];
  for (const p of places) {
    if (p.nonResidential || !p.domains) continue;
    const perDomain: { domain: DomainId; label: string; percentile: number }[] = [];
    let sum = 0;
    for (const d of domains) {
      const pct = p.domains[d]?.percentile;
      if (pct == null || !Number.isFinite(pct)) continue;
      perDomain.push({ domain: d, label: getDomain(d)?.label ?? d, percentile: Math.round(pct) });
      sum += pct;
    }
    if (perDomain.length === 0) continue;
    out.push({
      slug: p.slug,
      name: p.name,
      lga: p.lga,
      score: Math.round(sum / perDomain.length),
      perDomain,
    });
  }
  return out
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
