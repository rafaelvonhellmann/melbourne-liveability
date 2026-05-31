/**
 * Full data build: crosswalk → normalize → score → public/data
 */
import { execSync } from "node:child_process";

const steps = [
  "data:crosswalk",
  "data:gtfs",
  "data:hazards",
  "data:normalize",
  "data:score",
  "data:geo",
  "data:poi",
  "data:timeseries",
  "data:hash",
];

for (const step of steps) {
  console.log(`\n▶ npm run ${step}`);
  execSync(`npm run ${step}`, { stdio: "inherit", cwd: process.cwd() });
}

console.log("\n✓ data:build complete");
