/**
 * Data + reference double-check (mechanism: DATA-VERIFICATION.md).
 *
 * 1. Validates the source manifest (required fields, no duplicate ids, http urls,
 *    sha256 present for non-derived sources).
 * 2. Proves every source CITED in code (getSourcesByIds / getSourceById) exists
 *    in the manifest - no dangling citation that would render a blank/fake source.
 * 3. Checks each upstream URL is reachable (HEAD, GET fallback).
 *
 * Writes data/generated/source-verification.json + a console summary. DETERMINISTIC
 * problems (missing fields, duplicate ids, dangling citations) exit 1 so they
 * block CI; network dead-urls are reported as WARNINGS (transient outages
 * shouldn't fail an unrelated build). `--no-network` skips the liveness probes.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED, ROOT } from "./lib/paths.js";
import { collectSourceIds } from "./lib/region-sources.js";
import { REGISTRY_BY_ID, SOURCE_REGISTRY } from "./lib/source-registry.js";
import { SOURCE_FILES } from "./lib/source-files.js";
import {
  BAKEABLE_VERDICTS,
  validateSourceManifest,
  extractAdapterSourceIds,
  extractReferencedSourceIds,
  danglingReferences,
  type SourceRecord,
} from "./lib/source-verify.js";

const UA = "MelbourneLiveability-verify/1.0";

const ADAPTER_SOURCE_FILES = [
  "scripts/lib/crime-adapters.ts",
  "scripts/lib/hazard-adapters.ts",
  "scripts/lib/nsw-hazards.ts",
  "scripts/lib/wa-hazards.ts",
  "scripts/lib/sa-hazards.ts",
  "scripts/lib/gtfs-constants.ts",
];

async function checkUrl(url: string): Promise<{ ok: boolean; status: number | string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    // Some servers reject HEAD - retry with GET before calling it dead.
    if (res.status === 403 || res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA },
      });
    }
    return { ok: res.status < 400, status: res.status };
  } catch (e) {
    return { ok: false, status: (e as Error)?.name === "AbortError" ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

async function listCodeFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listCodeFiles(full)));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function readCodeReferences(): Promise<{
  ids: string[];
  files: string[];
}> {
  const ids = new Set<string>();
  const files = await listCodeFiles(path.join(ROOT, "lib"));
  for (const file of files) {
    try {
      const code = await readFile(file, "utf8");
      for (const id of extractReferencedSourceIds(code)) ids.add(id);
    } catch {
      /* a cited-source file is optional */
    }
  }
  return { ids: [...ids].sort(), files: files.map((file) => path.relative(ROOT, file)).sort() };
}

async function readAdapterSourceIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const rel of ADAPTER_SOURCE_FILES) {
    try {
      const code = await readFile(path.join(ROOT, rel), "utf8");
      for (const id of extractAdapterSourceIds(code)) ids.add(id);
    } catch {
      /* a source-id adapter file is optional */
    }
  }
  return [...ids].sort();
}

async function readPlacesSourceIds(): Promise<string[]> {
  const places = JSON.parse(
    await readFile(path.join(GENERATED, "places.json"), "utf8")
  ) as unknown;
  return [...collectSourceIds(places)].sort();
}

function registryMembershipErrors(
  referenced: string[],
  manifestIds: Set<string>
): string[] {
  const registryIds = new Set<string>(SOURCE_REGISTRY.map((source) => source.id));
  const errors: string[] = [];
  for (const id of referenced) {
    if (!registryIds.has(id)) {
      errors.push(`source registry: referenced id "${id}" is not registered`);
      continue;
    }
    const verdict = REGISTRY_BY_ID.get(id)?.licenceVerdict;
    if (verdict && !BAKEABLE_VERDICTS.has(verdict) && !manifestIds.has(id) && SOURCE_FILES[id]) {
      errors.push(
        `source registry: non-bakeable dropped id "${id}" must not have a SOURCE_FILES mapping`
      );
    }
  }
  return errors;
}

async function main() {
  const noNetwork = process.argv.includes("--no-network");
  const sources = JSON.parse(
    await readFile(path.join(GENERATED, "sources.json"), "utf8")
  ) as SourceRecord[];

  const manifestIssues = validateSourceManifest(sources);
  const manifestIds = new Set(sources.map((s) => s.id));
  const codeReferences = await readCodeReferences();
  const adapterReferences = await readAdapterSourceIds();
  const placesReferences = await readPlacesSourceIds();
  const referenced = [
    ...new Set([
      ...codeReferences.ids,
      ...adapterReferences,
      ...placesReferences,
    ]),
  ].sort();
  const dangling = danglingReferences(codeReferences.ids, manifestIds);
  const membershipErrors = registryMembershipErrors(referenced, manifestIds);

  const liveness: { id: string; url: string; ok: boolean; status: number | string }[] = [];
  if (!noNetwork) {
    for (const s of sources) {
      if (s.derived || !s.url) continue;
      liveness.push({ id: s.id, url: s.url, ...(await checkUrl(s.url)) });
    }
  }

  // Deterministic problems block CI; network issues only warn (could be transient).
  const errors = [
    ...manifestIssues
      .filter((i) => i.severity === "error")
      .map((i) => `manifest "${i.id}": ${i.message}`),
    ...dangling.map(
      (id) => `dangling citation: "${id}" is referenced in code but missing from the manifest`
    ),
    ...membershipErrors,
  ];
  const warnings = [
    ...manifestIssues.filter((i) => i.severity === "warn").map((i) => `${i.id}: ${i.message}`),
    ...liveness.filter((l) => !l.ok).map((l) => `unreachable url ${l.id}: ${l.url} (${l.status})`),
  ];

  const report = {
    checkedAt: new Date().toISOString(),
    sources: sources.length,
    referencedInCode: codeReferences.ids.length,
    referencedFilesScanned: codeReferences.files.length,
    referencedIds: referenced,
    referencedInAdapters: adapterReferences,
    referencedInPlaces: placesReferences,
    networkChecked: !noNetwork,
    errors,
    warnings,
    liveness,
  };
  await writeFile(
    path.join(GENERATED, "source-verification.json"),
    JSON.stringify(report, null, 2) + "\n"
  );

  console.log(
    `Source verification: ${sources.length} sources, ${referenced.length} cited in code` +
      (noNetwork ? " (no-network)" : "") + "."
  );
  if (warnings.length) {
    console.warn(`Warnings (${warnings.length}):\n  ${warnings.join("\n  ")}`);
  }
  if (errors.length) {
    console.error(`Errors (${errors.length}):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Manifest valid + every cited source exists" + (noNetwork ? "." : " + reachable."));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
