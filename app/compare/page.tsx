"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadPlaces } from "@/lib/places-data";
import type { Place, ScoreWeights } from "@/lib/types";
import {
  getDefaultWeights,
  normalizeWeights,
  parseWeightsFromSearchParams,
} from "@/lib/weights";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { parseListParam, buildCompareUrl } from "@/lib/share-url";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import { percentileToColor, percentileTextColor } from "@/lib/colors";
import { ShareViewButton } from "@/components/ShareViewButton";
import { ShortlistPanel } from "@/components/ShortlistPanel";

const V1 = V1_SCORED_DOMAINS;

export default function ComparePage() {
  const searchParams = useSearchParams();
  const [places, setPlaces] = useState<Place[]>([]);
  const [slugs, setSlugs] = useState<string[]>(["", "", ""]);
  const [weights, setWeights] = useState<ScoreWeights>(getDefaultWeights());
  const [savedShortlist, setSavedShortlist] = useState<string[]>([]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
    setSavedShortlist(loadUserPrefs().shortlist);
  }, []);

  useEffect(() => {
    const list = parseListParam(searchParams.get("list"));
    const parsedW = parseWeightsFromSearchParams(searchParams.toString());
    const prefs = loadUserPrefs();

    if (list.length > 0) {
      const padded = [...list, "", "", ""].slice(0, 3);
      setSlugs(padded);
    } else if (prefs.shortlist.length >= 2) {
      const fromPrefs = [...prefs.shortlist.slice(0, 3), "", "", ""].slice(0, 3);
      setSlugs(fromPrefs);
    }

    setWeights(
      parsedW
        ? normalizeWeights(parsedW)
        : prefs.weights
          ? normalizeWeights(prefs.weights)
          : getDefaultWeights()
    );
  }, [searchParams]);

  const selected = useMemo(
    () =>
      slugs
        .map((s) => places.find((p) => p.slug === s || p.sa2Code === s))
        .filter((p): p is Place => !!p)
        .slice(0, 4),
    [slugs, places]
  );

  const activeSlugs = slugs.filter(Boolean);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
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
          Up to four areas side-by-side. Uses your saved weights when shared via link.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            {slugs.map((s, i) => (
              <input
                key={i}
                value={s}
                onChange={(e) => {
                  const next = [...slugs];
                  next[i] = e.target.value;
                  setSlugs(next);
                }}
                placeholder={`Place ${i + 1} slug`}
                className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              />
            ))}
          </div>
          <ShortlistPanel
            slugs={savedShortlist}
            places={places}
            onChange={(next) => {
              saveUserPrefs({ ...loadUserPrefs(), shortlist: next });
              setSavedShortlist(next);
              if (next.length >= 2) {
                setSlugs([...next.slice(0, 3), "", "", ""].slice(0, 3));
              }
            }}
          />
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

function CompareTable({
  selected,
  weights,
}: {
  selected: Place[];
  weights: ScoreWeights;
}) {
  const totals = selected.map((p) => computeWeightedScore(p, weights).total);
  const bestTotal = bestIndex(totals);

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
      label: "Renter %",
      values: selected.map((p) =>
        p.context?.community?.renterPct != null
          ? `${p.context.community.renterPct.toFixed(1)}%`
          : "—"
      ),
    },
    {
      label: "First Nations %",
      values: selected.map((p) =>
        p.context?.community?.firstNationsPct != null
          ? `${p.context.community.firstNationsPct.toFixed(1)}%`
          : "—"
      ),
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
            const values = selected.map((p) => p.domains[d]?.percentile ?? null);
            const best = bestIndex(values);
            return (
              <tr key={d}>
                <td className="border-b border-surface-border px-3 py-2.5 text-ink-muted">
                  {getDomain(d)?.label}
                </td>
                {values.map((v, i) => (
                  <td
                    key={i}
                    className={`border-b border-surface-border px-3 py-2.5 ${
                      i === best
                        ? "bg-accent/10 font-semibold text-accent-focus"
                        : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: percentileToColor(v) }}
                      />
                      <span className="num">{v != null ? v.toFixed(0) : "—"}</span>
                      {i === best && <span className="text-accent">★</span>}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}

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
        Context rows (italic, shaded) are <b className="text-ink">not part of the
        score</b> — shown for orientation only. The best value per scored row is
        highlighted with a ★.
      </p>
    </div>
  );
}
