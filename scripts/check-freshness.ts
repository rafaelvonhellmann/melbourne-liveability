/**
 * Decides automatically which sources are due for refresh.
 *
 * For each source: compares committed `fetchedAt` against its cadence, and —
 * where cheap - probes the upstream "last updated" date. Writes a machine-
 * readable report to data/generated/freshness.json and prints a summary.
 *
 * Exit code 0 always (report-only) unless --strict is passed, in which case it
 * exits 1 when anything is due / has an upstream update (handy for CI gating).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED } from "./lib/paths.js";
import {
  CADENCE_MONTHS,
  SOURCE_REFRESH,
  probeLastUpdated,
} from "./lib/source-refresh.js";

type Source = { id: string; period?: string; fetchedAt?: string };
type Status = "fresh" | "due" | "update-available" | "unknown";

type Report = {
  id: string;
  cadence: string;
  fetchedAt: string | null;
  monthsSinceFetch: number | null;
  upstreamLastUpdated: string | null;
  status: Status;
};

function monthsBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

async function main() {
  const strict = process.argv.includes("--strict");
  const sourcesPath = path.join(GENERATED, "sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8")) as Source[];
  const now = new Date();

  const items: Report[] = [];

  for (const s of sources) {
    const cfg = SOURCE_REFRESH[s.id];
    if (!cfg) {
      items.push({
        id: s.id,
        cadence: "n/a",
        fetchedAt: s.fetchedAt ?? null,
        monthsSinceFetch: null,
        upstreamLastUpdated: null,
        status: "unknown",
      });
      continue;
    }

    const monthsSince = s.fetchedAt ? monthsBetween(s.fetchedAt, now) : null;
    const dueByCadence =
      monthsSince != null && monthsSince >= CADENCE_MONTHS[cfg.cadence];

    const upstream = await probeLastUpdated(cfg.probe);
    const upstreamNewer =
      upstream != null && s.fetchedAt != null && upstream > s.fetchedAt;

    const status: Status = upstreamNewer
      ? "update-available"
      : dueByCadence
        ? "due"
        : "fresh";

    items.push({
      id: s.id,
      cadence: cfg.cadence,
      fetchedAt: s.fetchedAt ?? null,
      monthsSinceFetch:
        monthsSince != null ? Math.round(monthsSince * 10) / 10 : null,
      upstreamLastUpdated: upstream,
      status,
    });
  }

  await writeFile(
    path.join(GENERATED, "freshness.json"),
    JSON.stringify({ checkedAt: now.toISOString(), items }, null, 2) + "\n"
  );

  const flag = (s: Status) =>
    s === "fresh" ? "ok  " : s === "unknown" ? "??  " : "DUE ";
  console.log("Source freshness:");
  for (const it of items) {
    console.log(
      `  ${flag(it.status)} ${it.id.padEnd(30)} ${it.status.padEnd(17)} ` +
        `cadence=${it.cadence} fetched=${it.fetchedAt ?? "-"} ` +
        `upstream=${it.upstreamLastUpdated ?? "-"}`
    );
  }

  const due = items.filter(
    (i) => i.status === "due" || i.status === "update-available"
  );
  console.log(`\n${due.length} source(s) due for refresh.`);

  if (strict && due.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
