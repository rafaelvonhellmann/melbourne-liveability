"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Map as MaplibreMap, Marker as MaplibreMarker } from "maplibre-gl";
import { POI_CATEGORIES } from "@/lib/poi-categories";

/** The maplibre Marker constructor, captured from the dynamic import. */
type MarkerCtor = typeof import("maplibre-gl")["Marker"];

/** The slice of the maplibre library the rig touches. */
type MaplibreLib = {
  Map: typeof import("maplibre-gl")["Map"];
  Marker: MarkerCtor;
  /** Removed in maplibre v3+; honoured when an older build exports it. */
  supported?: () => boolean;
};

/**
 * LandingMap - the scroll-driven map rig behind the landing page.
 *
 * A lightweight, NON-interactive maplibre canvas (no data layers, no nav
 * controls, pointer-events:none so the page scrolls straight through it) that
 * the landing's scroll story drives via an imperative camera seam:
 *
 *   ref.setSceneProgress(fromId, toId, t)   // t in 0..1
 *
 * interpolates between two camera keyframes and applies the pose with
 * map.jumpTo on the next animation frame (jumpTo-per-frame is the
 * scrollytelling standard - smooth and cheap; never flyTo during scroll).
 *
 * - Same public basemap style + attribution as MelbourneMap (maplibre's
 *   default AttributionControl; the style supplies OSM / CARTO credits).
 * - maplibre-gl is imported DYNAMICALLY inside the mount effect, so the heavy
 *   chunk loads only when the landing actually shows - returning users who
 *   skip the landing never pay for it (mirrors page.tsx's next/dynamic split).
 * - prefers-reduced-motion: the camera snaps to the nearer keyframe instead of
 *   interpolating, and the pin / ring / amenity dots appear without animation
 *   (see the .landing-* rules in globals.css).
 * - WebGL unavailable: renders a static Crema street-grid vignette (the
 *   OnboardingModal aesthetic) so the landing never breaks.
 */

/** Same public basemap style as MelbourneMap (components/MelbourneMap.tsx). */
const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Whole-metro default when no keyframes are supplied (matches lib/region). */
const DEFAULT_POSE: CameraPose = {
  center: [144.9631, -37.8136],
  zoom: 10,
  pitch: 0,
  bearing: 0,
};

/** Camera resting point for one landing scene. */
export type CameraKeyframe = {
  id: string;
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
};

/** Fully-resolved camera pose (what map.jumpTo receives). */
export type CameraPose = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

/** Linear camera interpolation between two keyframes; t is clamped to 0..1. */
export function lerpCamera(from: CameraKeyframe, to: CameraKeyframe, t: number): CameraPose {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    center: [mix(from.center[0], to.center[0]), mix(from.center[1], to.center[1])],
    zoom: mix(from.zoom, to.zoom),
    pitch: mix(from.pitch ?? 0, to.pitch ?? 0),
    bearing: mix(from.bearing ?? 0, to.bearing ?? 0),
  };
}

/**
 * Default colours for the ~6 amenity dots, sourced from the live POI palette
 * (lib/poi-categories) so the landing previews the product's real pin colours:
 * supermarket, school, GP, gym, pharmacy, childcare.
 */
const NEARBY_DOT_IDS = [
  "supermarket",
  "school",
  "gp",
  "gym_leisure",
  "pharmacy",
  "childcare",
] as const;
export const NEARBY_DOT_COLORS: string[] = NEARBY_DOT_IDS.map(
  (id) => POI_CATEGORIES.find((c) => c.id === id)?.color ?? "#1D4ED8"
);

/** One small nearby-amenity dot: where it sits and which POI colour it wears. */
export type AmenityDot = { lngLat: [number, number]; color: string };

export type LandingMapHandle = {
  /**
   * Drive the camera between two keyframes: t=0 sits on `fromId`, t=1 on
   * `toId`. Applied via map.jumpTo on the next animation frame (calls within
   * one frame coalesce). Unknown ids are ignored. Under reduced motion the
   * camera snaps to the nearer keyframe (t < 0.5 -> from, else to).
   */
  setSceneProgress: (fromId: string, toId: string, t: number) => void;
};

type LandingMapProps = {
  /** Ordered camera resting points; the map mounts on the first one. */
  keyframes: CameraKeyframe[];
  /** Where the accent pin (and its soft radius ring) sits. */
  pin?: [number, number] | null;
  /** Crossing the pin scene's threshold flips this on -> the pin DROPS. */
  pinVisible?: boolean;
  /** ~6 small nearby-amenity dots; pass a stable array (module const). */
  amenityDots?: AmenityDot[];
  /** Flips on after the pin lands -> dots stagger-fade in (60ms apart). */
  dotsVisible?: boolean;
  /** Extra classes on the rig root (parent supplies sticky/fixed placement). */
  className?: string;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * WebGL-unavailable fallback: a static Crema street-grid vignette (the
 * OnboardingModal IntroVignette aesthetic, full-bleed) with the pin, ring and
 * amenity dots painted in statically. Decorative only - the landing copy
 * carries the story; this just keeps the backdrop from ever being a hole.
 */
function StaticMapFallback({ dotColors }: { dotColors: string[] }) {
  // Decorative dot spots around the pin (SVG user units, not geography).
  const SPOTS: [number, number][] = [
    [304, 70],
    [388, 60],
    [262, 116],
    [368, 138],
    [414, 104],
    [292, 132],
  ];
  return (
    <div
      data-testid="landing-map-fallback"
      aria-hidden="true"
      className="h-full w-full overflow-hidden bg-[#F2F2EF]"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 560 240"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <rect width="560" height="240" fill="#F2F2EF" />
        {/* River band along the bottom */}
        <path d="M0 196 Q150 178 280 200 T560 188 L560 240 L0 240 Z" fill="#DCE7F0" />
        <path
          d="M0 194 Q150 176 280 198 T560 186"
          fill="none"
          stroke="#C3D4E4"
          strokeWidth="2"
        />
        {/* Minor streets */}
        <g stroke="#E4E4DF" strokeWidth="1.5">
          <path d="M40 0 V240 M150 0 V240 M282 0 V196 M410 0 V240 M520 0 V196" />
          <path d="M0 30 H560 M0 92 H560 M0 152 H560" />
        </g>
        {/* Major roads */}
        <g stroke="#FFFFFF" strokeWidth="9">
          <path d="M84 0 V240 M216 0 V196 M348 0 V240 M472 0 V196" />
          <path d="M0 56 H560 M0 124 H560 M0 178 H348" />
        </g>
        {/* Parks */}
        <g fill="#E9EDE4">
          <rect x="372" y="64" width="84" height="50" rx="4" />
          <rect x="96" y="132" width="84" height="38" rx="4" />
        </g>
        {/* Building footprints */}
        <g fill="#EBEBE7">
          <rect x="94" y="34" width="22" height="16" />
          <rect x="124" y="34" width="18" height="16" />
          <rect x="94" y="66" width="22" height="18" />
          <rect x="228" y="66" width="24" height="16" />
          <rect x="228" y="100" width="22" height="16" />
          <rect x="300" y="34" width="22" height="16" />
          <rect x="300" y="100" width="24" height="18" />
          <rect x="484" y="64" width="22" height="16" />
          <rect x="484" y="134" width="20" height="16" />
          <rect x="160" y="100" width="20" height="14" />
        </g>
        {/* Soft walk-radius ring + pin (static final frame) */}
        <circle
          cx="340"
          cy="96"
          r="54"
          fill="var(--accent-tint)"
          fillOpacity="0.45"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        {SPOTS.slice(0, dotColors.length).map(([x, y], i) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="4"
            fill={dotColors[i]}
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        ))}
        <circle cx="340" cy="96" r="6" fill="var(--accent)" stroke="#FFFFFF" strokeWidth="2" />
      </svg>
    </div>
  );
}

export const LandingMap = forwardRef<LandingMapHandle, LandingMapProps>(function LandingMap(
  {
    keyframes,
    pin = null,
    pinVisible = false,
    amenityDots = [],
    dotsVisible = false,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerCtorRef = useRef<MarkerCtor | null>(null);
  const pinMarkerRef = useRef<MaplibreMarker | null>(null);
  const dotMarkersRef = useRef<MaplibreMarker[]>([]);
  const lastDotsKeyRef = useRef("");
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);

  // Latest keyframes without re-initialising the map.
  const keyframesRef = useRef(keyframes);
  useEffect(() => {
    keyframesRef.current = keyframes;
  }, [keyframes]);

  // Camera pose pending application: coalesced to one jumpTo per frame, and
  // replayed once if the map is still loading when scroll starts.
  const pendingPoseRef = useRef<CameraPose | null>(null);
  const rafRef = useRef<number | null>(null);
  // Last REQUESTED pose - identical repeats (holding a keyframe, or the
  // reduced-motion snap re-resolving the same end) never touch the map.
  const lastPoseRef = useRef<CameraPose | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setSceneProgress(fromId, toId, t) {
        const kfs = keyframesRef.current;
        const from = kfs.find((k) => k.id === fromId);
        const to = kfs.find((k) => k.id === toId);
        if (!from || !to) return;
        const reduced = prefersReducedMotion();
        // Reduced motion: no interpolation - snap to the nearer keyframe.
        const pose = lerpCamera(from, to, reduced ? (t < 0.5 ? 0 : 1) : t);
        const prev = lastPoseRef.current;
        if (
          prev &&
          prev.center[0] === pose.center[0] &&
          prev.center[1] === pose.center[1] &&
          prev.zoom === pose.zoom &&
          prev.pitch === pose.pitch &&
          prev.bearing === pose.bearing
        ) {
          return;
        }
        lastPoseRef.current = pose;
        pendingPoseRef.current = pose;
        const map = mapRef.current;
        if (!map) return; // applied as soon as the map finishes mounting
        if (reduced) {
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          pendingPoseRef.current = null;
          map.jumpTo(pose);
          return;
        }
        if (rafRef.current === null) {
          let ran = false;
          const id = requestAnimationFrame(() => {
            ran = true;
            rafRef.current = null;
            const next = pendingPoseRef.current;
            pendingPoseRef.current = null;
            if (next && mapRef.current) mapRef.current.jumpTo(next);
          });
          // A synchronous rAF (test stubs, some headless rigs) has already run
          // the callback - storing its id would block every later schedule.
          if (!ran) rafRef.current = id;
        }
      },
    }),
    []
  );

  // Mount the map once. maplibre-gl is dynamically imported HERE so the chunk
  // is only fetched when the landing actually renders this rig.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let cancelled = false;

    (async () => {
      let lib: MaplibreLib;
      try {
        // CJS/ESM interop: the bundled package surfaces the library on
        // .default; a pure-ESM build is the namespace itself.
        const mod: unknown = await import("maplibre-gl");
        lib = ((mod as { default?: unknown }).default ?? mod) as MaplibreLib;
      } catch {
        if (!cancelled) setFallback(true);
        return;
      }
      if (cancelled) return;
      // Older maplibre exported supported(); v3+ throws on construction when
      // WebGL is unavailable. Honour both detection paths.
      if (typeof lib.supported === "function" && !lib.supported()) {
        setFallback(true);
        return;
      }
      const first = keyframesRef.current[0];
      let map: MaplibreMap;
      try {
        map = new lib.Map({
          container,
          style: BASEMAP,
          // The landing scroll owns the camera: no drag/scroll/keyboard/touch.
          interactive: false,
          center: first?.center ?? DEFAULT_POSE.center,
          zoom: first?.zoom ?? DEFAULT_POSE.zoom,
          pitch: first?.pitch ?? DEFAULT_POSE.pitch,
          bearing: first?.bearing ?? DEFAULT_POSE.bearing,
        });
      } catch {
        if (!cancelled) setFallback(true);
        return;
      }
      if (cancelled) {
        map.remove();
        return;
      }
      markerCtorRef.current = lib.Marker;
      mapRef.current = map;
      // Scroll happened while the style was still fetching - catch up now.
      if (pendingPoseRef.current) {
        map.jumpTo(pendingPoseRef.current);
        pendingPoseRef.current = null;
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      for (const m of dotMarkersRef.current) m.remove();
      dotMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      markerCtorRef.current = null;
      setReady(false);
    };
  }, []);

  // Accent pin + soft radius ring as a DOM Marker (the MelbourneMap buyer-pin
  // pattern). The drop / ring animations live in globals.css (.landing-pin*);
  // the inner spans animate so maplibre's own transform positioning on the
  // marker root is never fought.
  const pinLng = pin?.[0];
  const pinLat = pin?.[1];
  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerCtorRef.current;
    if (!map || !Marker) return;
    if (!pinVisible || pinLng === undefined || pinLat === undefined) {
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      return;
    }
    if (!pinMarkerRef.current) {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      const ring = document.createElement("span");
      ring.className = "landing-pin-ring";
      const dot = document.createElement("span");
      dot.className = "landing-pin";
      el.append(ring, dot);
      pinMarkerRef.current = new Marker({ element: el, anchor: "center" })
        .setLngLat([pinLng, pinLat])
        .addTo(map);
    } else {
      pinMarkerRef.current.setLngLat([pinLng, pinLat]);
    }
  }, [ready, pinVisible, pinLng, pinLat]);

  // Amenity dots - one tiny Marker each, staggered via the --dot-i CSS var.
  // Rebuilt only when content actually changes (the key check) so parent
  // re-renders during scroll never restart the entrance animation.
  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerCtorRef.current;
    if (!map || !Marker) return;
    const key = dotsVisible ? JSON.stringify(amenityDots) : "";
    if (key === lastDotsKeyRef.current) return;
    lastDotsKeyRef.current = key;
    for (const m of dotMarkersRef.current) m.remove();
    dotMarkersRef.current = [];
    if (!dotsVisible) return;
    dotMarkersRef.current = amenityDots.map((d, i) => {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      const s = document.createElement("span");
      s.className = "landing-dot";
      s.style.setProperty("--dot-color", d.color);
      s.style.setProperty("--dot-i", String(i));
      el.appendChild(s);
      return new Marker({ element: el, anchor: "center" }).setLngLat(d.lngLat).addTo(map);
    });
  }, [ready, dotsVisible, amenityDots]);

  return (
    <div
      data-testid="landing-map"
      className={[
        // pointer-events-none keeps scrolling/dragging on the page, never the
        // map; globals.css re-enables clicks on the attribution licence links.
        "landing-map pointer-events-none h-full w-full select-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {fallback ? (
        <StaticMapFallback
          dotColors={
            amenityDots.length > 0 ? amenityDots.map((d) => d.color) : NEARBY_DOT_COLORS
          }
        />
      ) : (
        <div ref={containerRef} data-testid="landing-map-canvas" className="h-full w-full" />
      )}
    </div>
  );
});

export default LandingMap;
