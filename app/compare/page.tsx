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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Map
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Compare places</h1>
        {selected.length >= 2 && (
          <ShareViewButton
            getUrl={() => buildCompareUrl(activeSlugs, weights)}
            label="Copy compare link"
          />
        )}
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Up to four areas side-by-side. Uses your saved weights when shared via link.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
              className="flex-1 rounded border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-100"
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
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-slate-400">
                <th className="py-2 pr-4">Domain</th>
                {selected.map((p) => (
                  <th key={p.sa2Code} className="py-2 pr-4">
                    <Link href={`/places/${p.slug}`} className="hover:text-emerald-300">
                      {p.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-surface-border/50">
                <td className="py-2 font-medium text-slate-200">Total</td>
                {selected.map((p) => (
                  <td key={p.sa2Code} className="py-2 text-emerald-300">
                    {computeWeightedScore(p, weights).total.toFixed(0)}
                  </td>
                ))}
              </tr>
              {V1.map((d) => (
                <tr key={d} className="border-b border-surface-border/50">
                  <td className="py-2 text-slate-400">{getDomain(d)?.label}</td>
                  {selected.map((p) => (
                    <td key={p.sa2Code} className="py-2">
                      {p.domains[d]?.percentile?.toFixed(0) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
