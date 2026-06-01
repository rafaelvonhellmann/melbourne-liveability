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
import { MobileSheet } from "@/components/MobileSheet";
import { MapLegend } from "@/components/MapLegend";
import { Attribution } from "@/components/Attribution";
import { SelectedSummaryCard } from "@/components/SelectedSummaryCard";
import { ResultsList } from "@/components/ResultsList";
import { FeedbackButton } from "@/components/FeedbackButton";
import { OnboardingModal } from "@/components/OnboardingModal";
import type { Place } from "@/lib/types";
import { loadPlaces, getPlaceBySlug } from "@/lib/places-data";
import { buildSearchIndex } from "@/lib/search";
import { DOMAIN_LABELS, domainProperty } from "@/lib/colors";
import { useMapPersonalisation } from "@/lib/use-map-personalisation";

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
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
    loadPlaces()
      .then((p) => {
        setPlaces(p);
        setLoadError(false);
      })
      .catch((e) => {
        console.error(e);
        setLoadError(true);
      });
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

  // Ranked results — decision-support, not the map hero. A re-weightable lens
  // surfaced in its own tab/section, driven by the current priority weights.
  const rankedResults = (
    <div className="space-y-2">
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Ranked for your priorities
        </h3>
        <p className="px-1 text-[11px] leading-snug text-ink-muted">
          Top residential areas by your current weights — one lens, not an
          objective ranking. Re-weight to re-rank; tap a row to focus it.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-surface-border bg-surface">
        <ResultsList
          places={places}
          weights={weights}
          limit={20}
          onSelect={focusPlace}
          selectedSlug={selected?.slug ?? undefined}
        />
      </div>
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
      />

      <OnboardingModal onPick={selectInterestView} />

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

          {/* Data-load failure — visible, recoverable (never a silent empty map). */}
          {loadError && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(92%,30rem)] -translate-x-1/2">
              <div
                role="alert"
                className="pointer-events-auto rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-xs leading-snug text-[#9A552F] shadow-card"
              >
                <span className="font-medium">Could not load area data.</span> Check your
                connection and{" "}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="font-medium underline underline-offset-2"
                >
                  reload
                </button>
                .
              </div>
            </div>
          )}

          {/* Home-buyer caveat — visible on the map (not only the profile) so
              users never read the buyer lens as purchase-price guidance. */}
          {isHomeBuyer && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 w-[min(92%,30rem)] -translate-x-1/2">
              <p className="pointer-events-auto rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface px-3 py-2 text-xs leading-snug text-ink shadow-card">
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

        </div>

        {/* Desktop sidebar — explore tools only; ranked suburb lists are deferred
            to a future signed-in profile feature. */}
        <aside className="hidden w-[372px] shrink-0 flex-col border-l border-surface-border bg-surface md:flex">
          <MapSidebar
            places={places}
            searchIndex={searchIndex}
            onFocusPlace={focusPlace}
            controls={personalisationControls}
            results={rankedResults}
            shortlist={shortlist}
            recent={recent}
            onShortlistChange={updateShortlist}
            getShareUrl={getShareUrl}
          />
        </aside>
      </div>

      <MobileSheet
        explore={
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
            <ExploreHint residentialCount={places.filter((p) => !p.nonResidential).length} />
          </div>
        }
        results={rankedResults}
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
}: {
  searchIndex: ReturnType<typeof buildSearchIndex>;
  onSearchSelect: (slug: string) => void;
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
        <FeedbackButton />
        <NavLink href="/compare">Compare</NavLink>
        <NavLink href="/pricing">Pricing</NavLink>
        <NavLink href="/account" hideOnSmall>
          Your data
        </NavLink>
        <NavLink href="/alerts" hideOnSmall>
          Alerts
        </NavLink>
        <NavLink href="/methodology" hideOnSmall>
          Methodology
        </NavLink>
        <NavLink href="/disclaimer" hideOnSmall>
          Disclaimer
        </NavLink>
      </nav>
    </header>
  );
}

function MapSidebar({
  places,
  searchIndex,
  onFocusPlace,
  controls,
  results,
  shortlist,
  recent,
  onShortlistChange,
  getShareUrl,
}: {
  places: Place[];
  searchIndex: ReturnType<typeof buildSearchIndex>;
  onFocusPlace: (p: Place) => void;
  controls: React.ReactNode;
  results: React.ReactNode;
  shortlist: string[];
  recent: import("@/lib/user-prefs").RecentPlace[];
  onShortlistChange: (slugs: string[]) => void;
  getShareUrl: () => string;
}) {
  const total = places.length;
  const residential = places.filter((p) => !p.nonResidential).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-surface-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Explore
        </h2>
        <p className="mt-1 text-sm leading-snug text-ink">
          Search a suburb, click the map, or use your shortlist. Priority sliders
          shape the match score for the area you select.
        </p>
        {residential > 0 && (
          <p className="mt-2 text-[11px] text-ink-muted">
            {residential} residential SA2 suburbs in view (of {total} SA2s total),
            ranked by your priorities below. Saved &amp; synced lists are planned for
            signed-in profiles.
          </p>
        )}
      </div>
      <div className="space-y-3 border-b border-surface-border p-3">
        <SearchBox
          index={searchIndex}
          onSelect={(e) => {
            const p = getPlaceBySlug(places, e.slug);
            if (p) onFocusPlace(p);
          }}
        />
        <ShortlistPanel
          slugs={shortlist}
          places={places}
          onChange={onShortlistChange}
          onOpen={onFocusPlace}
        />
        <RecentlyViewed recent={recent} />
        <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
      </div>
      <div className="border-b border-surface-border p-3">{results}</div>
      <div className="space-y-3 p-3">{controls}</div>
    </div>
  );
}

function ExploreHint({ residentialCount }: { residentialCount: number }) {
  return (
    <p className="rounded-lg border border-surface-border bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">
      Tap the map or use Search to pick an area.
      {residentialCount > 0 && (
        <>
          {" "}
          We hold {residentialCount} residential SA2 suburbs — see the Results tab
          for a live ranking. Saved &amp; synced lists are planned for signed-in
          profiles.
        </>
      )}
    </p>
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

