import sourcesData from "@/data/generated/sources.json";

export type SourceRecord = {
  id: string;
  name: string;
  url: string;
  licence: string;
  period?: string;
  fetchedAt?: string;
  sha256?: string;
};

const SOURCES = sourcesData as SourceRecord[];
const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

export function getSource(id: string | undefined): SourceRecord | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function allSources(): SourceRecord[] {
  return SOURCES;
}

/** Resolve the unique set of source records used by an indicator map. */
export function sourcesForIndicatorIds(ids: (string | undefined)[]): SourceRecord[] {
  const seen = new Set<string>();
  const out: SourceRecord[] = [];
  for (const id of ids) {
    const s = getSource(id);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}
