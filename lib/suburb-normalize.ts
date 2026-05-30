/** Normalized suburb key for crosswalk / VCSA matching. */
export function normalizeSuburbName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(.*\)/g, "")
    .trim();
}

export function suburbLgaKey(suburb: string, lga: string): string {
  const normLga = lga.toLowerCase().replace(/\s+city$/i, "").trim();
  return `${normalizeSuburbName(suburb)}|${normLga}`;
}
