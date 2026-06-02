"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { FeatureCollection } from "geojson";
import { usePlaces } from "@/lib/use-places";
import { findSa2ForPoint } from "@/lib/buyer-location";
import { withBase } from "@/lib/asset-path";
import type { GeocodeResult } from "@/lib/geocode";
import type { Place, ScoreWeights } from "@/lib/types";
import {
  getDefaultWeights,
  normalizeWeights,
  parseWeightsFromSearchParams,
} from "@/lib/weights";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { metricsForDomain, formatMetricValue } from "@/lib/metric-catalog";
import { parseListParam, buildCompareUrl } from "@/lib/share-url";
import { loadUserPrefs } from "@/lib/user-prefs";
import { buildSearchIndex } from "@/lib/search";
import { percentileToColor, percentileTextColor } from "@/lib/colors";
import { ShareViewButton } from "@/components/ShareViewButton";
import { SearchBox } from "@/components/SearchBox";

const V1 = V1_SCORED_DOMAINS;
const MAX_COMPARE = 4;

export default function ComparePage() {
  const searchParams = useSearchParams();
  const { places, error: placesError } = usePlaces();
  const [slugs, setSlugs] = useState<string[]>([]);
  const [weights, setWeights] = useState<ScoreWeights>(getDefaultWeights());
  const [savedShortlist, setSavedShortlist] = useState<string[]>([]);
  const [addNote, setAddNote] = useState<string | null>(null);
  const sa2GeoRef = useRef<FeatureCollection | null>(null);

  useEffect(() => {
    setSavedShortlist(loadUserPrefs().shortlist);
  }, []);

  useEffect(() => {
    const list = parseListParam(searchParams.get("list"));
    const parsedW = parseWeightsFromSearchParams(searchParams.toString());
    const prefs = loadUserPrefs();

    if (list.length > 0) {
      setSlugs(list.slice(0, MAX_COMPARE));
    } else if (prefs.shortlist.length >= 2) {
      setSlugs(prefs.shortlist.slice(0, MAX_COMPARE));
    }

    setWeights(
      parsedW
        ? normalizeWeights(parsedW)
        : prefs.weights
          ? normalizeWeights(prefs.weights)
          : getDefaultWeights()
    );
  }, [searchParams]);

  // Reuse the same suburb/area search index as the map (data-area names plus
  // suburb aliases). Selections resolve to a slug under the hood.
  const searchIndex = useMemo(() => buildSearchIndex(places), [places]);

  const selected = useMemo(
    () =>
      slugs
        .map((s) => places.find((p) => p.slug === s || p.sa2Code === s))
        .filter((p): p is Place => !!p)
        .slice(0, MAX_COMPARE),
    [slugs, places]
  );

  // Canonical slugs for sharing — guarantees only resolvable places are encoded.
  const activeSlugs = selected.map((p) => p.slug);
  const isFull = selected.length >= MAX_COMPARE;

  function addSlug(slug: string) {
    setSlugs((prev) => {
      if (prev.includes(slug) || prev.length >= MAX_COMPARE) return prev;
      return [...prev, slug];
    });
  }

  function removeSlug(slug: string) {
    setSlugs((prev) => prev.filter((s) => s !== slug));
  }

  // "Search where you want to live": geocode a full street address (OSM
  // Nominatim) and add the SA2 it falls in. The boundary geometry is lazy-loaded
  // only the first time an address is searched, so the common suburb-name path
  // pays nothing for it.
  async function addByAddress(r: GeocodeResult) {
    try {
      if (!sa2GeoRef.current) {
        const res = await fetch(withBase("/data/places.geojson"));
        sa2GeoRef.current = (await res.json()) as FeatureCollection;
      }
      const hit = findSa2ForPoint([r.lng, r.lat], sa2GeoRef.current);
      if (hit?.slug) {
        addSlug(hit.slug);
        setAddNote(`Added ${hit.name ?? "the area"} — the area that contains ${r.shortLabel}.`);
      } else {
        setAddNote(`${r.shortLabel} isn’t inside our Greater Melbourne coverage yet.`);
      }
    } catch {
      setAddNote("Couldn’t look up that address. Try a suburb or area name instead.");
    }
  }

  // Saved shortlist places not yet in the comparison — offered as one-tap chips.
  const shortlistChips = savedShortlist
    .map((slug) => places.find((p) => p.slug === slug))
    .filter((p): p is Place => !!p)
    .filter((p) => !slugs.includes(p.slug));

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
        >
          ‹ Map
        </Link>
        <span className="font-display text-base font-medium text-ink">Compare</span>
        {selected.length >= 2 && (
          <div className="ml-auto">
            <ShareViewButton
              getUrl={() => buildCompareUrl(activeSlugs, weights)}
              label="Copy compare link"
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Compare places</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Search where you want to live — by suburb, area or full street address —
          to add up to four areas side-by-side. Uses your saved weights when shared
          via link.
        </p>

        {placesError && (
          <p className="mt-3 max-w-xl rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-sm text-[#9A552F]">
            Could not load area data. Check your connection and reload the page.
          </p>
        )}

        <div className="mt-5 max-w-xl space-y-4">
          <div>
            <label
              htmlFor="compare-search"
              className="block text-sm font-medium text-ink"
            >
              Search where you want to live
            </label>
            <p id="compare-search-help" className="mt-0.5 text-xs text-ink-muted">
              Suburb, data area, or a full street address (we add the area it falls
              in). Add up to {MAX_COMPARE}.
            </p>
            {isFull ? (
              <p className="mt-2 rounded-lg border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                You have added the maximum of {MAX_COMPARE} places. Remove one to add
                another.
              </p>
            ) : (
              <div className="mt-2">
                <SearchBox
                  index={searchIndex}
                  onSelect={(entry) => {
                    setAddNote(null);
                    addSlug(entry.slug);
                  }}
                  onGeocode={addByAddress}
                />
              </div>
            )}
            {addNote && (
              <p className="mt-2 rounded-lg border border-surface-border bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                {addNote}
              </p>
            )}
            <p className="mt-2 text-xs leading-snug text-ink-muted">
              Areas are administrative boundaries (SA2s). If your target property is
              near the edge of one, the adjacent area can be just as relevant — add
              the neighbour and compare both.
            </p>
          </div>

          {shortlistChips.length > 0 && (
            <fieldset className="rounded-lg border border-surface-border bg-surface p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Quick add from your shortlist
              </legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {shortlistChips.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => addSlug(p.slug)}
                    disabled={isFull}
                    aria-label={`Add ${p.name} to comparison`}
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-3 py-1 text-sm text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden>+</span> {p.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <h2 className="text-sm font-medium text-ink">
              Comparing{" "}
              <span className="text-ink-muted">
                ({selected.length}/{MAX_COMPARE})
              </span>
            </h2>
            {selected.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">
                No places yet — search above or add one from your shortlist. Add at
                least two to see the comparison.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Selected places">
                {selected.map((p) => (
                  <li key={p.slug}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 py-1 pl-3 pr-1 text-sm text-ink">
                      {p.name}
                      <button
                        type="button"
                        onClick={() => removeSlug(p.slug)}
                        aria-label={`Remove ${p.name} from comparison`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected.length >= 2 && (
          <CompareTable selected={selected} weights={weights} />
        )}
      </main>
    </div>
  );
}

function bestIndex(values: (number | null)[]): number {
  let best = -1;
  let bestVal = -Infinity;
  values.forEach((v, i) => {
    if (v != null && v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

/** Best index honouring the indicator's direction (max for higher-is-better, else min). */
function bestIndexDir(values: (number | null)[], higherIsBetter: boolean): number {
  let best = -1;
  let bestVal = higherIsBetter ? -Infinity : Infinity;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    if (higherIsBetter ? v > bestVal : v < bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

function CompareTable({
  selected,
  weights,
}: {
  selected: Place[];
  weights: ScoreWeights;
}) {
  const totals = selected.map((p) => computeWeightedScore(p, weights).total);
  const bestTotal = bestIndex(totals);

  const pctOrDash = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—";

  const contextRows = [
    {
      label: "SEIFA IRSAD decile",
      values: selected.map((p) =>
        p.context?.equity?.irsadDecile != null
          ? String(p.context.equity.irsadDecile)
          : "—"
      ),
    },
    {
      label: "Renter households %",
      values: selected.map((p) => pctOrDash(p.context?.community?.renterPct)),
    },
    {
      label: "Owner-occupied % (approx)",
      values: selected.map((p) => {
        const r = p.context?.community?.renterPct;
        return r != null && Number.isFinite(r)
          ? `~${Math.max(0, 100 - r).toFixed(1)}%`
          : "—";
      }),
    },
    {
      label: "Apartment dwellings %",
      values: selected.map((p) => pctOrDash(p.context?.community?.apartmentPct)),
    },
    {
      label: "First Nations %",
      values: selected.map((p) => pctOrDash(p.context?.community?.firstNationsPct)),
    },
    {
      label: "Completed Year 12 %",
      values: selected.map((p) => pctOrDash(p.context?.community?.year12Pct)),
    },
  ];

  return (
    <div className="mt-8 overflow-x-auto rounded-lg border border-surface-border bg-surface shadow-card">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr>
            <th className="w-44 border-b border-surface-border px-3 py-3" />
            {selected.map((p) => (
              <th key={p.sa2Code} className="border-b border-surface-border px-3 py-3">
                <Link
                  href={`/places/${p.slug}`}
                  className="font-display text-base font-medium text-ink hover:text-accent"
                >
                  {p.name}
                </Link>
                <div className="mt-0.5 text-xs font-normal text-ink-muted">{p.lga}</div>
              </th>
            ))}
          </tr>
          <tr>
            <td className="border-b border-surface-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Overall score
            </td>
            {totals.map((t, i) => (
              <td key={i} className="border-b border-surface-border px-3 py-3">
                <span
                  className="num inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold"
                  style={{
                    background: percentileToColor(t),
                    color: percentileTextColor(t),
                  }}
                >
                  {t.toFixed(0)}
                </span>
                {i === bestTotal && <span className="ml-1 text-accent">★</span>}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {V1.map((d) => {
            const cfg = getDomain(d);
            const pctValues = selected.map((p) => p.domains[d]?.percentile ?? null);
            const bestPct = bestIndex(pctValues);
            const metrics = metricsForDomain(d);
            return (
              <Fragment key={d}>
                {/* Domain percentile (group header) */}
                <tr className="bg-surface-sunken/50">
                  <td className="border-b border-surface-border px-3 py-2.5 font-medium text-ink">
                    {cfg?.label}{" "}
                    <span className="text-[10px] font-normal uppercase tracking-wide text-ink-muted">
                      percentile
                    </span>
                  </td>
                  {pctValues.map((v, i) => (
                    <td
                      key={i}
                      className={`border-b border-surface-border px-3 py-2.5 ${
                        i === bestPct ? "font-semibold text-accent-focus" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: percentileToColor(v) }}
                        />
                        <span className="num">{v != null ? v.toFixed(0) : "—"}</span>
                        {i === bestPct && <span className="text-accent">★</span>}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Raw sub-indicators for this domain */}
                {metrics.map((def) => {
                  const raws = selected.map((p) => {
                    const iv = p.domains[d]?.subIndicators?.[def.key];
                    return iv && iv.raw != null && Number.isFinite(iv.raw) ? iv.raw : null;
                  });
                  const bestRaw = bestIndexDir(raws, def.higherIsBetter);
                  return (
                    <tr key={def.key}>
                      <td className="border-b border-surface-border py-2 pl-7 pr-3 text-xs text-ink-muted">
                        {def.label}{" "}
                        <span className="text-ink-muted/70">
                          ({def.higherIsBetter ? "↑ better" : "↓ better"})
                        </span>
                      </td>
                      {raws.map((r, i) => (
                        <td
                          key={i}
                          className={`num border-b border-surface-border px-3 py-2 text-xs ${
                            i === bestRaw ? "font-semibold text-accent-focus" : "text-ink"
                          }`}
                        >
                          {formatMetricValue(r, def.format)}
                          {i === bestRaw && <span className="ml-1 text-accent">★</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}

          {/* Context section header */}
          <tr className="bg-surface-sunken">
            <td
              colSpan={selected.length + 1}
              className="border-b border-surface-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            >
              Context — not part of the score
            </td>
          </tr>

          {contextRows.map((row) => (
            <tr key={row.label} className="bg-surface-sunken">
              <td className="border-b border-surface-border px-3 py-2.5 italic text-ink-muted">
                {row.label}
              </td>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className="num border-b border-surface-border px-3 py-2.5 italic text-ink-muted"
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-3 text-xs text-ink-muted">
        Shaded rows are each domain&apos;s Greater-Melbourne percentile; the rows beneath
        are its raw sub-indicators (↑/↓ marks which direction is better). The best value
        per row is marked ★. Context rows are <b className="text-ink">not part of the
        score</b> — orientation only.
      </p>
    </div>
  );
}
