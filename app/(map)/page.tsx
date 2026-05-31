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
import { MobileSheet } from "@/components/MobileSheet";
import { MapLegend } from "@/components/MapLegend";
import { Attribution } from "@/components/Attribution";
import { SelectedSummaryCard } from "@/components/SelectedSummaryCard";
import type { Place } from "@/lib/types";
import { loadPlaces, getPlaceBySlug } from "@/lib/places-data";
import { buildSearchIndex } from "@/lib/search";
import {
  DOMAIN_LABELS,
  domainProperty,
  percentileToColor,
  percentileTextColor,
} from "@/lib/colors";
import { rankPlaces } from "@/lib/scoring";
import { useMapPersonalisation } from "@/lib/use-map-personalisation";

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [showTable, setShowTable] = useState(false);
  // Pins are OFF by default — they only appear when the user enables a category.
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});
  // Camera target for the area search / list selections. Map clicks never set
  // this, so clicking a place on the map preserves the current view.
  const [focusTarget, setFocusTarget] = useState<{
    center: [number, number];
    nonce: number;
  } | null>(null);

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

  // Map-click selection: update the side panel only, preserving map view.
  const selectPlace = (p: Place) => {
    setSelected(p);
    noteRecentView(p.slug, p.name);
  };

  // Search / list selection: select AND pan/zoom the map in-app (no reload).
  const focusPlace = (p: Place) => {
    selectPlace(p);
    setFocusTarget({ center: p.centroid, nonce: Date.now() });
  };

  const personalisationControls = (
    <div className="space-y-3">
      {/* Presets — quick, one-tap starting points (kept distinct from the
          manual priority sliders below to reduce confusion). */}
      <section aria-label="Presets" className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Presets
        </h3>
        <InterestViews active={interestView} onSelect={selectInterestView} />
        <PersonaPresets onSelect={selectPersona} />
      </section>

      <div className="border-t border-surface-border" aria-hidden />

      {/* Adjust priorities — manual fine-tuning, separated from presets. */}
      <section aria-label="Adjust priorities" className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Fine-tune priorities
        </h3>
        <DomainSliders
          weights={weights}
          onChange={setWeightsAndSync}
          onReset={resetWeights}
        />
      </section>
    </div>
  );

  const legendLabel = walkAccessMode
    ? "15-min walk access (context, not in score)"
    : cyclabilityMode
      ? "Cyclability (context, not in score)"
      : confidenceMode
        ? "Data confidence (context, not in score)"
        : DOMAIN_LABELS[activeDomain];

  // The GeoJSON property currently painted on the choropleth — feeds the map
  // hover tooltip so it always reports the value the user is looking at.
  const paintedProp = walkAccessMode
    ? "pct_walkaccess"
    : cyclabilityMode
      ? "pct_cyclability"
      : confidenceMode
        ? "pct_confidence"
        : domainProperty(activeDomain);

  // Short label (no "context" suffix) for the selected-area mini-summary.
  const activeLayerLabel = walkAccessMode
    ? "15-min walk access"
    : cyclabilityMode
      ? "Cyclability"
      : confidenceMode
        ? "Data confidence"
        : DOMAIN_LABELS[activeDomain];

  const isHomeBuyer = interestView === "homeBuyer";

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-ink">
      <TopBar
        searchIndex={searchIndex}
        onSearchSelect={(slug) => {
          const p = getPlaceBySlug(places, slug);
          if (p) focusPlace(p);
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
            focusTarget={focusTarget}
            selectedSlug={selected?.slug ?? null}
            hoverProp={paintedProp}
            hoverLabel={activeLayerLabel}
            onPlaceSelect={(props) => {
              const p = places.find(
                (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
              );
              if (p) selectPlace(p);
            }}
          />

          {/* Home-buyer caveat — visible on the map (not only the profile) so
              users never read the buyer lens as purchase-price guidance. */}
          {isHomeBuyer && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 w-[min(92%,30rem)] -translate-x-1/2">
              <p className="pointer-events-auto rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface/95 px-3 py-2 text-xs leading-snug text-ink-muted shadow-card backdrop-blur">
                <span className="font-medium text-ink">Home-buyer lens:</span>{" "}
                context only — sale/purchase prices are{" "}
                <span className="font-medium text-ink">not</span> included. This
                ranks liveability factors, not property value.
              </p>
            </div>
          )}

          {/* Floating layer-control card (top-right) */}
          <div className="absolute right-4 top-4 z-10 hidden max-h-[calc(100%-2rem)] w-56 overflow-y-auto md:block">
            <LayerToggle
              activeDomain={activeDomain}
              onDomainChange={setActiveDomain}
              visiblePins={visiblePins}
              onPinToggle={(pin) =>
                setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
              }
              onClearPins={() => setVisiblePins({})}
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
            <MapLegend domainLabel={legendLabel} visiblePins={visiblePins} />
            <Attribution />
          </div>

          {/* Persistent selected-area mini-summary (desktop) — a lightweight
              map-side quick view; the rich profile lives on its own page. */}
          {selected && (
            <div className="absolute bottom-4 left-1/2 z-10 hidden w-[22rem] max-w-[calc(100%-2rem)] -translate-x-1/2 md:block">
              <SelectedSummaryCard
                place={selected}
                weights={weights}
                activeLayerLabel={activeLayerLabel}
                onClose={() => setSelected(null)}
                onShortlistChange={updateShortlist}
              />
            </div>
          )}

          {showTable && (
            <div className="absolute inset-0 z-20 overflow-auto bg-bg/97 p-6">
              <PlacesTable places={places} weights={weights} />
            </div>
          )}
        </div>

        {/* Right panel — the ranked results stay mounted and always visible;
            selecting a place highlights its row and opens the map mini-summary
            (no panel swap, so the list never disappears). */}
        <aside className="hidden w-[372px] shrink-0 flex-col border-l border-surface-border bg-surface md:flex">
          <ResultsPanel
            places={places}
            weights={weights}
            onSelect={focusPlace}
            selectedSlug={selected?.slug}
            controls={personalisationControls}
            extra={
              <>
                <ShortlistPanel
                  slugs={shortlist}
                  places={places}
                  onChange={updateShortlist}
                  onOpen={focusPlace}
                />
                <RecentlyViewed recent={recent} />
                <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
              </>
            }
          />
        </aside>
      </div>

      <MobileSheet
        results={
          <div className="space-y-3">
            {selected && (
              <SelectedSummaryCard
                place={selected}
                weights={weights}
                activeLayerLabel={activeLayerLabel}
                onClose={() => setSelected(null)}
                onShortlistChange={updateShortlist}
              />
            )}
            <div className="overflow-hidden rounded-lg border border-surface-border">
              <ResultsList
                places={places}
                weights={weights}
                limit={50}
                onSelect={focusPlace}
                selectedSlug={selected?.slug}
              />
            </div>
          </div>
        }
        search={
          <div className="space-y-3">
            <SearchBox
              index={searchIndex}
              onSelect={(e) => {
                const p = getPlaceBySlug(places, e.slug);
                if (p) focusPlace(p);
              }}
            />
            <p className="text-xs leading-snug text-ink-muted">
              Search a suburb or data area (SA2) to jump the map there.
            </p>
            <ShortlistPanel
              slugs={shortlist}
              places={places}
              onChange={updateShortlist}
              onOpen={focusPlace}
            />
            <RecentlyViewed recent={recent} />
          </div>
        }
        layers={
          <div className="space-y-3">
            <LayerToggle
              activeDomain={activeDomain}
              onDomainChange={setActiveDomain}
              visiblePins={visiblePins}
              onPinToggle={(pin) =>
                setVisiblePins((v) => ({ ...v, [pin]: !v[pin] }))
              }
              onClearPins={() => setVisiblePins({})}
              confidenceMode={confidenceMode}
              onConfidenceToggle={toggleConfidenceMode}
              walkAccessMode={walkAccessMode}
              onWalkAccessToggle={toggleWalkAccessMode}
              cyclabilityMode={cyclabilityMode}
              onCyclabilityToggle={toggleCyclabilityMode}
            />
            <MapLegend domainLabel={legendLabel} visiblePins={visiblePins} />
          </div>
        }
        weights={
          <div className="space-y-3">
            {personalisationControls}
            <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
          </div>
        }
      />
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
  selectedSlug,
  controls,
  extra,
}: {
  places: Place[];
  weights: import("@/lib/types").ScoreWeights;
  onSelect: (p: Place) => void;
  selectedSlug?: string;
  controls: React.ReactNode;
  extra: React.ReactNode;
}) {
  const total = places.length;
  const residential = places.filter((p) => !p.nonResidential).length;
  return (
    // Three stacked regions in a min-h-0 column. The header is fixed, the
    // ranked list is the priority `flex-1 min-h-0 overflow` region (so it is
    // ALWAYS visible and scrolls on its own), and the controls live in their
    // own height-capped scroll region. Previously the controls block had no
    // height bound, so a tall stack (presets + sliders + shortlist) ate the
    // whole panel and collapsed the results list to 0px.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-surface-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Ranked results
          </h2>
          {residential > 0 && (
            <span className="num rounded-full border border-surface-border bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
              {residential} of {total}
            </span>
          )}
        </div>
        {residential > 0 && (
          <p className="mt-1 text-[11px] leading-snug text-ink-muted">
            Ranking {residential} residential SA2 suburbs (of {total} SA2s total).
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ResultsList
          places={places}
          weights={weights}
          limit={50}
          onSelect={onSelect}
          selectedSlug={selectedSlug}
        />
      </div>
      <div className="max-h-[42%] shrink-0 space-y-3 overflow-y-auto border-t border-surface-border bg-surface-sunken/60 p-3">
        {controls}
        {extra}
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
