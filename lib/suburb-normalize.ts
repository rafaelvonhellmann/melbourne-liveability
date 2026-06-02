/** Normalized suburb key for crosswalk / VCSA matching. */
export function normalizeSuburbName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(.*\)/g, "")
    .trim();
}

/**
 * Canonical LGA name for cross-source matching. Councils get renamed but our
 * ABS SA2->LGA boundaries lag the rename, so the same council can appear under
 * two names across sources (VCSA crime vs ABS geography). Collapse known
 * aliases to one key so crime joins don't silently drop a whole council.
 */
const LGA_ALIASES: Record<string, string> = {
  // Moreland was renamed Merri-bek in 2022; VCSA crime uses the new name, our
  // ABS boundaries still say Moreland. Without this, all Moreland SA2s (e.g.
  // Brunswick East) get no recorded-offence data at all.
  "merri-bek": "moreland",
  merribek: "moreland",
};

export function normalizeLgaName(lga: string): string {
  const base = lga
    .toLowerCase()
    .replace(/\s+city$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return LGA_ALIASES[base] ?? base;
}

export function suburbLgaKey(suburb: string, lga: string): string {
  return `${normalizeSuburbName(suburb)}|${normalizeLgaName(lga)}`;
}
