/**
 * Pure helpers for the data + reference double-check mechanism (scripts/
 * verify-sources.ts). Kept dependency-free so the rules are unit-tested without
 * network or filesystem. The goal: never ship a claim whose source is missing,
 * mislabelled, dead, or referenced in code but absent from the manifest.
 */

export type LicenceVerdict =
  | "open-commercial-ok"
  | "open-with-attribution"
  | "non-commercial-or-restricted"
  | "paid-or-closed";

export const BAKEABLE_VERDICTS = new Set<LicenceVerdict>([
  "open-commercial-ok",
  "open-with-attribution",
]);

export type SourceRecord = {
  id: string;
  name?: string;
  url?: string;
  method?: string;
  licence?: string;
  verifyNote?: string;
  licenceVerdict?: LicenceVerdict;
  period?: string;
  fetchedAt?: string;
  sha256?: string;
  derived?: boolean;
};

export type IssueSeverity = "error" | "warn";
export type SourceIssue = { id: string; severity: IssueSeverity; message: string };

/**
 * Static validation of the source manifest (no network). Errors block CI;
 * warnings are surfaced but non-fatal. A `derived` source (a computed ratio with
 * no single upstream file) is exempt from url/sha256 requirements.
 */
export function validateSourceManifest(sources: SourceRecord[]): SourceIssue[] {
  const issues: SourceIssue[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const id = s.id ?? "(missing id)";
    if (!s.id) {
      issues.push({ id, severity: "error", message: "entry is missing an id" });
      continue;
    }
    if (seen.has(s.id)) {
      issues.push({ id, severity: "error", message: "duplicate source id" });
    }
    seen.add(s.id);

    if (!s.name?.trim()) issues.push({ id, severity: "error", message: "missing name" });
    if (!s.licence?.trim()) issues.push({ id, severity: "warn", message: "missing licence" });
    if (!s.period?.trim()) issues.push({ id, severity: "warn", message: "missing period" });

    if (s.derived) continue; // computed source: no single url / file / hash.

    if (!s.url?.trim()) {
      issues.push({ id, severity: "error", message: "missing url" });
    } else if (!/^https?:\/\//i.test(s.url)) {
      issues.push({ id, severity: "error", message: `url is not http(s): ${s.url}` });
    }
    if (!s.sha256?.trim()) {
      issues.push({ id, severity: "warn", message: "missing sha256 (run data:hash after fetch)" });
    }
  }
  return issues;
}

/**
 * Extract the source ids a code file references via `getSourcesByIds([...])` or
 * `getSourceById("...")`, so we can prove every cited source exists in the
 * manifest (no dangling references that would render a blank/fake citation).
 */
export function extractReferencedSourceIds(code: string): string[] {
  const ids = new Set<string>();
  for (const m of code.matchAll(/getSourcesByIds\(\s*\[([^\]]*)\]/g)) {
    for (const lit of m[1].matchAll(/["']([^"']+)["']/g)) ids.add(lit[1]);
  }
  for (const m of code.matchAll(/getSourceById\(\s*["']([^"']+)["']/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

/** Referenced ids that are NOT present in the manifest (dangling citations). */
export function danglingReferences(referenced: string[], manifestIds: Iterable<string>): string[] {
  const have = new Set(manifestIds);
  return referenced.filter((id) => !have.has(id));
}
