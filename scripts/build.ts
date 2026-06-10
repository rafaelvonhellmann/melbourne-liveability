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

const steps = [
  "npm run data:crosswalk",
  "npm run data:gtfs",
  "npm run data:hazards",
  "npm run data:normalize",
  "npx tsx scripts/preserve-context.ts snapshot",
  "npm run data:score",
  "npx tsx scripts/apply-civic.ts",
  "npx tsx scripts/preserve-context.ts merge",
  "npm run data:geo",
  "npm run data:poi",
  "npm run data:timeseries",
  "npm run data:hash",
];

for (const step of steps) {
  console.log(`\n> ${step}`);
  execSync(step, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: step.includes("apply-civic")
      ? { ...process.env, APPLY_CIVIC_SOFT: "1" }
      : process.env,
  });
}

console.log("\ndata:build complete");
