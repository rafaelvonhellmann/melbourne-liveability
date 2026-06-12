/**
 * Full data build: crosswalk -> normalize -> score -> applies -> public/data.
 *
 * Context preservation: places.json is snapshotted before score rewrites it
 * and apply-managed context fields are re-merged after (preserve-context.ts),
 * so a clean-CI refresh cannot silently drop a populated field. apply-civic
 * (community.volunteerPct - the one apply step normalize does NOT mirror)
 * runs BEFORE the merge so carried-fields.json only records volunteerPct
 * when the fresh ABS fetch actually failed (merge never overwrites computed
 * values, so the order does not change the artifact). apply-civic runs in
 * soft mode (APPLY_CIVIC_SOFT=1): a failed ABS fetch warns instead of killing
 * the whole refresh - the carry-forward keeps the previous value and the
 * carried-fields gate fails a second consecutive miss. See
 * DATA-PIPELINE-AUDIT.md for the apply-step -> fetch -> workflow audit.
 */
import { execSync } from "node:child_process";
import { IS_DEFAULT_REGION, PIPELINE_REGION } from "./lib/pipeline-region.js";

// Region: `npm run data:build -- --region=<id>` or REGION env (default
// melbourne, byte-identical output/filenames). Non-default regions skip the
// Melbourne/VIC-wired steps until their per-state modules land:
//   data:hazards     - VIC planning overlays (hazards domain stays unscored)
//   data:timeseries  - VCSA crime + VIC-coded ABS series
// data:gtfs runs for ANY region whose registry entry has stateSources.gtfsUrls
// (all 8 capitals; key-gated feeds self-skip). data:hash runs for every region
// (melbourne keeps sources.json; others emit sources.<region>.json).
const HAS_GTFS = (PIPELINE_REGION.stateSources?.gtfsUrls?.length ?? 0) > 0;
const steps = [
  "npm run data:crosswalk",
  ...(HAS_GTFS ? ["npm run data:gtfs"] : []),
  ...(IS_DEFAULT_REGION ? ["npm run data:hazards"] : []),
  "npm run data:normalize",
  "npx tsx scripts/preserve-context.ts snapshot",
  "npm run data:score",
  "npx tsx scripts/apply-civic.ts",
  "npx tsx scripts/preserve-context.ts merge",
  "npm run data:geo",
  "npm run data:poi",
  ...(IS_DEFAULT_REGION ? ["npm run data:timeseries"] : []),
  "npm run data:hash",
];

console.log(`data:build region: ${PIPELINE_REGION.id} (${PIPELINE_REGION.label})`);

for (const step of steps) {
  console.log(`\n> ${step}`);
  // REGION is propagated explicitly so the `--region` CLI arg form reaches the
  // child npm scripts too (they re-resolve the region from env).
  execSync(step, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      REGION: PIPELINE_REGION.id,
      ...(step.includes("apply-civic") ? { APPLY_CIVIC_SOFT: "1" } : {}),
    },
  });
}

console.log("\ndata:build complete");
