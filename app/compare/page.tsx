"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPlaces } from "@/lib/places-data";
import type { Place } from "@/lib/types";
import { getDefaultWeights } from "@/lib/weights";
import { computeWeightedScore } from "@/lib/scoring";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";

const V1 = V1_SCORED_DOMAINS;

export default function ComparePage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [slugs, setSlugs] = useState(["", "", ""]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
  }, []);

  const selected = slugs
    .map((s) => places.find((p) => p.slug === s || p.sa2Code === s))
    .filter((p): p is Place => !!p)
    .slice(0, 4);

  const weights = getDefaultWeights();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">Compare places</h1>
      <p className="mt-2 text-sm text-slate-400">
        Enter up to 3 place slugs (from profile URLs).
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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

      {selected.length >= 2 && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-slate-400">
                <th className="py-2 pr-4">Domain</th>
                {selected.map((p) => (
                  <th key={p.sa2Code} className="py-2 pr-4">
                    {p.name}
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
