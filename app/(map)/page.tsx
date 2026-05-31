"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MelbourneMap } from "@/components/MelbourneMap";
import { LayerToggle } from "@/components/LayerToggle";
import { SearchBox } from "@/components/SearchBox";
import { DomainSliders } from "@/components/DomainSliders";
import { PersonaPresets } from "@/components/PersonaPresets";
import { InterestViews } from "@/components/InterestViews";
import { ShortlistPanel } from "@/components/ShortlistPanel";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { ShareViewButton } from "@/components/ShareViewButton";
import { ResultsList } from "@/components/ResultsList";
import { BottomSheet } from "@/components/BottomSheet";
import { MapLegend } from "@/components/MapLegend";
import { Attribution } from "@/components/Attribution";
import { ScoreBreakdownPanel } from "@/components/ScoreBreakdownPanel";
import { AddToShortlistButton } from "@/components/AddToShortlistButton";
import type { Place } from "@/lib/types";
import { loadPlaces, getPlaceBySlug } from "@/lib/places-data";
import { buildSearchIndex } from "@/lib/search";
import { DOMAIN_LABELS, percentileToColor, percentileTextColor } from "@/lib/colors";
import { rankPlaces } from "@/lib/scoring";
import { useMapPersonalisation } from "@/lib/use-map-personalisation";

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({
    police: true,
    hospital: true,
    gp: true,
    school: true,
    childcare: true,
  });

  const {
    weights,
    shortlist,
    interestView,
    activeDomain,
    setActiveDomain,
    confidenceMode,
    toggleConfidenceMode,
    walkAccessMode,
    toggleWalkAccessMode,
    cyclabilityMode,
    toggleCyclabilityMode,
    recent,
    setWeightsAndSync,
    selectPersona,
    selectInterestView,
    updateShortlist,
    getShareUrl,
    noteRecentView,
    resetWeights,
  } = useMapPersonalisation();

  useEffect(() => {
    loadPlaces().then(setPlaces).catch(console.error);
  }, []);

  const searchIndex = useMemo(() => buildSearchIndex(places), [places]);

  const selectPlace = (p: Place) => {
    setSelected(p);
    noteRecentView(p.slug, p.name);
  };

  const personalisationControls = (
    <>
      <InterestViews active={interestView} onSelect={selectInterestView} />
      <PersonaPresets onSelect={selectPersona} />
      <DomainSliders
        weights={weights}
        onChange={setWeightsAndSync}
        onReset={resetWeights}
      />
    </>
  );

  const legendLabel = walkAccessMode
    ? "15-min walk access (context, not in score)"
    : cyclabilityMode
      ? "Cyclability (context, not in score)"
      : confidenceMode
        ? "Data confidence (context, not in score)"
        : DOMAIN_LABELS[activeDomain];

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-ink">
      <TopBar
        searchIndex={searchIndex}
        onSearchSelect={(slug) => {
          const p = getPlaceBySlug(places, slug);
          if (p) selectPlace(p);
        }}
        showTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <MelbourneMap
            className="absolute inset-0"
            activeDomain={activeDomain}
            confidenceMode={confidenceMode}
            walkAccessMode={walkAccessMode}
            cyclabilityMode={cyclabilityMode}
            visiblePins={visiblePins}
            onPlaceSelect={(props) => {
              const p = places.find(
                (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
              );
              if (p) selectPlace(p);
            }}
          />

          {/* Floating layer-control card (top-right) */}
          <div className="absolute right-4 top-4 z-10 hidden max-h-[calc(100%-2rem)] w-56 overflow-y-auto md:block">
            <LayerToggle
              activeDomain={activeDomain}
              onDomainChange={setActiveDomain}
              visiblePins={visiblePins}
              onPinToggle={(pin) =>
                setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
              }
              confidenceMode={confidenceMode}
              onConfidenceToggle={toggleConfidenceMode}
              walkAccessMode={walkAccessMode}
              onWalkAccessToggle={toggleWalkAccessMode}
              cyclabilityMode={cyclabilityMode}
              onCyclabilityToggle={toggleCyclabilityMode}
            />
          </div>

          {/* Legend card (bottom-left) */}
          <div className="absolute bottom-4 left-4 z-10 hidden max-w-[16rem] space-y-2 md:block">
            <MapLegend domainLabel={legendLabel} />
            <Attribution />
          </div>

          {showTable && (
            <div className="absolute inset-0 z-20 overflow-auto bg-bg/97 p-6">
              <PlacesTable places={places} weights={weights} />
            </div>
          )}
        </div>

        {/* Right panel — swaps between ranked results and the selected profile */}
        <aside className="hidden w-[372px] shrink-0 flex-col border-l border-surface-border bg-surface md:flex">
          {selected ? (
            <ProfilePanel
              place={selected}
              weights={weights}
              onBack={() => setSelected(null)}
              onShortlistChange={updateShortlist}
              controls={personalisationControls}
            />
          ) : (
            <ResultsPanel
              places={places}
              weights={weights}
              onSelect={selectPlace}
              controls={personalisationControls}
              extra={
                <>
                  <ShortlistPanel
                    slugs={shortlist}
                    places={places}
                    onChange={updateShortlist}
                  />
                  <RecentlyViewed recent={recent} />
                  <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
                </>
              }
            />
          )}
        </aside>
      </div>

      <BottomSheet>
        <div className="space-y-3">{personalisationControls}</div>
        {selected && (
          <div className="mt-3 space-y-2">
            <ScoreBreakdownPanel place={selected} weights={weights} />
            <AddToShortlistButton
              slug={selected.slug}
              onShortlistChange={updateShortlist}
            />
          </div>
        )}
        <div className="mt-3 overflow-hidden rounded-lg border border-surface-border">
          <ResultsList
            places={places}
            weights={weights}
            limit={8}
            onSelect={selectPlace}
            selectedSlug={selected?.slug}
          />
        </div>
      </BottomSheet>
    </main>
  );
}

function TopBar({
  searchIndex,
  onSearchSelect,
  showTable,
  onToggleTable,
}: {
  searchIndex: ReturnType<typeof buildSearchIndex>;
  onSearchSelect: (slug: string) => void;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  return (
    <header className="z-20 flex shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-4 py-3">
      <Link href="/" className="font-display text-lg font-medium tracking-tight text-ink">
        liveable<span className="text-accent">.</span>melbourne
      </Link>
      <div className="hidden w-full max-w-sm flex-1 sm:block">
        <SearchBox
          index={searchIndex}
          onSelect={(e) => onSearchSelect(e.slug)}
        />
      </div>
      <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onToggleTable}
          className="rounded-md border border-surface-border px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {showTable ? "Map view" : "Table view"}
        </button>
        <NavLink href="/compare">Compare</NavLink>
        <NavLink href="/alerts">Alerts</NavLink>
        <NavLink href="/methodology">Methodology</NavLink>
        <NavLink href="/disclaimer" hideOnSmall>
          Disclaimer
        </NavLink>
      </nav>
    </header>
  );
}

function ResultsPanel({
  places,
  weights,
  onSelect,
  controls,
  extra,
}: {
  places: Place[];
  weights: import("@/lib/types").ScoreWeights;
  onSelect: (p: Place) => void;
  controls: React.ReactNode;
  extra: React.ReactNode;
}) {
  const count = places.filter((p) => !p.nonResidential).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Ranked results
        </h2>
        {count > 0 && (
          <span className="num rounded-full border border-surface-border bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
            {count} suburbs
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ResultsList
          places={places}
          weights={weights}
          limit={50}
          onSelect={onSelect}
        />
      </div>
      <div className="space-y-3 border-t border-surface-border bg-surface-sunken/60 p-3">
        {controls}
        {extra}
      </div>
    </div>
  );
}

function ProfilePanel({
  place,
  weights,
  onBack,
  onShortlistChange,
  controls,
}: {
  place: Place;
  weights: import("@/lib/types").ScoreWeights;
  onBack: () => void;
  onShortlistChange: (slugs: string[]) => void;
  controls: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-surface-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          ‹ Back to results
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <ScoreBreakdownPanel place={place} weights={weights} />
        <AddToShortlistButton slug={place.slug} onShortlistChange={onShortlistChange} />
        <div className="space-y-3">{controls}</div>
      </div>
    </div>
  );
}

function NavLink({
  href,
  children,
  hideOnSmall,
}: {
  href: string;
  children: React.ReactNode;
  hideOnSmall?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border border-surface-border px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent ${
        hideOnSmall ? "hidden lg:inline-block" : ""
      }`}
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
  weights: import("@/lib/types").ScoreWeights;
}) {
  const ranked = rankPlaces(places, weights);

  return (
    <table className="w-full text-left text-sm text-ink">
      <thead>
        <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-muted">
          <th className="py-2 pr-4 font-semibold">Rank</th>
          <th className="py-2 pr-4 font-semibold">Area</th>
          <th className="py-2 pr-4 font-semibold">Score</th>
          <th className="py-2 pr-4 font-semibold">LGA</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((p, i) => {
          const total = p.breakdown.total;
          return (
            <tr key={p.sa2Code} className="border-b border-surface-border/60">
              <td className="num py-2 pr-4 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-4">
                <Link
                  href={`/places/${p.slug}`}
                  className="font-medium text-accent hover:underline"
                >
                  {p.name}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <span
                  className="num inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-semibold"
                  style={{
                    background: percentileToColor(total),
                    color: percentileTextColor(total),
                  }}
                >
                  {total.toFixed(0)}
                </span>
              </td>
              <td className="py-2 pr-4 text-ink-muted">{p.lga}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
