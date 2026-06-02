"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
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
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";
import { buildBuyerReport, type BuyerReport as BuyerReportData } from "@/lib/buyer-report";
import { findSa2ForPoint } from "@/lib/buyer-location";
import { fetchWalkIsochrone, isPreciseWalkConfigured, WALK_MINUTES } from "@/lib/walk-isochrone";
import { withBase } from "@/lib/asset-path";
import { parseMapUrlState, buildMapUrl } from "@/lib/share-url";
import { track } from "@/lib/analytics";
import type { Feature, FeatureCollection, Point } from "geojson";
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

  // ---- Buyer "Location Check" mode ------------------------------------
  const router = useRouter();
  const searchParams = useSearchParams();
  const [buyerMode, setBuyerMode] = useState(false);
  const [buyerPin, setBuyerPin] = useState<[number, number] | null>(null);
  const [buyerSa2, setBuyerSa2] = useState<{ slug?: string; sa2Code?: string } | null>(null);
  const [buyerReport, setBuyerReport] = useState<BuyerReportData | null>(null);
  // Paid-tier "precise walk routing" fetch status (idle until the user opts in).
  const [preciseStatus, setPreciseStatus] = useState<"idle" | "loading" | "error">("idle");

  // POIs + SA2 polygons live in the MapLibre sources; for the report maths we
  // also need them as JS. Lazy-load each once (kept out of the initial bundle).
  const poiFeaturesRef = useRef<Feature<Point>[] | null>(null);
  const sa2GeoRef = useRef<FeatureCollection | null>(null);

  async function ensurePois(): Promise<Feature<Point>[]> {
    if (poiFeaturesRef.current) return poiFeaturesRef.current;
    const res = await fetch(withBase("/data/pois.geojson"));
    const fc = (await res.json()) as { features?: Feature<Point>[] };
    poiFeaturesRef.current = fc.features ?? [];
    return poiFeaturesRef.current;
  }
  async function ensureSa2Geo(): Promise<FeatureCollection> {
    if (sa2GeoRef.current) return sa2GeoRef.current;
    const res = await fetch(withBase("/data/places.geojson"));
    sa2GeoRef.current = (await res.json()) as FeatureCollection;
    return sa2GeoRef.current;
  }

  const buyerPlace = useMemo(
    () =>
      buyerSa2
        ? places.find((p) => p.slug === buyerSa2.slug || p.sa2Code === buyerSa2.sa2Code) ?? null
        : null,
    [buyerSa2, places]
  );

  // Persist buyer mode + pin to the URL so a report is shareable / restorable.
  const syncBuyerUrl = (mode: boolean, pin: [number, number] | null) => {
    router.replace(
      buildMapUrl("/", {
        weights,
        shortlist,
        view: interestView,
        buyer: mode,
        pin: mode ? pin : null,
      }),
      { scroll: false }
    );
  };

  const buildReportFor = async (
    lngLat: [number, number],
    sa2: { slug?: string; sa2Code?: string } | null
  ) => {
    // A new/moved pin (or a "revert") always starts from the free straight-line
    // report — any prior precise result no longer applies to this point.
    setPreciseStatus("idle");
    const feats = await ensurePois().catch(() => [] as Feature<Point>[]);
    const place = sa2
      ? places.find((p) => p.slug === sa2.slug || p.sa2Code === sa2.sa2Code) ?? null
      : null;
    setBuyerReport(
      buildBuyerReport({ lat: lngLat[1], lng: lngLat[0], place, pois: feats })
    );
    track("buyer_report", { coverage: place ? "in" : "off" });
  };

  // Paid-tier opt-in: recompute "nearby on foot" against a real street-network
  // walk isochrone (OpenRouteService) instead of the straight-line radius. It is
  // a runtime, client-side, env-gated fetch (so static export is untouched) and
  // never runs on the free tier — the button is hidden without a configured key.
  const recomputePrecise = async () => {
    if (!buyerPin) return;
    setPreciseStatus("loading");
    const iso = await fetchWalkIsochrone(buyerPin, WALK_MINUTES);
    if (!iso.ok) {
      setPreciseStatus("error");
      return;
    }
    const feats = await ensurePois().catch(() => [] as Feature<Point>[]);
    setBuyerReport(
      buildBuyerReport({
        lat: buyerPin[1],
        lng: buyerPin[0],
        place: buyerPlace,
        pois: feats,
        isochrone: iso.geom,
      })
    );
    setPreciseStatus("idle");
  };

  // Live map click in buyer mode (SA2 comes from the clicked map feature).
  const onPinDrop = (
    lngLat: [number, number],
    sa2: { slug?: string; name?: string; sa2Code?: string } | null
  ) => {
    setBuyerMode(true); // a map click enters the buyer deep-dive directly
    setSelected(null);
    setBuyerPin(lngLat);
    setBuyerSa2(sa2);
    setBuyerReport(null); // "computing" until pois resolve
    syncBuyerUrl(true, lngLat);
    void buildReportFor(lngLat, sa2);
  };

  // Search-driven location (keyboard-accessible alternative to clicking the map):
  // in buyer mode, drop the pin at the suburb/SA2 centroid; else pan the map.
  const selectFromSearch = (slug: string) => {
    const p = getPlaceBySlug(places, slug);
    if (!p) return;
    // Searching enters the buyer deep-dive at the area centroid; click the map
    // to refine to the exact spot.
    const c = p.centroid as [number, number];
    setBuyerMode(true);
    setSelected(null);
    setBuyerPin(c);
    setBuyerSa2({ slug: p.slug, sa2Code: p.sa2Code });
    setBuyerReport(null);
    syncBuyerUrl(true, c);
    void buildReportFor(c, { slug: p.slug, sa2Code: p.sa2Code });
  };

  // Restore a pin from a shared URL (no map click → resolve the SA2 from geometry).
  const restorePin = async (lngLat: [number, number]) => {
    setBuyerPin(lngLat);
    setBuyerReport(null);
    const fc = await ensureSa2Geo().catch(() => null);
    const sa2 = fc ? findSa2ForPoint(lngLat, fc) : null;
    setBuyerSa2(sa2);
    void buildReportFor(lngLat, sa2);
  };

  const clearBuyerPin = () => {
    setBuyerPin(null);
    setBuyerSa2(null);
    setBuyerReport(null);
    syncBuyerUrl(true, null);
  };

  const toggleBuyerMode = () => {
    const next = !buyerMode;
    if (next) setSelected(null);
    else {
      setBuyerPin(null);
      setBuyerSa2(null);
      setBuyerReport(null);
    }
    setBuyerMode(next);
    track("buyer_mode", { on: next });
    syncBuyerUrl(next, next ? buyerPin : null);
  };

  // One-shot restore from ?buyer=1&lat&lng once place data is available.
  const buyerRestoredRef = useRef(false);
  useEffect(() => {
    if (buyerRestoredRef.current || places.length === 0) return;
    buyerRestoredRef.current = true;
    const url = parseMapUrlState(searchParams.toString());
    if (url.buyer) {
      setBuyerMode(true);
      setSelected(null);
      if (url.pin) void restorePin(url.pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const buyerShareUrl = useMemo(
    () =>
      buyerPin
        ? buildMapUrl(withBase("/"), {
            weights,
            shortlist,
            view: interestView,
            buyer: true,
            pin: buyerPin,
          })
        : undefined,
    [buyerPin, weights, shortlist, interestView]
  );

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

  const buyerPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-medium text-ink">Location check</h2>
        <button
          type="button"
          onClick={toggleBuyerMode}
          className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
        >
          Exit
        </button>
      </div>
      {!buyerPin ? (
        <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-sm text-ink-muted">
          Click the map — or search a suburb in the top bar — to drop a pin and get a
          second-opinion report.
        </p>
      ) : !buyerReport ? (
        <p className="text-sm text-ink-muted">Computing what&apos;s nearby…</p>
      ) : (
        <>
          {buyerPlace ? (
            <p className="text-xs text-ink-muted">
              Pinned in <b className="text-ink">{buyerPlace.name}</b>, {buyerPlace.lga}. Click
              elsewhere on the map to move the pin.
            </p>
          ) : (
            <p className="text-xs text-ink-muted">
              This pin is outside our Greater Melbourne SA2 coverage — drop it on a Melbourne
              property for the full report.
            </p>
          )}
          {/* Toggle nearby-amenity pins on the map (you're zoomed into the area). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-muted">Show nearby:</span>
            {[
              { id: "supermarket", label: "Groceries" },
              { id: "gp", label: "GP" },
              { id: "school", label: "Schools" },
              { id: "gym_leisure", label: "Gym" },
              { id: "bank", label: "Banks" },
              { id: "park", label: "Parks" },
            ].map((c) => {
              const on = !!visiblePins[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setVisiblePins((v) => ({ ...v, [c.id]: !v[c.id] }))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    on
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-surface-border text-ink-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {isPreciseWalkConfigured() && (
            <div className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs">
              {buyerReport.accessMode === "precise" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted">
                    <b className="text-ink">Precise walk routing on</b> — &ldquo;nearby&rdquo; reflects
                    a street-network ~15-min walk.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (buyerPin) void buildReportFor(buyerPin, buyerSa2);
                    }}
                    className="shrink-0 text-accent hover:underline"
                  >
                    Revert
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted">
                    Free check uses straight-line distance. Recompute on the real street network?
                  </span>
                  <button
                    type="button"
                    onClick={() => void recomputePrecise()}
                    disabled={preciseStatus === "loading"}
                    className="shrink-0 rounded-md border border-accent bg-accent px-2.5 py-1 font-medium text-accent-ink transition-colors hover:bg-accent-focus disabled:opacity-60"
                  >
                    {preciseStatus === "loading" ? "Routing…" : "Use precise walk routing (beta)"}
                  </button>
                </div>
              )}
              {preciseStatus === "error" && (
                <p className="mt-1 text-[11px] text-[#9A552F]">
                  Couldn&apos;t fetch the walk isochrone just now — still showing straight-line. Try
                  again shortly.
                </p>
              )}
            </div>
          )}
          <BuyerReportPanel
            report={buyerReport}
            place={buyerPlace}
            variant="live"
            shareUrl={buyerShareUrl}
            onClear={clearBuyerPin}
          />
        </>
      )}
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
        onSearchSelect={selectFromSearch}
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
            buyerMode={buyerMode}
            buyerPin={buyerPin}
            onPinDrop={onPinDrop}
            onPlaceSelect={(props) => {
              const p = places.find(
                (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
              );
              if (p) selectPlace(p);
            }}
          />

          {/* Buyer "Location Check" toggle — the headline interaction. */}
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={toggleBuyerMode}
              aria-pressed={buyerMode}
              className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-card transition-colors ${
                buyerMode
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-surface-border bg-surface text-ink hover:border-accent hover:text-accent"
              }`}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {buyerMode ? "Exit location check" : "Check a location"}
            </button>
            {buyerMode && !buyerPin && (
              <p className="mt-2 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-center text-xs text-ink-muted shadow-card">
                Click the map to drop a pin on a property
              </p>
            )}
          </div>

          {/* Data-load failure — visible, recoverable (never a silent empty map). */}
          {loadError && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(92%,30rem)] -translate-x-1/2">
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
          {isHomeBuyer && !buyerMode && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-10 w-[min(92%,30rem)] -translate-x-1/2">
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
        <aside
          className={`hidden shrink-0 flex-col border-l border-surface-border bg-surface transition-[width] duration-300 ease-out md:flex ${
            buyerMode ? "w-[460px] lg:w-[520px]" : "w-[372px]"
          }`}
        >
          {buyerMode ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{buyerPanel}</div>
          ) : (
            <MapSidebar
              places={places}
              onFocusPlace={focusPlace}
              controls={personalisationControls}
              shortlist={shortlist}
              onShortlistChange={updateShortlist}
              getShareUrl={getShareUrl}
            />
          )}
        </aside>
      </div>

      <MobileSheet
        buyerMode={buyerMode}
        explore={
          buyerMode ? (
            buyerPanel
          ) : (
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
          )
        }
        results={rankedResults}
        search={
          <div className="space-y-3">
            <SearchBox
              index={searchIndex}
              onSelect={(e) => selectFromSearch(e.slug)}
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
        <NavLink href="/buyer">Buyer check</NavLink>
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
  onFocusPlace,
  controls,
  shortlist,
  onShortlistChange,
  getShareUrl,
}: {
  places: Place[];
  onFocusPlace: (p: Place) => void;
  controls: React.ReactNode;
  shortlist: string[];
  onShortlistChange: (slugs: string[]) => void;
  getShareUrl: () => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-surface-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Explore
        </h2>
        <p className="mt-1 text-sm leading-snug text-ink">
          Search where you want to live, or click the map to check a location.
        </p>
      </div>
      <div className="space-y-3 border-b border-surface-border p-3">
        <ShortlistPanel
          slugs={shortlist}
          places={places}
          onChange={onShortlistChange}
          onOpen={onFocusPlace}
        />
        <ShareViewButton getUrl={getShareUrl} label="Copy map link" />
      </div>
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

