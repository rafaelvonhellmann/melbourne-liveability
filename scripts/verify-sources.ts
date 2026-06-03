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
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED, ROOT } from "./lib/paths.js";
import {
  validateSourceManifest,
  extractReferencedSourceIds,
  danglingReferences,
  type SourceRecord,
} from "./lib/source-verify.js";

const UA = "MelbourneLiveability-verify/1.0";

// Code files that cite sources via getSourcesByIds / getSourceById.
const CODE_FILES = [
  "lib/buyer-report.ts",
  "lib/methodology-reference.ts",
  "lib/sources.ts",
  "lib/source-manifest.ts",
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

async function readCodeReferences(): Promise<string[]> {
  const ids = new Set<string>();
  for (const rel of CODE_FILES) {
    try {
      const code = await readFile(path.join(ROOT, rel), "utf8");
      for (const id of extractReferencedSourceIds(code)) ids.add(id);
    } catch {
      /* a cited-source file is optional */
    }
  }
  return [...ids];
}

async function main() {
  const noNetwork = process.argv.includes("--no-network");
  const sources = JSON.parse(
    await readFile(path.join(GENERATED, "sources.json"), "utf8")
  ) as SourceRecord[];

  const manifestIssues = validateSourceManifest(sources);
  const manifestIds = new Set(sources.map((s) => s.id));
  const referenced = await readCodeReferences();
  const dangling = danglingReferences(referenced, manifestIds);

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
  ];
  const warnings = [
    ...manifestIssues.filter((i) => i.severity === "warn").map((i) => `${i.id}: ${i.message}`),
    ...liveness.filter((l) => !l.ok).map((l) => `unreachable url ${l.id}: ${l.url} (${l.status})`),
  ];

  const report = {
    checkedAt: new Date().toISOString(),
    sources: sources.length,
    referencedInCode: referenced.length,
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
