"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MelbourneMap } from "@/components/MelbourneMap";
import { LayerToggle } from "@/components/LayerToggle";
import { SearchBox } from "@/components/SearchBox";
import { DomainSliders } from "@/components/DomainSliders";
import { PersonaPresets } from "@/components/PersonaPresets";
import { ResultsList } from "@/components/ResultsList";
import { BottomSheet } from "@/components/BottomSheet";
import { MapLegend } from "@/components/MapLegend";
import { Attribution } from "@/components/Attribution";
import { ScoreBreakdownPanel } from "@/components/ScoreBreakdownPanel";
import type { DomainId, Place, ScoreWeights } from "@/lib/types";
import { loadPlaces } from "@/lib/places-data";
import { buildSearchIndex } from "@/lib/search";
import {
  getDefaultWeights,
  normalizeWeights,
  parseWeightsFromSearchParams,
  serializeWeights,
} from "@/lib/weights";
import { DOMAIN_LABELS } from "@/lib/colors";
import { getPlaceBySlug } from "@/lib/places-data";
import { rankPlaces } from "@/lib/scoring";

export default function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeDomain, setActiveDomain] = useState<DomainId>("affordability");
  const [weights, setWeights] = useState<ScoreWeights>(getDefaultWeights());
  const [selected, setSelected] = useState<Place | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [confidenceMode, setConfidenceMode] = useState(false);
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({
    police: true,
    hospital: true,
    gp: true,
    school: true,
    childcare: true,
  });

  useEffect(() => {
    loadPlaces().then(setPlaces).catch(console.error);
  }, []);

  useEffect(() => {
    const parsed = parseWeightsFromSearchParams(searchParams.toString());
    if (parsed) setWeights(normalizeWeights(parsed));
  }, [searchParams]);

  const pushWeights = useCallback(
    (w: ScoreWeights) => {
      const normalized = normalizeWeights(w);
      setWeights(normalized);
      const params = new URLSearchParams(searchParams.toString());
      params.set("w", serializeWeights(normalized));
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const searchIndex = useMemo(() => buildSearchIndex(places), [places]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MelbourneMap
        className="absolute inset-0"
        activeDomain={activeDomain}
        confidenceMode={confidenceMode}
        visiblePins={visiblePins}
        onPlaceSelect={(props) => {
          const p = places.find(
            (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
          );
          if (p) setSelected(p);
        }}
      />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
        <div className="pointer-events-auto max-w-sm flex-1 space-y-2">
          <div className="rounded-lg border border-surface-border bg-surface-raised/95 px-4 py-2 backdrop-blur">
            <h1 className="text-lg font-semibold text-slate-100">
              Melbourne Liveability
            </h1>
            <p className="text-xs text-slate-400">Greater Melbourne · v1.x</p>
          </div>
          <SearchBox
            index={searchIndex}
            onSelect={(e) => {
              const p = getPlaceBySlug(places, e.slug);
              if (p) setSelected(p);
            }}
          />
        </div>
        <nav className="pointer-events-auto flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="rounded border border-surface-border bg-surface-raised/95 px-3 py-1.5 text-slate-300 backdrop-blur hover:text-white"
          >
            {showTable ? "Map view" : "Table view"}
          </button>
          <NavLink href="/compare">Compare</NavLink>
          <NavLink href="/methodology">Methodology</NavLink>
          <NavLink href="/disclaimer">Disclaimer</NavLink>
        </nav>
      </header>

      {showTable ? (
        <div className="absolute inset-0 z-10 overflow-auto bg-surface/95 p-4 pt-28">
          <PlacesTable places={places} weights={weights} />
        </div>
      ) : (
        <>
          <aside className="pointer-events-none absolute bottom-4 left-4 z-10 hidden w-72 space-y-3 md:block">
            <div className="pointer-events-auto">
              <LayerToggle
                activeDomain={activeDomain}
                onDomainChange={setActiveDomain}
                visiblePins={visiblePins}
                onPinToggle={(pin) =>
                  setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
                }
                confidenceMode={confidenceMode}
                onConfidenceToggle={() => setConfidenceMode((v) => !v)}
              />
            </div>
            <div className="pointer-events-auto space-y-3">
              <PersonaPresets onSelect={pushWeights} />
              <DomainSliders
                weights={weights}
                onChange={pushWeights}
                onReset={() => pushWeights(getDefaultWeights())}
              />
            </div>
          </aside>

          <aside className="pointer-events-none absolute bottom-4 right-4 z-10 hidden w-80 space-y-3 md:block">
            {selected && (
              <div className="pointer-events-auto">
                <ScoreBreakdownPanel place={selected} weights={weights} />
              </div>
            )}
            <div className="pointer-events-auto max-h-64 overflow-auto rounded-lg border border-surface-border bg-surface-raised/95 p-3 backdrop-blur">
              <h2 className="mb-2 text-sm font-medium text-slate-200">Top areas</h2>
              <ResultsList places={places} weights={weights} />
            </div>
            <div className="pointer-events-auto">
              <MapLegend
                domainLabel={
                  confidenceMode
                    ? "Data confidence (context, not in score)"
                    : DOMAIN_LABELS[activeDomain]
                }
              />
            </div>
            <div className="pointer-events-auto">
              <Attribution />
            </div>
          </aside>

          <BottomSheet>
            <PersonaPresets onSelect={pushWeights} />
            <DomainSliders
              weights={weights}
              onChange={pushWeights}
              onReset={() => pushWeights(getDefaultWeights())}
            />
            {selected && (
              <div className="mt-3">
                <ScoreBreakdownPanel place={selected} weights={weights} />
              </div>
            )}
            <div className="mt-3">
              <ResultsList places={places} weights={weights} limit={8} />
            </div>
          </BottomSheet>
        </>
      )}
    </main>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded border border-surface-border bg-surface-raised/95 px-3 py-1.5 text-slate-300 backdrop-blur hover:text-white"
    >
      {children}
    </Link>
  );
}

function PlacesTable({
  places,
  weights,
}: {
  places: Place[];
  weights: ScoreWeights;
}) {
  const ranked = rankPlaces(places, weights);

  return (
    <table className="w-full text-left text-sm text-slate-300">
      <thead>
        <tr className="border-b border-surface-border text-slate-400">
          <th className="py-2 pr-4">Rank</th>
          <th className="py-2 pr-4">Area</th>
          <th className="py-2 pr-4">Score</th>
          <th className="py-2 pr-4">LGA</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((p, i) => (
          <tr key={p.sa2Code} className="border-b border-surface-border/40">
            <td className="py-2 pr-4">{i + 1}</td>
            <td className="py-2 pr-4">
              <Link href={`/places/${p.slug}`} className="text-emerald-400 hover:underline">
                {p.name}
              </Link>
            </td>
            <td className="py-2 pr-4">{p.breakdown.total.toFixed(0)}</td>
            <td className="py-2 pr-4">{p.lga}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
