/**
 * Scores indicators → places.json (percentiles + domain scores)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { GENERATED } from "./lib/paths.js";
import { percentileRank } from "../lib/scoring.js";
import { V1_SCORED_DOMAINS } from "../lib/domains.js";
import type {
  DataConfidence,
  DomainId,
  DomainScore,
  IndicatorValue,
  Place,
  PlaceContext,
} from "../lib/types.js";

const NON_RESIDENTIAL_POP_THRESHOLD = 200;

type RawPlace = {
  sa2Code: string;
  sa2Name: string;
  lga: string;
  centroid: [number, number];
  suburbAliases: string[];
  population: number | null;
  medianDhiWeekly: number | null;
  medianRentWeekly: number | null;
  propertyCrimeRate: number | null;
  violentCrimeRate: number | null;
  crimeMethod: "direct" | "population-weighted" | "area-weighted" | null;
  stops800m: number | null;
  ptModes: string | null;
  amPeakFreq: number | null;
  transportSource: "ptv-gtfs" | "osm-pt" | null;
  hospitalDistKm: number | null;
  hospitalSource: "vic-mapshare-hospitals" | "osm-health" | null;
  gpCount2km: number | null;
  employmentRatio: number | null;
  participationRate: number | null;
  bushfirePct: number | null;
  floodPct: number | null;
  schools2km: number | null;
  preschoolEnrolled: number | null;
  context?: PlaceContext;
};

function slugify(name: string, code: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${code}`;
}

/** Reference year = an indicator is "stale" if its source period is older than this. */
const STALE_THRESHOLD_YEARS = 5;

/** Populated in main() from sources.json: sourceId → period string. */
const PERIOD_BY_ID = new Map<string, string>();

function isStale(sourceId: string): boolean {
  const period = PERIOD_BY_ID.get(sourceId);
  if (!period) return false;
  const m = period.match(/\b(19|20)\d{2}\b/);
  if (!m) return false; // "current" / "rolling" → treat as fresh
  const year = Number(m[0]);
  const nowYear = new Date().getUTCFullYear();
  return nowYear - year > STALE_THRESHOLD_YEARS;
}

function indicator(
  raw: number | null,
  percentile: number | null,
  sourceId: string,
  method: IndicatorValue["method"],
  missing: boolean
): IndicatorValue {
  return {
    raw,
    percentile,
    method,
    sourceId,
    missing,
    stale: isStale(sourceId),
  };
}

function domainScore(
  domain: DomainId,
  percentile: number | null,
  subIndicators: Record<string, IndicatorValue>
): DomainScore {
  return { domain, scored: true, percentile, subIndicators };
}

/** Confidence weight per aggregation method (how directly we measured it). */
const METHOD_CONFIDENCE: Record<string, number> = {
  direct: 1,
  precomputed: 1,
  "population-weighted": 0.85,
  "area-weighted": 0.7,
  proximity: 0.6,
};

/**
 * Meta-measure of data confidence for an SA2 — about the pipeline, not the place.
 * Display-only; never enters the liveability score.
 */
function computeDataConfidence(
  domains: Place["domains"],
  coverage: number
): DataConfidence {
  let total = 0;
  let nonMissing = 0;
  let fresh = 0;
  let methodSum = 0;
  const counts = {
    total: 0,
    direct: 0,
    estimated: 0,
    proximity: 0,
    missing: 0,
    stale: 0,
  };

  for (const d of V1_SCORED_DOMAINS) {
    const subs = domains[d]?.subIndicators;
    if (!subs) continue;
    for (const ind of Object.values(subs)) {
      total++;
      const conf = METHOD_CONFIDENCE[ind.method ?? ""] ?? 0.5;
      methodSum += conf;
      if (!ind.missing) nonMissing++;
      else counts.missing++;
      if (!ind.stale) fresh++;
      else counts.stale++;
      if (ind.method === "direct" || ind.method === "precomputed" || ind.method === "population-weighted") {
        counts.direct++;
      } else if (ind.method === "area-weighted") {
        counts.estimated++;
      } else if (ind.method === "proximity") {
        counts.proximity++;
      }
    }
  }
  counts.total = total;

  const completeness = total > 0 ? nonMissing / total : 0;
  const freshness = total > 0 ? fresh / total : 0;
  const methodConfidence = total > 0 ? methodSum / total : 0;
  const score =
    100 *
    (0.4 * coverage +
      0.25 * completeness +
      0.15 * freshness +
      0.2 * methodConfidence);

  return {
    score: Math.round(score * 10) / 10,
    coverage: Math.round(coverage * 1000) / 1000,
    completeness: Math.round(completeness * 1000) / 1000,
    freshness: Math.round(freshness * 1000) / 1000,
    methodConfidence: Math.round(methodConfidence * 1000) / 1000,
    counts,
  };
}

async function main() {
  try {
    const sources = JSON.parse(
      await readFile(path.join(GENERATED, "sources.json"), "utf8")
    ) as { id: string; period?: string }[];
    for (const s of sources) {
      if (s.period) PERIOD_BY_ID.set(s.id, s.period);
    }
  } catch {
    console.warn("sources.json missing — staleness flags will all be false");
  }

  const { places: raw } = JSON.parse(
    await readFile(path.join(GENERATED, "indicators-raw.json"), "utf8")
  ) as { places: RawPlace[] };

  const residential = raw.filter(
    (p) => (p.population ?? 0) >= NON_RESIDENTIAL_POP_THRESHOLD
  );
  const residentialIds = new Set(residential.map((p) => p.sa2Code));

  const rentToIncome = raw
    .filter((p) => residentialIds.has(p.sa2Code))
    .map((p) => ({
      id: p.sa2Code,
      value:
        p.medianRentWeekly && p.medianDhiWeekly
          ? p.medianRentWeekly / p.medianDhiWeekly
          : NaN,
    }))
    .filter((x) => Number.isFinite(x.value));

  const pctRentToIncome = percentileRank(rentToIncome, true);

  const pctProperty = percentileRank(
    residential
      .filter((p) => p.propertyCrimeRate != null)
      .map((p) => ({ id: p.sa2Code, value: p.propertyCrimeRate! })),
    true
  );
  const pctViolent = percentileRank(
    residential
      .filter((p) => p.violentCrimeRate != null)
      .map((p) => ({ id: p.sa2Code, value: p.violentCrimeRate! })),
    true
  );

  const pctStops = percentileRank(
    residential
      .filter((p) => p.stops800m != null)
      .map((p) => ({ id: p.sa2Code, value: p.stops800m! })),
    false
  );
  const pctAmPeak = percentileRank(
    residential
      .filter((p) => p.amPeakFreq != null && p.amPeakFreq > 0)
      .map((p) => ({ id: p.sa2Code, value: p.amPeakFreq! })),
    false
  );
  const pctModes = percentileRank(
    residential
      .filter((p) => p.ptModes != null && p.ptModes !== "osm-fallback")
      .map((p) => ({
        id: p.sa2Code,
        value: p.ptModes!.split(",").filter(Boolean).length,
      })),
    false
  );

  const pctHospital = percentileRank(
    residential
      .filter((p) => p.hospitalDistKm != null)
      .map((p) => ({ id: p.sa2Code, value: p.hospitalDistKm! })),
    true
  );
  const pctGp = percentileRank(
    residential
      .filter((p) => p.gpCount2km != null)
      .map((p) => ({ id: p.sa2Code, value: p.gpCount2km! })),
    false
  );

  const pctDhi = percentileRank(
    residential
      .filter((p) => p.medianDhiWeekly != null)
      .map((p) => ({ id: p.sa2Code, value: p.medianDhiWeekly! })),
    false
  );
  const pctEmp = percentileRank(
    residential
      .filter((p) => p.employmentRatio != null)
      .map((p) => ({ id: p.sa2Code, value: p.employmentRatio! })),
    false
  );
  const pctParticipation = percentileRank(
    residential
      .filter((p) => p.participationRate != null)
      .map((p) => ({ id: p.sa2Code, value: p.participationRate! })),
    false
  );

  const pctBushfire = percentileRank(
    residential
      .filter((p) => p.bushfirePct != null)
      .map((p) => ({ id: p.sa2Code, value: p.bushfirePct! })),
    true
  );
  const pctFlood = percentileRank(
    residential
      .filter((p) => p.floodPct != null)
      .map((p) => ({ id: p.sa2Code, value: p.floodPct! })),
    true
  );

  const pctSchools = percentileRank(
    residential
      .filter((p) => p.schools2km != null)
      .map((p) => ({ id: p.sa2Code, value: p.schools2km! })),
    false
  );
  const pctPreschool = percentileRank(
    residential
      .filter((p) => p.preschoolEnrolled != null && p.preschoolEnrolled > 0)
      .map((p) => ({ id: p.sa2Code, value: p.preschoolEnrolled! })),
    false
  );

  const domainCount = V1_SCORED_DOMAINS.length;

  const places: Place[] = raw.map((p) => {
    const nonResidential = !residentialIds.has(p.sa2Code);
    const affPct = pctRentToIncome.get(p.sa2Code) ?? null;

    const propPct = pctProperty.get(p.sa2Code) ?? null;
    const violPct = pctViolent.get(p.sa2Code) ?? null;
    const safetyPct =
      propPct != null && violPct != null
        ? propPct * 0.55 + violPct * 0.45
        : propPct ?? violPct;

    const transParts = [
      pctStops.get(p.sa2Code),
      pctAmPeak.get(p.sa2Code),
      pctModes.get(p.sa2Code),
    ].filter((x): x is number => x != null);
    const transPct =
      transParts.length > 0
        ? transParts.reduce((a, b) => a + b, 0) / transParts.length
        : null;
    const transSource = p.transportSource ?? "osm-pt";

    const hPct = pctHospital.get(p.sa2Code) ?? null;
    const gPct = pctGp.get(p.sa2Code) ?? null;
    const healthParts = [hPct, gPct].filter((x): x is number => x != null);
    const healthPct =
      healthParts.length > 0
        ? healthParts.reduce((a, b) => a + b, 0) / healthParts.length
        : null;

    const domains: Place["domains"] = {};

    if (!nonResidential) {
      domains.affordability = domainScore("affordability", affPct, {
        rentToIncome: indicator(
          p.medianRentWeekly && p.medianDhiWeekly
            ? p.medianRentWeekly / p.medianDhiWeekly
            : null,
          affPct,
          "abs-rent-to-income-2021",
          "direct",
          affPct == null
        ),
      });
      domains.transport = domainScore("transport", transPct, {
        stops800m: indicator(
          p.stops800m,
          pctStops.get(p.sa2Code) ?? null,
          transSource,
          "proximity",
          p.stops800m == null
        ),
        ...(p.amPeakFreq != null
          ? {
              amPeakFreq: indicator(
                p.amPeakFreq,
                pctAmPeak.get(p.sa2Code) ?? null,
                transSource,
                "precomputed",
                false
              ),
            }
          : {}),
        ...(p.ptModes && p.ptModes !== "osm-fallback"
          ? {
              ptModes: indicator(
                p.ptModes.split(",").filter(Boolean).length,
                pctModes.get(p.sa2Code) ?? null,
                transSource,
                "precomputed",
                false
              ),
            }
          : {}),
      });
      domains.safety = domainScore("safety", safetyPct, {
        propertyCrime: indicator(
          p.propertyCrimeRate,
          propPct,
          "vcsa-recorded-offences",
          p.crimeMethod ?? "direct",
          propPct == null
        ),
        violentCrime: indicator(
          p.violentCrimeRate,
          violPct,
          "vcsa-recorded-offences",
          p.crimeMethod ?? "direct",
          violPct == null
        ),
      });
      domains.health = domainScore("health", healthPct, {
        hospitalDistKm: indicator(
          p.hospitalDistKm,
          hPct,
          p.hospitalSource ?? "osm-health",
          "proximity",
          hPct == null
        ),
        gpCount2km: indicator(
          p.gpCount2km,
          gPct,
          "osm-health",
          "proximity",
          gPct == null
        ),
      });

      const incParts = [
        pctDhi.get(p.sa2Code),
        pctEmp.get(p.sa2Code),
        pctParticipation.get(p.sa2Code),
      ].filter((x): x is number => x != null);
      const incPct =
        incParts.length > 0
          ? incParts.reduce((a, b) => a + b, 0) / incParts.length
          : null;
      domains.income = domainScore("income", incPct, {
        medianDhi: indicator(
          p.medianDhiWeekly,
          pctDhi.get(p.sa2Code) ?? null,
          "abs-sa2-income-dbr",
          "direct",
          pctDhi.get(p.sa2Code) == null
        ),
        employmentRatio: indicator(
          p.employmentRatio,
          pctEmp.get(p.sa2Code) ?? null,
          "abs-census-labour-2016",
          "direct",
          pctEmp.get(p.sa2Code) == null
        ),
        participationRate: indicator(
          p.participationRate,
          pctParticipation.get(p.sa2Code) ?? null,
          "abs-census-labour-2016",
          "direct",
          pctParticipation.get(p.sa2Code) == null
        ),
      });

      const hazParts = [
        pctBushfire.get(p.sa2Code),
        pctFlood.get(p.sa2Code),
      ].filter((x): x is number => x != null);
      const hazPct =
        hazParts.length > 0
          ? hazParts.reduce((a, b) => a + b, 0) / hazParts.length
          : null;
      domains.hazards = domainScore("hazards", hazPct, {
        bushfirePct: indicator(
          p.bushfirePct,
          pctBushfire.get(p.sa2Code) ?? null,
          "vic-planning-bpa",
          "area-weighted",
          pctBushfire.get(p.sa2Code) == null
        ),
        floodPct: indicator(
          p.floodPct,
          pctFlood.get(p.sa2Code) ?? null,
          "vic-planning-flood",
          "area-weighted",
          pctFlood.get(p.sa2Code) == null
        ),
      });

      const eduParts = [
        pctSchools.get(p.sa2Code),
        pctPreschool.get(p.sa2Code),
      ].filter((x): x is number => x != null);
      const eduPct =
        eduParts.length > 0
          ? eduParts.reduce((a, b) => a + b, 0) / eduParts.length
          : null;
      domains.education = domainScore("education", eduPct, {
        schools2km: indicator(
          p.schools2km,
          pctSchools.get(p.sa2Code) ?? null,
          "osm-schools",
          "proximity",
          pctSchools.get(p.sa2Code) == null
        ),
        preschoolEnrolled: indicator(
          p.preschoolEnrolled,
          pctPreschool.get(p.sa2Code) ?? null,
          "abs-census-preschool-2021",
          "direct",
          pctPreschool.get(p.sa2Code) == null
        ),
      });
    }

    const present = V1_SCORED_DOMAINS.filter(
      (d) => domains[d]?.percentile != null
    ).length;
    const coverage = present / domainCount;

    return {
      sa2Code: p.sa2Code,
      slug: slugify(p.sa2Name, p.sa2Code),
      name: p.sa2Name,
      lga: p.lga,
      suburbAliases: p.suburbAliases,
      centroid: p.centroid,
      nonResidential,
      coverage,
      domains,
      context: p.context,
      dataConfidence: nonResidential
        ? undefined
        : computeDataConfidence(domains, coverage),
    };
  });

  await mkdir(GENERATED, { recursive: true });
  await writeFile(
    path.join(GENERATED, "places.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), places })
  );
  console.log(`Wrote places.json (${places.length} places)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
