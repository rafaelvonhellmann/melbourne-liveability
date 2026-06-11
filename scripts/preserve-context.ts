/**
 * Carry-forward guard for context fields on data/generated/places.json.
 *
 * score.ts rewrites places.json from indicators-raw.json, so any context field
 * that only an apply-* step produced (volunteerPct) or whose raw input was
 * missing in this environment (normalize treats most raw files as optional)
 * would silently vanish on rebuild - how a monthly CI refresh could delete
 * community.volunteerPct. build.ts therefore runs:
 *   snapshot (before score)  - sets the previous places.json aside (from git
 *                              HEAD when available, so an interrupted local
 *                              build cannot poison the next carry-forward)
 *   merge    (after score +  - re-fills context fields populated in the
 *             apply steps)     snapshot but missing from the rebuild
 * merge never overwrites freshly computed values (see lib/context-merge.ts).
 * To retire a field on purpose, add it to RETIRED_CONTEXT_KEYS, else the
 * carry-forward resurrects it from the previous artifact forever. The snapshot
 * lives in data/raw (gitignored) so the refresh commit never picks it up.
 *
 * merge also writes data/generated/carried-fields.json (field -> carried
 * count; {} when nothing carried). It IS committed by the refresh, so
 * verify-coverage-diff.ts can fail a SECOND consecutive refresh that still
 * carries the same field - permanent staleness is loud, not silent.
 */
import { execFileSync } from "node:child_process";
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { RAW, ROOT } from "./lib/paths.js";
import { generatedOutPath, outName, rawOutPath } from "./lib/pipeline-region.js";
import { carryForwardContext, type PlaceLike } from "./lib/context-merge.js";

// Region-suffixed for non-default regions (places.canberra.json etc.);
// melbourne keeps the historical names. A region with no committed baseline
// simply has nothing to snapshot/merge - first run passes clean.
const PLACES = generatedOutPath("places.json");
const PLACES_REL = `data/generated/${outName("places.json")}`;
const SNAPSHOT = rawOutPath("places-pre-score-snapshot.json");
const CARRIED = generatedOutPath("carried-fields.json");

/** Dot-paths ("planning" or "community.volunteerPct") excluded from carry-forward. */
const RETIRED_CONTEXT_KEYS: string[] = [];

type PlacesFile = { generatedAt: string; places: PlaceLike[] };

function isMissingFile(e: unknown): boolean {
  return (e as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function snapshot() {
  await mkdir(RAW, { recursive: true });
  // Prefer the COMMITTED artifact (same baseline the coverage gate compares
  // against) so a half-written places.json from an interrupted local build
  // cannot poison the next carry-forward. Outside a git repo, or when the
  // file is not committed, fall back to the on-disk copy.
  try {
    const baseline = execFileSync("git", ["show", `HEAD:${PLACES_REL}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
    });
    await writeFile(SNAPSHOT, baseline);
    console.log(`preserve-context: snapshotted HEAD ${PLACES_REL} -> ${SNAPSHOT}`);
    return;
  } catch {
    console.warn("preserve-context: no committed places.json - falling back to the on-disk copy.");
  }
  try {
    await copyFile(PLACES, SNAPSHOT);
    console.log(`preserve-context: snapshotted places.json -> ${SNAPSHOT}`);
  } catch (e) {
    if (!isMissingFile(e)) throw e;
    console.warn("preserve-context: no previous places.json - nothing to snapshot.");
  }
}

/** CI visibility: ::warning annotations + a GITHUB_STEP_SUMMARY table. */
async function emitCiCarryReport(entries: [string, number][]) {
  if (!process.env.GITHUB_ACTIONS) return;
  for (const [k, n] of entries) {
    console.log(
      `::warning::preserve-context carried forward ${k} (${n} places) - upstream data was missing this refresh; a second consecutive carry fails the coverage gate.`
    );
  }
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const table = [
    "## Context fields carried forward",
    "",
    "Carried = missing from this rebuild, re-filled from the previous artifact.",
    "If the same field is carried again next refresh, verify-coverage-diff fails.",
    "",
    "| field | places |",
    "| --- | ---: |",
    ...entries.map(([k, n]) => `| ${k} | ${n} |`),
    "",
  ].join("\n");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, table);
}

async function merge() {
  let prev: PlacesFile;
  try {
    prev = JSON.parse(await readFile(SNAPSHOT, "utf8")) as PlacesFile;
  } catch (e) {
    if (!isMissingFile(e)) throw e;
    console.warn("preserve-context: no snapshot - nothing to merge.");
    await writeFile(CARRIED, JSON.stringify({}));
    return;
  }
  const file = JSON.parse(await readFile(PLACES, "utf8")) as PlacesFile;
  const carried = carryForwardContext(prev.places, file.places, RETIRED_CONTEXT_KEYS);
  await writeFile(PLACES, JSON.stringify(file));

  const entries = Object.entries(carried).sort(([a], [b]) => a.localeCompare(b));
  // Always (re)written, {} when clean, and committed by the refresh - the
  // coverage gate diffs it against HEAD to catch consecutive carries.
  await writeFile(CARRIED, JSON.stringify(Object.fromEntries(entries)));
  if (entries.length === 0) {
    console.log("preserve-context: rebuild already complete - nothing carried forward.");
    return;
  }
  console.log("preserve-context: carried forward from previous places.json:");
  for (const [k, n] of entries) console.log(`  ${k}: ${n} places`);
  console.log(
    "  (carried = missing from this rebuild; if unexpected, a fetch failed - see DATA-PIPELINE-AUDIT.md)"
  );
  await emitCiCarryReport(entries);
}

function die(e: unknown) {
  console.error(e);
  process.exit(1);
}

const mode = process.argv[2];
if (mode === "snapshot") snapshot().catch(die);
else if (mode === "merge") merge().catch(die);
else {
  console.error("Usage: tsx scripts/preserve-context.ts <snapshot|merge>");
  process.exit(1);
}
