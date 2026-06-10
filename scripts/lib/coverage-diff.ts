/**
 * Field-coverage accounting for data/generated/places.json. Counts how many
 * places have each (nested, dot-path) field populated and diffs two snapshots,
 * so the refresh workflow can refuse to commit an artifact that silently lost
 * a field (e.g. an apply-managed context layer whose raw input was missing in
 * CI). Pure functions - the CLI lives in scripts/verify-coverage-diff.ts.
 */

export type CoverageCounts = Record<string, number>;

export type CoverageRow = {
  field: string;
  before: number;
  after: number;
  status: "ok" | "new" | "drop" | "gone";
};

export type CoverageDiff = { ok: boolean; rows: CoverageRow[] };

export const DEFAULT_MAX_DROP_PCT = 2;
const DEFAULT_MAX_DEPTH = 4;

/** Synthetic row tracking the total number of places. */
export const PLACES_FIELD = "(places)";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A value counts toward a field's populated tally unless null-ish or []. */
function isPopulated(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Counts populated fields across places, keyed by dot-path. Plain objects are
 * counted themselves AND recursed into (depth-capped), so both "context" and
 * "context.community.volunteerPct" get a row.
 */
export function countPopulatedFields(
  places: unknown[],
  maxDepth = DEFAULT_MAX_DEPTH
): CoverageCounts {
  const counts: CoverageCounts = { [PLACES_FIELD]: places.length };
  function walk(obj: Record<string, unknown>, prefix: string, depth: number) {
    for (const [key, v] of Object.entries(obj)) {
      if (!isPopulated(v)) continue;
      const p = prefix ? `${prefix}.${key}` : key;
      counts[p] = (counts[p] ?? 0) + 1;
      if (depth < maxDepth && isPlainObject(v)) walk(v, p, depth + 1);
    }
  }
  for (const place of places) {
    if (isPlainObject(place)) walk(place, "", 1);
  }
  return counts;
}

/**
 * Diffs two coverage counts. Fails (ok=false) when any field's populated
 * count drops by MORE than maxDropPct, or disappears entirely. Brand-new
 * fields pass.
 */
export function diffCoverage(
  before: CoverageCounts,
  after: CoverageCounts,
  maxDropPct = DEFAULT_MAX_DROP_PCT
): CoverageDiff {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const rows: CoverageRow[] = [];
  let ok = true;
  for (const field of fields) {
    const b = before[field] ?? 0;
    const a = after[field] ?? 0;
    let status: CoverageRow["status"] = "ok";
    if (b === 0 && a > 0) status = "new";
    else if (b > 0 && a === 0) status = "gone";
    else if (a < b * (1 - maxDropPct / 100)) status = "drop";
    if (status === "gone" || status === "drop") ok = false;
    rows.push({ field, before: b, after: a, status });
  }
  return { ok, rows };
}

/** Per-field diff table: changed/new/failed rows (all rows when showAll). */
export function formatCoverageTable(rows: CoverageRow[], showAll = false): string {
  const shown = showAll
    ? rows
    : rows.filter((r) => r.status !== "ok" || r.before !== r.after);
  const width = Math.max(5, ...shown.map((r) => r.field.length));
  const lines = [
    `${"field".padEnd(width)}  ${"before".padStart(6)}  ${"after".padStart(6)}  status`,
  ];
  for (const r of shown) {
    lines.push(
      `${r.field.padEnd(width)}  ${String(r.before).padStart(6)}  ${String(r.after).padStart(6)}  ${r.status}`
    );
  }
  const unchanged = rows.length - shown.length;
  if (!showAll && unchanged > 0) lines.push(`(${unchanged} field(s) unchanged)`);
  return lines.join("\n");
}
