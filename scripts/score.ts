/**
 * Scores indicators → places.json (percentiles + domain scores)
 *
 * The assembly itself lives in scripts/lib/score-places.ts (pure, unit-tested,
 * region-gated): regions without a crime adapter get an unscored safety
 * domain, non-VIC regions get an unscored hazards domain, and no VIC sourceId
 * can appear outside a VIC bake.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { GENERATED } from "./lib/paths.js";
import { generatedOutPath, PIPELINE_REGION } from "./lib/pipeline-region.js";
import { scorePlaces, type RawPlace } from "./lib/score-places.js";

async function main() {
  /** sources.json: sourceId → period string, for staleness flags. */
  const periodById = new Map<string, string>();
  try {
    const sources = JSON.parse(
      await readFile(path.join(GENERATED, "sources.json"), "utf8")
    ) as { id: string; period?: string }[];
    for (const s of sources) {
      if (s.period) periodById.set(s.id, s.period);
    }
  } catch {
    console.warn("sources.json missing - staleness flags will all be false");
  }

  const { places: raw } = JSON.parse(
    await readFile(generatedOutPath("indicators-raw.json"), "utf8")
  ) as { places: RawPlace[] };

  const places = scorePlaces(raw, PIPELINE_REGION, periodById);

  await mkdir(GENERATED, { recursive: true });
  const outFile = generatedOutPath("places.json");
  await writeFile(
    outFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), places })
  );
  console.log(`Wrote ${path.basename(outFile)} (${places.length} places)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
