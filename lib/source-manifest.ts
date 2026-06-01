/**
 * Source/provenance manifest helpers for the Buyer report. Reads the committed
 * `data/generated/sources.json` (the same manifest the methodology page and the
 * pipeline hash step use) and normalises entries to `BuyerSourceRef`.
 *
 * If a report cannot map a field to an exact source it should NOT fake one —
 * callers fall back to the general manifest + a medium/unknown confidence.
 */
import rawSources from "@/data/generated/sources.json";
import type { BuyerSourceRef } from "./buyer-report";

type RawSource = {
  id: string;
  name: string;
  url?: string;
  licence?: string;
  period?: string;
  fetchedAt?: string;
  sha256?: string;
  derived?: boolean;
};

const SOURCES: RawSource[] = (rawSources as RawSource[]) ?? [];
const BY_ID = new Map<string, RawSource>(SOURCES.map((s) => [s.id, s]));

function toRef(s: RawSource): BuyerSourceRef {
  return {
    id: s.id,
    label: s.name,
    url: s.url,
    fetchedAt: s.fetchedAt,
    period: s.period,
    licence: s.licence,
  };
}

export function getSourceById(id: string): BuyerSourceRef | undefined {
  const s = BY_ID.get(id);
  return s ? toRef(s) : undefined;
}

/** Resolve a list of source ids to refs, dropping any that are unknown. */
export function getSourcesByIds(ids: string[]): BuyerSourceRef[] {
  const out: BuyerSourceRef[] = [];
  for (const id of ids) {
    const ref = getSourceById(id);
    if (ref) out.push(ref);
  }
  return out;
}

/** Every source in the manifest (for the "sources used" block on a report). */
export function allBuyerSources(): BuyerSourceRef[] {
  return SOURCES.map(toRef);
}

/**
 * Normalise arbitrary raw source-like objects to `BuyerSourceRef`. Accepts both
 * manifest shape (`name`) and already-normalised shape (`label`). Unknown/blank
 * entries are dropped rather than faked.
 */
export function normaliseSourceRefs(rawList: unknown[]): BuyerSourceRef[] {
  if (!Array.isArray(rawList)) return [];
  const out: BuyerSourceRef[] = [];
  for (const r of rawList) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : undefined;
    const label =
      typeof o.label === "string"
        ? o.label
        : typeof o.name === "string"
          ? o.name
          : undefined;
    if (!id || !label) continue;
    out.push({
      id,
      label,
      url: typeof o.url === "string" ? o.url : undefined,
      fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : undefined,
      period: typeof o.period === "string" ? o.period : undefined,
      licence: typeof o.licence === "string" ? o.licence : undefined,
    });
  }
  return out;
}

/** Human-readable "data period · updated date" string for a source. */
export function formatSourceDate(source: BuyerSourceRef): string {
  const parts: string[] = [];
  if (source.period) parts.push(source.period);
  if (source.fetchedAt) parts.push(`updated ${source.fetchedAt}`);
  return parts.length ? parts.join(" · ") : "date not recorded";
}
