"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, PanelRightClose, PanelRightOpen, Bike, Layers, ChevronDown } from "lucide-react";
import { MelbourneMap } from "@/components/MelbourneMap";
import { LayerToggle } from "@/components/LayerToggle";
import { SearchBox } from "@/components/SearchBox";
import { DomainSliders } from "@/components/DomainSliders";
import { InterestViews } from "@/components/InterestViews";
import { ShortlistPanel } from "@/components/ShortlistPanel";
import { ShareViewButton } from "@/components/ShareViewButton";
import { MobileSheet } from "@/components/MobileSheet";
import { MapLegend } from "@/components/MapLegend";
import { Attribution } from "@/components/Attribution";
import { SelectedSummaryCard } from "@/components/SelectedSummaryCard";
import { FeedbackButton } from "@/components/FeedbackButton";
import { OnboardingModal } from "@/components/OnboardingModal";
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";
import { SavedChecks } from "@/components/buyer/SavedChecks";
import { BuyerProfilePanel } from "@/components/buyer/BuyerProfilePanel";
import {
  savedCheckId,
  loadBuyerProfile,
  saveBuyerProfile,
  clearBuyerProfile,
  type SavedCheck,
} from "@/lib/user-prefs";
import type { BuyerProfile } from "@/lib/buyer-fit";
import { buildBuyerReport, type BuyerReport as BuyerReportData } from "@/lib/buyer-report";
import type { NoiseLine } from "@/lib/noise";
import type { NuisancePoint } from "@/lib/nuisance";
import type { SchoolZonesData } from "@/lib/school-zones";
import type { TrafficSegment } from "@/lib/traffic";
import type { EpaAirSite } from "@/lib/epa-air";
import type { ActivityCentreFeature } from "@/lib/activity-centres";
import { fetchParcelAreaAt } from "@/lib/parcel";
import type { Station, BusStop } from "@/lib/transit";
import { findSa2ForPoint } from "@/lib/buyer-location";
import { MAJOR_PROJECTS } from "@/lib/major-projects";
import type { GeocodeResult } from "@/lib/geocode";
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

// Buyer-relevant amenity pins for the "show everything within a 15-min walk" button.
const WALK_PIN_CATEGORIES = [
  { id: "supermarket", label: "Groceries" },
  { id: "gp", label: "GP" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "school", label: "Schools" },
  { id: "gym_leisure", label: "Gym" },
  { id: "bank", label: "Banks" },
  { id: "park", label: "Parks" },
];

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  // Desktop side-panel collapse - gives the map full width on demand.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Pins are OFF by default - they only appear when the user enables a category.
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
    socialHousingMode,
    toggleSocialHousingMode,
    colorblindRamp,
    toggleColorblindRamp,
    hazardLayer,
    selectHazardLayer,
    savedChecks,
    saveCheck,
    removeCheck,
    setWeightsAndSync,
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

  // Press Escape to clear the selected-area card - a seamless "back to the map"
  // (the friend feedback: selecting an area felt like a trap with no easy exit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Selecting an area collapses the Layers panel; clearing it brings the panel
  // back. (Manual toggle still works between selection changes.)
  useEffect(() => {
    setShowLayers(!selected);
  }, [selected]);

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
  // Pin from the shared URL at first render, so the map can initialise centred on
  // it (no whole-metro flash). Computed once; the async restore below still
  // resolves the SA2 + report.
  const [initialBuyerPin] = useState<[number, number] | null>(
    () => parseMapUrlState(searchParams.toString()).pin ?? null
  );
  const [showCycleRadius, setShowCycleRadius] = useState(false);
  // Rail/tram lines near the pin (loaded lazily when buyer mode opens).
  const [transitLines, setTransitLines] = useState<NoiseLine[]>([]);
  // Personal "fit" profile (buyer/agent), local-only. `profileRef` mirrors it so
  // a rebuild triggered right after save reads the latest profile (not stale state).
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<BuyerProfile | null>(null);
  useEffect(() => {
    const pf = loadBuyerProfile();
    setProfile(pf);
    profileRef.current = pf;
  }, []);
  // Floating Layers panel (desktop) auto-collapses to a pill when an area is
  // selected, so the selected-area card isn't crowded by the big panel.
  const [showLayers, setShowLayers] = useState(true);
  const [buyerSa2, setBuyerSa2] = useState<{ slug?: string; sa2Code?: string } | null>(null);
  const [buyerReport, setBuyerReport] = useState<BuyerReportData | null>(null);
  // Paid-tier "precise walk routing" fetch status (idle until the user opts in).
  const [preciseStatus, setPreciseStatus] = useState<"idle" | "loading" | "error">("idle");

  // Staleness guards for the async precise-walk fetch. `buyerPinRef` mirrors the
  // current pin so an in-flight request can detect that the pin moved underneath
  // it; `precisionAbortRef` cancels a superseded fetch. Without these, a slow ORS
  // response for an old pin could overwrite the report for a newly dropped pin.
  const buyerPinRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    buyerPinRef.current = buyerPin;
  }, [buyerPin]);

  // Lazy-load rail/tram lines once buyer mode opens, to draw the local network
  // around the pin. Reuses the noise-line loader (same OSM source).
  useEffect(() => {
    if (!buyerMode || transitLines.length > 0) return;
    let cancelled = false;
    void ensureNoiseLines()
      .then((lines) => {
        if (!cancelled) {
          setTransitLines(lines.filter((l) => l.kind === "rail" || l.kind === "tram"));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureNoiseLines is stable
  }, [buyerMode]);
  const precisionAbortRef = useRef<AbortController | null>(null);

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
  // Transport-noise source lines (rail/tram/freeway) for the buyer report's
  // proximity proxy. Lazy-loaded once on first pin (kept out of the map bundle).
  const noiseLinesRef = useRef<NoiseLine[] | null>(null);
  async function ensureNoiseLines(): Promise<NoiseLine[]> {
    if (noiseLinesRef.current) return noiseLinesRef.current;
    const res = await fetch(withBase("/data/noise-lines.json"));
    const g = (await res.json()) as Record<NoiseLine["kind"], [number, number][][]>;
    const lines: NoiseLine[] = [];
    (["rail", "tram", "freeway"] as const).forEach((k) =>
      (g[k] ?? []).forEach((coords) => lines.push({ kind: k, coords }))
    );
    noiseLinesRef.current = lines;
    return lines;
  }
  // Nuisance source points (industrial/waste/sewage/quarry) for the buyer
  // report's disamenity proximity proxy. Lazy-loaded once on first pin.
  const nuisancePointsRef = useRef<NuisancePoint[] | null>(null);
  async function ensureNuisancePoints(): Promise<NuisancePoint[]> {
    if (nuisancePointsRef.current) return nuisancePointsRef.current;
    const res = await fetch(withBase("/data/nuisance-points.json"));
    const g = (await res.json()) as Record<NuisancePoint["kind"], [number, number][]>;
    const pts: NuisancePoint[] = [];
    (["industrial", "waste", "sewage", "quarry"] as const).forEach((k) =>
      (g[k] ?? []).forEach((coord) => pts.push({ kind: k, coord }))
    );
    nuisancePointsRef.current = pts;
    return pts;
  }
  // Train stations (OSM) for the buyer report's nearest-station distance.
  const stationsRef = useRef<Station[] | null>(null);
  async function ensureStations(): Promise<Station[]> {
    if (stationsRef.current) return stationsRef.current;
    const res = await fetch(withBase("/data/train-stations.json"));
    stationsRef.current = (await res.json()) as Station[];
    return stationsRef.current;
  }
  // Government school zones (DataVic) for the buyer report's address-level
  // zone match. Lazy-loaded once on first pin (kept out of the map bundle).
  const schoolZonesRef = useRef<SchoolZonesData | null>(null);
  async function ensureSchoolZones(): Promise<SchoolZonesData | null> {
    if (schoolZonesRef.current) return schoolZonesRef.current;
    const res = await fetch(withBase("/data/school-zones.json"));
    schoolZonesRef.current = (await res.json()) as SchoolZonesData;
    return schoolZonesRef.current;
  }
  // DTP traffic-volume (AADT) segments for the buyer report's "busy road nearby"
  // proximity finding. Lazy-loaded once on first pin (kept out of the map bundle).
  const trafficRef = useRef<TrafficSegment[] | null>(null);
  async function ensureTraffic(): Promise<TrafficSegment[]> {
    if (trafficRef.current) return trafficRef.current;
    const res = await fetch(withBase("/data/traffic-aadt.json"));
    trafficRef.current = (await res.json()) as TrafficSegment[];
    return trafficRef.current;
  }
  // EPA air-monitoring sites for the "air quality nearby" finding. Lazy-loaded.
  const epaAirRef = useRef<EpaAirSite[] | null>(null);
  async function ensureEpaAir(): Promise<EpaAirSite[]> {
    if (epaAirRef.current) return epaAirRef.current;
    const res = await fetch(withBase("/data/epa-air-sites.json"));
    const j = (await res.json()) as { sites?: EpaAirSite[] };
    epaAirRef.current = j.sites ?? [];
    return epaAirRef.current;
  }
  // Activity Centre Zones for the "in a designated activity centre" finding. Lazy-loaded.
  const activityCentresRef = useRef<ActivityCentreFeature[] | null>(null);
  async function ensureActivityCentres(): Promise<ActivityCentreFeature[]> {
    if (activityCentresRef.current) return activityCentresRef.current;
    const res = await fetch(withBase("/data/activity-centres.json"));
    const fc = (await res.json()) as { features?: ActivityCentreFeature[] };
    activityCentresRef.current = fc.features ?? [];
    return activityCentresRef.current;
  }
  // GTFS bus stops for the "bus access" finding. Lazy-loaded.
  const busStopsRef = useRef<BusStop[] | null>(null);
  async function ensureBusStops(): Promise<BusStop[]> {
    if (busStopsRef.current) return busStopsRef.current;
    const res = await fetch(withBase("/data/bus-stops.json"));
    busStopsRef.current = (await res.json()) as BusStop[];
    return busStopsRef.current;
  }

  const buyerPlace = useMemo(
    () =>
      buyerSa2
        ? places.find((p) => p.slug === buyerSa2.slug || p.sa2Code === buyerSa2.sa2Code) ?? null
        : null,
    [buyerSa2, places]
  );

  // Lightweight area centre-points for the buyer report's adjacency nudge (pin
  // near a neighbouring SA2 → recommend checking it). Derived once from places.
  const areaCentroids = useMemo(
    () =>
      places.map((p) => ({
        sa2Code: p.sa2Code,
        slug: p.slug,
        name: p.name,
        centroid: p.centroid,
      })),
    [places]
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
    sa2: { slug?: string; sa2Code?: string } | null,
    // "pin" = an exact dropped/geocoded point (address-level findings allowed);
    // "sa2" = a suburb-search centroid (NOT a property - address-level findings
    // must fall back to area-level). Default pin for map clicks / restored pins.
    mode: "pin" | "sa2" = "pin"
  ) => {
    // A new/moved pin (or a "revert") always starts from the free straight-line
    // report - any prior precise result no longer applies to this point. Cancel
    // any in-flight precise fetch so its (now stale) result can't land late.
    precisionAbortRef.current?.abort();
    setPreciseStatus("idle");
    const [feats, noiseLines, nuisancePoints, stations, schoolZones, traffic, epaAir, activityCentres, busStops] = await Promise.all([
      ensurePois().catch(() => [] as Feature<Point>[]),
      ensureNoiseLines().catch(() => [] as NoiseLine[]),
      ensureNuisancePoints().catch(() => [] as NuisancePoint[]),
      ensureStations().catch(() => [] as Station[]),
      ensureSchoolZones().catch(() => null),
      ensureTraffic().catch(() => [] as TrafficSegment[]),
      ensureEpaAir().catch(() => [] as EpaAirSite[]),
      ensureActivityCentres().catch(() => [] as ActivityCentreFeature[]),
      ensureBusStops().catch(() => [] as BusStop[]),
    ]);
    // Parcel is an exact-address concept: never query it for a suburb centroid.
    const parcel = mode === "pin" ? await fetchParcelAreaAt(lngLat[0], lngLat[1]).catch(() => null) : null;
    const place = sa2
      ? places.find((p) => p.slug === sa2.slug || p.sa2Code === sa2.sa2Code) ?? null
      : null;
    // A newer pin (moved/searched) may have superseded this build while the
    // parcel/POI fetches were in flight - don't overwrite the current report.
    if (buyerPinRef.current !== lngLat) return;
    setBuyerReport(
      buildBuyerReport({
        mode,
        lat: lngLat[1],
        lng: lngLat[0],
        place,
        pois: feats,
        noiseLines,
        nuisancePoints,
        stations,
        schoolZones: schoolZones ?? undefined,
        traffic,
        epaAir,
        activityCentres,
        parcel,
        busStops,
        nearbyAreas: areaCentroids,
        majorProjects: MAJOR_PROJECTS,
        profile: profileRef.current,
      })
    );
    track("buyer_report", { coverage: place ? "in" : "off" });
  };

  // Paid-tier opt-in: recompute "nearby on foot" against a real street-network
  // walk isochrone (OpenRouteService) instead of the straight-line radius. It is
  // a runtime, client-side, env-gated fetch (so static export is untouched) and
  // never runs on the free tier - the button is hidden without a configured key.
  const recomputePrecise = async () => {
    const pin = buyerPin;
    if (!pin) return;
    // Supersede any earlier in-flight precise request, and allow this one to be
    // cancelled if the pin moves while ORS is still responding.
    precisionAbortRef.current?.abort();
    const ctrl = new AbortController();
    precisionAbortRef.current = ctrl;
    setPreciseStatus("loading");
    const iso = await fetchWalkIsochrone(pin, WALK_MINUTES, { signal: ctrl.signal });
    // Discard silently if this request was superseded or the pin moved under it —
    // a stale isochrone must never overwrite the report for a different pin.
    if (ctrl.signal.aborted || buyerPinRef.current !== pin) return;
    if (!iso.ok) {
      setPreciseStatus("error");
      return;
    }
    const [feats, noiseLines, nuisancePoints, stations, schoolZones, traffic, epaAir, activityCentres, busStops] = await Promise.all([
      ensurePois().catch(() => [] as Feature<Point>[]),
      ensureNoiseLines().catch(() => [] as NoiseLine[]),
      ensureNuisancePoints().catch(() => [] as NuisancePoint[]),
      ensureStations().catch(() => [] as Station[]),
      ensureSchoolZones().catch(() => null),
      ensureTraffic().catch(() => [] as TrafficSegment[]),
      ensureEpaAir().catch(() => [] as EpaAirSite[]),
      ensureActivityCentres().catch(() => [] as ActivityCentreFeature[]),
      ensureBusStops().catch(() => [] as BusStop[]),
    ]);
    const parcel = await fetchParcelAreaAt(pin[0], pin[1], ctrl.signal).catch(() => null);
    if (ctrl.signal.aborted || buyerPinRef.current !== pin) return;
    setBuyerReport(
      buildBuyerReport({
        lat: pin[1],
        lng: pin[0],
        place: buyerPlace,
        pois: feats,
        isochrone: iso.geom,
        noiseLines,
        nuisancePoints,
        stations,
        schoolZones: schoolZones ?? undefined,
        traffic,
        epaAir,
        activityCentres,
        parcel,
        busStops,
        nearbyAreas: areaCentroids,
        majorProjects: MAJOR_PROJECTS,
        profile: profileRef.current,
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
    void buildReportFor(c, { slug: p.slug, sa2Code: p.sa2Code }, "sa2");
  };

  // Full-address geocode (OSM Nominatim, client-side) → exact-pin deep-dive.
  // There is no clicked map feature, so the SA2 is resolved from geometry. This
  // mirrors a map click at the geocoded coordinate; suburb/SA2 search + map
  // clicks remain the primary flows.
  const selectFromAddress = async (r: GeocodeResult) => {
    const lngLat: [number, number] = [r.lng, r.lat];
    setBuyerMode(true);
    setSelected(null);
    setBuyerPin(lngLat); // the map flies to the pin
    setBuyerSa2(null);
    setBuyerReport(null);
    syncBuyerUrl(true, lngLat);
    const fc = await ensureSa2Geo().catch(() => null);
    const sa2 = fc ? findSa2ForPoint(lngLat, fc) : null;
    setBuyerSa2(sa2);
    void buildReportFor(lngLat, sa2);
    track("buyer_geocode", { coverage: sa2 ? "in" : "off" });
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

  // Saved checks (device-local retention): bookmark the current pin, or reopen a
  // saved one (regenerating the deterministic report from its coordinates).
  const currentCheckSaved = useMemo(
    () =>
      buyerPin != null &&
      savedChecks.some((c) => c.id === savedCheckId(buyerPin[1], buyerPin[0])),
    [savedChecks, buyerPin]
  );
  const toggleSaveCheck = () => {
    if (!buyerPin) return;
    const id = savedCheckId(buyerPin[1], buyerPin[0]);
    if (savedChecks.some((c) => c.id === id)) {
      removeCheck(id);
    } else {
      saveCheck({ lat: buyerPin[1], lng: buyerPin[0], areaName: buyerPlace?.name });
      track("buyer_save_check", { coverage: buyerPlace ? "in" : "off" });
    }
  };
  const openSavedCheck = (c: SavedCheck) => {
    const lngLat: [number, number] = [c.lng, c.lat];
    setBuyerMode(true);
    setSelected(null);
    syncBuyerUrl(true, lngLat);
    void restorePin(lngLat);
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
    } else if (url.select) {
      // Deep-link from a /places profile ("View on the map"): select the area and
      // pan to it. The hook already applied any &layer= one-shot.
      const target = places.find((pl) => pl.slug === url.select);
      if (target) focusPlace(target);
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
      {/* Lens - one unified set of one-tap starting points (sets layer +
          weights), kept distinct from the manual priority sliders below. */}
      <section aria-label="Lens">
        <InterestViews active={interestView} onSelect={selectInterestView} />
      </section>

      <div className="border-t border-surface-border" aria-hidden />

      {/* Adjust priorities - manual fine-tuning, collapsed by default so the
          panel stays uncluttered; the Lens presets cover most users (feedback). */}
      <section aria-label="Adjust priorities">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:text-accent">
            <span>Fine-tune priorities</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2">
            <DomainSliders
              weights={weights}
              onChange={setWeightsAndSync}
              onReset={resetWeights}
            />
          </div>
        </details>
      </section>
    </div>
  );

  const onSaveProfile = (pf: BuyerProfile) => {
    const next = saveBuyerProfile(pf).buyerProfile ?? pf;
    setProfile(next);
    profileRef.current = next;
    setShowProfile(false);
    if (buyerPin) void buildReportFor(buyerPin, buyerSa2);
  };
  const onClearProfile = () => {
    clearBuyerProfile();
    setProfile(null);
    profileRef.current = null;
    setShowProfile(false);
    if (buyerPin) void buildReportFor(buyerPin, buyerSa2);
  };

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
        <div className="space-y-3">
          <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-sm text-ink-muted">
            Click the map - or search a suburb or full address in the top bar - to drop a
            pin and get a second-opinion report.
          </p>
          <SavedChecks
            checks={savedChecks}
            onOpen={openSavedCheck}
            onRemove={removeCheck}
          />
        </div>
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
              This pin is outside our Greater Melbourne SA2 coverage - drop it on a Melbourne
              property for the full report.
            </p>
          )}
          {/* Personalise: a local-only profile that adds "Fit for your life" +
              deal-breaker flags to the report (buyer or agent). */}
          {showProfile ? (
            <BuyerProfilePanel
              initial={profile}
              onSave={onSaveProfile}
              onClear={onClearProfile}
              onClose={() => setShowProfile(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="w-full rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {profile
                ? `Edit ${profile.mode === "agent" ? "client" : "your"} preferences`
                : "Personalise this report"}
            </button>
          )}
          {/* 15-min walk: the radius is drawn on the map; this drops every
              buyer-relevant pin so you see what's inside the circle at once. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const ids = WALK_PIN_CATEGORIES.map((c) => c.id);
                const allOn = ids.every((id) => visiblePins[id]);
                setVisiblePins((v) => {
                  const next = { ...v };
                  for (const id of ids) next[id] = !allOn;
                  return next;
                });
              }}
              aria-pressed={WALK_PIN_CATEGORIES.every((c) => visiblePins[c.id])}
              className="rounded-full border border-accent bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              {WALK_PIN_CATEGORIES.every((c) => visiblePins[c.id])
                ? "Hide 15-min walk"
                : "Show 15-min walk"}
            </button>
            <span className="text-[11px] text-ink-muted">or one:</span>
            {WALK_PIN_CATEGORIES.map((c) => {
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
          {/* ~15-min bike reach ring around the pin, plus this area's mapped
              cycle-infrastructure index (context-only, never scored). */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCycleRadius((v) => !v)}
              aria-pressed={showCycleRadius}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                showCycleRadius
                  ? "border-[#0E7C86] bg-[#0E7C86] text-white"
                  : "border-surface-border text-ink-muted hover:border-[#0E7C86] hover:text-[#0E7C86]"
              }`}
            >
              <Bike className="h-3 w-3" aria-hidden />
              {showCycleRadius ? "Hide bike radius" : "Show ~15-min bike"}
            </button>
            {buyerPlace?.context?.cyclability && (
              <span className="text-[11px] text-ink-muted">
                Area cycle-infra:{" "}
                <b className="num text-ink">{buyerPlace.context.cyclability.index}</b>/100
              </span>
            )}
          </div>
          {isPreciseWalkConfigured() && (
            <div className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs">
              {buyerReport.accessMode === "precise" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted">
                    <b className="text-ink">Precise walk routing on</b> - &ldquo;nearby&rdquo; reflects
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
                  Couldn&apos;t fetch the walk isochrone just now - still showing straight-line. Try
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
            onSaveCheck={toggleSaveCheck}
            isSaved={currentCheckSaved}
          />
        </>
      )}
    </div>
  );

  // Safety choropleth is painted (no override layer) -> the legend labels the ramp
  // by crime direction (greener = less crime) instead of generic worse/better.
  const safetyLegend =
    activeDomain === "safety" &&
    !hazardLayer &&
    !walkAccessMode &&
    !cyclabilityMode &&
    !socialHousingMode &&
    !confidenceMode;

  const legendLabel = hazardLayer === "bushfire"
    ? "Bushfire-prone overlay share (context)"
    : hazardLayer === "flood"
      ? "Flood overlay share (context)"
      : walkAccessMode
        ? "15-min walk access (context, not in score)"
        : cyclabilityMode
          ? "Cyclability (context, not in score)"
          : socialHousingMode
            ? "Social-housing supply (context, not in score)"
            : confidenceMode
              ? "Data confidence (context, not in score)"
              : DOMAIN_LABELS[activeDomain];

  // The GeoJSON property currently painted on the choropleth - feeds the map
  // hover tooltip so it always reports the value the user is looking at.
  const paintedProp = hazardLayer
    ? `${hazardLayer}_share`
    : walkAccessMode
      ? "pct_walkaccess"
      : cyclabilityMode
        ? "pct_cyclability"
        : socialHousingMode
          ? "social_share"
          : confidenceMode
            ? "pct_confidence"
            : domainProperty(activeDomain);

  // Short label (no "context" suffix) for the selected-area mini-summary.
  const activeLayerLabel = hazardLayer === "bushfire"
    ? "Bushfire overlay"
    : hazardLayer === "flood"
      ? "Flood overlay"
      : walkAccessMode
        ? "15-min walk access"
        : cyclabilityMode
          ? "Cyclability"
          : socialHousingMode
            ? "Social housing"
            : confidenceMode
              ? "Data confidence"
              : DOMAIN_LABELS[activeDomain];

  const isHomeBuyer = interestView === "homeBuyer";

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-ink">
      <h1 className="sr-only">
        liveable.melbourne - Greater Melbourne liveability map and pin-level Buyer Check
      </h1>
      <TopBar
        searchIndex={searchIndex}
        onSearchSelect={selectFromSearch}
        onGeocode={selectFromAddress}
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
            socialHousingMode={socialHousingMode}
            colorblind={colorblindRamp}
            hazardLayer={hazardLayer}
            visiblePins={visiblePins}
            focusTarget={focusTarget}
            selectedSlug={selected?.slug ?? null}
            hoverProp={paintedProp}
            hoverLabel={activeLayerLabel}
            buyerMode={buyerMode}
            initialBuyerPin={initialBuyerPin}
            buyerPin={buyerPin}
            anchorPoints={buyerMode ? profile?.anchors ?? [] : []}
            transitLines={buyerMode ? transitLines : []}
            showCycleRadius={showCycleRadius}
            onPinDrop={onPinDrop}
            onPlaceSelect={(props) => {
              const p = places.find(
                (x) => x.slug === props.slug || x.sa2Code === props.sa2Code
              );
              if (!p) return;
              // Click the already-selected area again to deselect (toggle) - a
              // quick way back to the clean map without hunting for the close X.
              if (selected?.slug === p.slug) setSelected(null);
              else selectPlace(p);
            }}
          />

          {/* Buyer-mode map legend: Big Build pins + (with a pin) nearby transit. */}
          {buyerMode && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-surface-border bg-surface/95 px-2.5 py-1.5 text-[11px] shadow-card backdrop-blur">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-muted">
                On the map
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-white" style={{ background: "#D95F02" }} aria-hidden />
                  Big Build
                </span>
                {buyerPin && transitLines.length > 0 && (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4" style={{ background: "#2C6FB3" }} aria-hidden />
                      Train
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4" style={{ background: "#1B9E77" }} aria-hidden />
                      Tram
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Buyer "Location Check" toggle - the headline interaction. */}
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

          {/* Data-load failure - visible, recoverable (never a silent empty map). */}
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

          {/* Home-buyer caveat - visible on the map (not only the profile) so
              users never read the buyer lens as purchase-price guidance. */}
          {isHomeBuyer && !buyerMode && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-10 w-[min(92%,30rem)] -translate-x-1/2">
              <p className="pointer-events-auto rounded-lg border border-surface-border border-l-[3px] border-l-accent bg-surface px-3 py-2 text-xs leading-snug text-ink shadow-card">
                <span className="font-medium text-ink">Home-buyer lens:</span>{" "}
                context only - sale/purchase prices are{" "}
                <span className="font-medium text-ink">not</span> included. This
                ranks liveability factors, not property value.
              </p>
            </div>
          )}

          {/* Floating layer-control card (top-right). Collapses to a "Layers"
              pill when an area is selected (or on demand) to keep the map clean. */}
          <div
            className={`absolute right-4 top-4 z-10 hidden md:block ${
              showLayers ? "max-h-[calc(100%-2rem)] w-56 overflow-y-auto" : ""
            }`}
          >
            {showLayers ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowLayers(false)}
                  className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-surface/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted shadow-card backdrop-blur transition-colors hover:text-accent"
                  aria-expanded
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5" aria-hidden />
                    Layers
                  </span>
                  <span aria-hidden>Hide ×</span>
                </button>
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
                  socialHousingMode={socialHousingMode}
                  onSocialHousingToggle={toggleSocialHousingMode}
                  colorblindRamp={colorblindRamp}
                  onColorblindToggle={toggleColorblindRamp}
                  hazardLayer={hazardLayer}
                  onHazardSelect={selectHazardLayer}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLayers(true)}
                aria-label="Show map layers"
                aria-expanded={false}
                className="flex items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3.5 py-1.5 text-sm font-medium text-ink shadow-card backdrop-blur transition-colors hover:border-accent hover:text-accent"
              >
                <Layers className="h-4 w-4" aria-hidden />
                Layers
              </button>
            )}
          </div>

          {/* Legend card (bottom-left) */}
          <div className="absolute bottom-4 left-4 z-10 hidden max-w-[16rem] space-y-2 md:block">
            <MapLegend
              domainLabel={legendLabel}
              visiblePins={visiblePins}
              risk={!!hazardLayer}
              social={socialHousingMode}
              safety={safetyLegend}
              colorblind={colorblindRamp}
            />
            <Attribution />
          </div>

          {/* Persistent selected-area mini-summary (desktop) - a lightweight
              map-side quick view; the rich profile lives on its own page. */}
          {selected && (
            <div className="absolute bottom-4 left-1/2 z-10 hidden w-[22rem] max-w-[calc(100%-2rem)] -translate-x-1/2 md:block">
              <SelectedSummaryCard
                place={selected}
                weights={weights}
                places={places}
                activeLayerLabel={activeLayerLabel}
                onClose={() => setSelected(null)}
                onShortlistChange={updateShortlist}
              />
            </div>
          )}

          {/* Collapse / expand the side panel (desktop) - sits on the map's right
              edge so it stays reachable whether the panel is open or hidden. */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Show side panel" : "Hide side panel"}
            aria-expanded={!sidebarCollapsed}
            className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 items-center rounded-l-lg border border-r-0 border-surface-border bg-surface px-1 py-3 text-ink-muted shadow-card transition-colors hover:text-accent md:flex"
          >
            {sidebarCollapsed ? (
              <PanelRightOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelRightClose className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {/* Desktop sidebar - explore tools only; ranked suburb lists are deferred
            to a future signed-in profile feature. Collapsible for a full-width map. */}
        <aside
          className={`hidden shrink-0 flex-col border-l border-surface-border bg-surface transition-[width] duration-300 ease-out md:flex ${
            sidebarCollapsed
              ? "w-0 overflow-hidden border-l-0"
              : buyerMode
                ? "w-[460px] lg:w-[520px]"
                : "w-[372px]"
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
                  places={places}
                  activeLayerLabel={activeLayerLabel}
                  onClose={() => setSelected(null)}
                  onShortlistChange={updateShortlist}
                />
              )}
              <ExploreHint residentialCount={places.filter((p) => !p.nonResidential).length} />
            </div>
          )
        }
        search={
          <div className="space-y-3">
            <SearchBox
              index={searchIndex}
              onSelect={(e) => selectFromSearch(e.slug)}
              onGeocode={selectFromAddress}
            />
            <p className="text-xs leading-snug text-ink-muted">
              Search a suburb or data area to jump the map there, or a full
              street address to drop an exact pin.
            </p>
            <ShortlistPanel
              slugs={shortlist}
              places={places}
              onChange={updateShortlist}
              onOpen={focusPlace}
            />
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
              socialHousingMode={socialHousingMode}
              onSocialHousingToggle={toggleSocialHousingMode}
              colorblindRamp={colorblindRamp}
              onColorblindToggle={toggleColorblindRamp}
              hazardLayer={hazardLayer}
              onHazardSelect={selectHazardLayer}
            />
            <MapLegend
              domainLabel={legendLabel}
              visiblePins={visiblePins}
              risk={!!hazardLayer}
              social={socialHousingMode}
              safety={safetyLegend}
              colorblind={colorblindRamp}
            />
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
  onGeocode,
}: {
  searchIndex: ReturnType<typeof buildSearchIndex>;
  onSearchSelect: (slug: string) => void;
  onGeocode: (result: GeocodeResult) => void;
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
          onGeocode={onGeocode}
        />
      </div>
      <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <FeedbackButton />
        <NavLink href="/buyer">Buyer check</NavLink>
        <NavLink href="/compare">Compare</NavLink>
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
          We hold {residentialCount} residential SA2 suburbs. Saved &amp; synced
          lists are planned for signed-in profiles.
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

