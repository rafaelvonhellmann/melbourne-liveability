/**
 * Pure helpers for the data + reference double-check mechanism (scripts/
 * verify-sources.ts). Kept dependency-free so the rules are unit-tested without
 * network or filesystem. The goal: never ship a claim whose source is missing,
 * mislabelled, dead, or referenced in code but absent from the manifest.
 */
import type { RegionId } from "../../lib/regions.js";
import { REGISTRY_BY_ID } from "./source-registry.js";

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
  regions?: readonly RegionId[];
};

export type IssueSeverity = "error" | "warn";
export type SourceIssue = { id: string; severity: IssueSeverity; message: string };

const RESTRICTED_LICENCE_TEXT = /NC|non[- ]?commercial|share[- ]?alike/i;

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

    const registrySource = REGISTRY_BY_ID.get(s.id);
    const verdict = s.licenceVerdict ?? registrySource?.licenceVerdict;
    if (verdict) {
      if (s.licence && RESTRICTED_LICENCE_TEXT.test(s.licence) && BAKEABLE_VERDICTS.has(verdict)) {
        issues.push({
          id,
          severity: "error",
          message: `licence text looks restricted (${s.licence}) but registry verdict is ${verdict}`,
        });
      }
      if (
        !s.derived &&
        typeof s.sha256 === "string" &&
        s.sha256.trim().length > 0 &&
        !BAKEABLE_VERDICTS.has(verdict)
      ) {
        issues.push({
          id,
          severity: "error",
          message: `non-derived baked source has non-bakeable licence verdict ${verdict}`,
        });
      }
    }

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
  for (const m of code.matchAll(/registryId\(\s*["']([^"']+)["']\s*\)/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

export function extractAdapterSourceIds(code: string): string[] {
  const ids = new Set<string>();
  for (const m of code.matchAll(/\b(?:sourceId|\w+SourceId)\s*:\s*["']([^"']+)["']/g)) {
    ids.add(m[1]);
  }
  for (const id of extractReferencedSourceIds(code)) ids.add(id);
  return [...ids];
}

/** Referenced ids that are NOT present in the manifest (dangling citations). */
export function danglingReferences(referenced: string[], manifestIds: Iterable<string>): string[] {
  const have = new Set(manifestIds);
  return referenced.filter((id) => !have.has(id));
}
