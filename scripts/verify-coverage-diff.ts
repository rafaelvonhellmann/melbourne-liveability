/**
 * Coverage gate for the data refresh: compares the committed (git HEAD)
 * data/generated/places.json against the freshly regenerated one on disk and
 * exits 1 if any field's populated-count dropped by more than the tolerance
 * (default 2%; override with --max-drop-pct=N or COVERAGE_MAX_DROP_PCT) or a
 * field disappeared entirely. New fields pass. Run AFTER data:build and
 * BEFORE the auto-commit (wired into .github/workflows/data-refresh.yml).
 * Pass --all to print the full per-field table, not just changed rows.
 *
 * Also guards against PERMANENT staleness behind the carry-forward net: fails
 * when a field listed in data/generated/carried-fields.json (written by
 * preserve-context merge, committed by the refresh) was ALSO carried in HEAD,
 * i.e. a second consecutive refresh rebuilt without fresh data for it. The
 * first carry only warns.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, GENERATED } from "./lib/paths.js";
import {
  countPopulatedFields,
  diffCoverage,
  formatCoverageTable,
  DEFAULT_MAX_DROP_PCT,
} from "./lib/coverage-diff.js";
import { classifyCarried } from "./lib/context-merge.js";

const REL_PATH = "data/generated/places.json";
const CARRIED_REL_PATH = "data/generated/carried-fields.json";

function maxDropPct(): number {
  const arg = process.argv.find((a) => a.startsWith("--max-drop-pct="));
  const raw = arg ? arg.split("=")[1] : process.env.COVERAGE_MAX_DROP_PCT;
  const n = Number(raw);
  return raw != null && Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_DROP_PCT;
}

/**
 * Whether HEAD's tree contains relPath. `git ls-tree` exits 0 in a healthy
 * repo whether or not the path exists (empty output = absent), so ONLY a
 * genuinely-absent baseline passes silently; any git failure (git missing,
 * not a repo, broken HEAD) throws and fails the gate loudly. Exported (with
 * an injectable cwd) for the rethrow-path unit test.
 */
export function existsInHead(relPath: string, cwd: string = ROOT): boolean {
  const out = execFileSync("git", ["ls-tree", "HEAD", "--", relPath], {
    cwd,
    encoding: "utf8",
  });
  return out.trim().length > 0;
}

function showHead(relPath: string): string {
  return execFileSync("git", ["show", `HEAD:${relPath}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
}

/** Fails on the SECOND consecutive refresh that carries the same field. */
async function checkCarriedFields() {
  let current: Record<string, number> = {};
  try {
    current = JSON.parse(await readFile(path.join(GENERATED, "carried-fields.json"), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
  }
  const prev: Record<string, number> = existsInHead(CARRIED_REL_PATH)
    ? JSON.parse(showHead(CARRIED_REL_PATH))
    : {};
  const { firstCarry, repeatCarry } = classifyCarried(prev, current);
  if (repeatCarry.length > 0) {
    console.error(
      `\ncoverage-diff FAILED: field(s) carried forward in two consecutive refreshes ` +
        `(${repeatCarry.join(", ")}). The upstream fetch has been stale since the last ` +
        "refresh - fix the fetch (see DATA-PIPELINE-AUDIT.md) instead of re-committing carried data."
    );
    process.exit(1);
  }
  if (firstCarry.length > 0) {
    console.warn(
      `\ncoverage-diff WARNING: first-time carry-forward for ${firstCarry.join(", ")} - ` +
        "the NEXT refresh FAILS if they are carried again."
    );
  }
}

async function main() {
  if (!existsInHead(REL_PATH)) {
    console.warn(`coverage-diff: ${REL_PATH} not found in git HEAD - nothing to compare against.`);
    return;
  }
  const before = (JSON.parse(showHead(REL_PATH)) as { places: unknown[] }).places;
  const after = (
    JSON.parse(await readFile(path.join(GENERATED, "places.json"), "utf8")) as {
      places: unknown[];
    }
  ).places;

  const tol = maxDropPct();
  const diff = diffCoverage(countPopulatedFields(before), countPopulatedFields(after), tol);
  console.log(formatCoverageTable(diff.rows, process.argv.includes("--all")));

  if (!diff.ok) {
    const failed = diff.rows.filter((r) => r.status === "drop" || r.status === "gone");
    console.error(
      `\ncoverage-diff FAILED: ${failed.length} field(s) dropped >${tol}% or disappeared ` +
        `(${failed.map((r) => r.field).join(", ")}). A fetch likely failed silently - ` +
        "see DATA-PIPELINE-AUDIT.md. Refusing the refresh."
    );
    process.exit(1);
  }
  console.log(`\ncoverage-diff OK (tolerance ${tol}%): no field dropped.`);

  await checkCarriedFields();
}

// Run only when invoked directly (npx tsx scripts/verify-coverage-diff.ts),
// not when tests import the exported helpers. Lower-cased for Windows paths.
const invokedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
