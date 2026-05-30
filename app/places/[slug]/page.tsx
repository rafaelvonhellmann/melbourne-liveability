import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlacesFile } from "@/lib/places-data";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { getSource, sourcesForIndicatorIds } from "@/lib/sources";
import { SourceDrawer } from "@/components/SourceDrawer";
import { StalenessBadge } from "@/components/StalenessBadge";
import { ContextPanels } from "@/components/ContextPanels";
import type { DomainId } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

async function loadPlacesFile(): Promise<PlacesFile> {
  const file = path.join(process.cwd(), "public", "data", "places.json");
  return JSON.parse(await readFile(file, "utf8")) as PlacesFile;
}

export async function generateStaticParams() {
  try {
    const data = await loadPlacesFile();
    return data.places
      .filter((p) => !p.nonResidential)
      .map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);
  if (!place) return { title: "Place not found" };
  const score = computeWeightedScore(place, getDefaultWeights()).total;
  return {
    title: `${place.name} liveability score · Melbourne`,
    description: `${place.name} (${place.lga}) liveability score ${score.toFixed(0)} — seven-domain breakdown with methodology-linked sources.`,
    openGraph: {
      title: `${place.name} · ${score.toFixed(0)} liveability`,
      description: `Greater Melbourne SA2 ${place.sa2Code} — compare domains and sources.`,
      type: "website",
    },
  };
}

export default async function PlaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);

  if (!place) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p>Place not found.</p>
        <Link href="/" className="text-emerald-400">
          ← Map
        </Link>
      </div>
    );
  }

  const weights = getDefaultWeights();
  const breakdown = computeWeightedScore(place, weights);
  const domains: DomainId[] = [...V1_SCORED_DOMAINS];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-slate-300">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">{place.name}</h1>
      <p className="text-slate-500">{place.lga} · SA2 {place.sa2Code}</p>
      <p className="mt-4 text-4xl font-bold text-emerald-300">
        {breakdown.total.toFixed(0)}
        <span className="ml-2 text-base font-normal text-slate-500">
          default-weight liveability
        </span>
      </p>

      {place.suburbAliases.length > 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Also known as: {place.suburbAliases.slice(0, 8).join(", ")}
        </p>
      )}

      <section className="mt-8 space-y-6">
        {domains.map((d) => {
          const ds = place.domains[d];
          const cfg = getDomain(d);
          if (!ds) return null;
          return (
            <div
              key={d}
              className="rounded-lg border border-surface-border bg-surface-raised/50 p-4"
            >
              <h2 className="text-lg font-medium text-slate-100">
                {cfg?.label ?? d}{" "}
                <span className="text-emerald-300">
                  {ds.percentile != null ? ds.percentile.toFixed(0) : "—"}
                </span>
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(ds.subIndicators).map(([key, ind]) => (
                  <li key={key} className="flex justify-between gap-4">
                    <span className="text-slate-400">{key}</span>
                    <span>
                      {ind.raw != null ? ind.raw.toFixed(2) : "—"}
                      {ind.percentile != null && (
                        <span className="ml-2 text-slate-500">
                          ({ind.percentile.toFixed(0)} pct)
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {(() => {
                const first = Object.values(ds.subIndicators)[0];
                const src = getSource(first?.sourceId);
                return (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      Source: {src?.name ?? first?.sourceId ?? "—"}
                      {src?.period ? ` · ${src.period}` : ""} · method:{" "}
                      {first?.method ?? "—"}
                    </span>
                    {first?.stale && (
                      <StalenessBadge period={src?.period} stale />
                    )}
                  </p>
                );
              })()}
            </div>
          );
        })}
      </section>

      {place.domains.safety && (
        <p className="mt-6 text-sm text-amber-200/90">
          Crime rates are suburb/town level (VCSA Table 03), aggregated to SA2 via
          crosswalk — not resident point-level. See methodology for details.
        </p>
      )}

      <ContextPanels context={place.context} />

      <SourceDrawer
        sources={sourcesForIndicatorIds(
          domains.flatMap((d) =>
            Object.values(place.domains[d]?.subIndicators ?? {}).map(
              (s) => s.sourceId
            )
          )
        )}
      />

      <p className="mt-8 text-xs text-slate-500">
        Not relocation or financial advice. Scores are percentile ranks within
        Greater Melbourne only.
      </p>
    </div>
  );
}
