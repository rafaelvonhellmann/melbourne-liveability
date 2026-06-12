// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createRef, useRef } from "react";
import { BASEMAP_STYLE_URL } from "@/lib/basemap";
import {
  LandingMap,
  lerpCamera,
  NEARBY_DOT_COLORS,
  type CameraKeyframe,
  type LandingMapHandle,
} from "../components/landing/LandingMap";
import {
  pickActiveScene,
  sceneProgress,
  useScrollScene,
  type ScrollSceneState,
} from "../components/landing/useScrollScene";

/**
 * Landing scroll-map rig: pure camera interpolation (lerpCamera), pure
 * scroll-scene math (sceneProgress / pickActiveScene), the useScrollScene
 * wiring, and the LandingMap component - non-interactive constructor, the
 * setSceneProgress jumpTo seam, the reduced-motion snap path, pin / amenity
 * markers, and the WebGL-unavailable static fallback.
 */

/* ------------------------------------------------------------------------ */
/* maplibre-gl mock: records Map options + jumpTo poses + Marker elements.   */
/* ------------------------------------------------------------------------ */

const h = vi.hoisted(() => ({
  maps: [] as Array<{
    options: Record<string, unknown>;
    jumpCalls: unknown[];
    removed: boolean;
  }>,
  markers: [] as Array<{
    element: HTMLElement;
    lngLat: unknown;
    removed: boolean;
    addedTo: unknown;
  }>,
  throwOnConstruct: false,
  supportedImpl: undefined as undefined | (() => boolean),
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    options: Record<string, unknown>;
    jumpCalls: unknown[] = [];
    removed = false;
    constructor(options: Record<string, unknown>) {
      if (h.throwOnConstruct) throw new Error("Failed to initialize WebGL");
      this.options = options;
      h.maps.push(this);
    }
    jumpTo(pose: unknown) {
      this.jumpCalls.push(pose);
    }
    getZoom() {
      return 13.8;
    }
    remove() {
      this.removed = true;
    }
    on() {}
    once() {}
    off() {}
  }
  class FakeMarker {
    element: HTMLElement;
    lngLat: unknown = null;
    removed = false;
    addedTo: unknown = null;
    constructor(opts?: { element?: HTMLElement }) {
      this.element = opts?.element ?? document.createElement("div");
      h.markers.push(this);
    }
    setLngLat(ll: unknown) {
      this.lngLat = ll;
      return this;
    }
    addTo(map: unknown) {
      this.addedTo = map;
      return this;
    }
    remove() {
      this.removed = true;
    }
  }
  return {
    default: {
      Map: FakeMap,
      Marker: FakeMarker,
      get supported() {
        return h.supportedImpl;
      },
    },
  };
});

const KF: CameraKeyframe[] = [
  { id: "hero", center: [144.95, -37.81], zoom: 11 },
  { id: "pin", center: [144.97, -37.77], zoom: 14, pitch: 45, bearing: 20 },
];

const BRUNSWICK_EAST: [number, number] = [144.972, -37.769];
const DOTS = NEARBY_DOT_COLORS.map((color, i) => ({
  lngLat: [144.97 + i * 0.001, -37.77] as [number, number],
  color,
}));

beforeEach(() => {
  h.maps.length = 0;
  h.markers.length = 0;
  h.throwOnConstruct = false;
  h.supportedImpl = undefined;
  // Deterministic, synchronous rAF: the rig coalesces jumpTo per frame.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

async function renderRig(over: Partial<React.ComponentProps<typeof LandingMap>> = {}) {
  const ref = createRef<LandingMapHandle>();
  const utils = render(<LandingMap ref={ref} keyframes={KF} {...over} />);
  await waitFor(() => expect(h.maps).toHaveLength(1));
  return { ...utils, ref, map: h.maps[0] };
}

/* ------------------------------------------------------------------------ */
/* Pure camera interpolation                                                 */
/* ------------------------------------------------------------------------ */

describe("lerpCamera", () => {
  it("t=0 is the from pose, with pitch/bearing defaulting to 0", () => {
    expect(lerpCamera(KF[0], KF[1], 0)).toEqual({
      center: [144.95, -37.81],
      zoom: 11,
      pitch: 0,
      bearing: 0,
    });
  });

  it("t=1 is the to pose", () => {
    expect(lerpCamera(KF[0], KF[1], 1)).toEqual({
      center: [144.97, -37.77],
      zoom: 14,
      pitch: 45,
      bearing: 20,
    });
  });

  it("t=0.5 interpolates center, zoom, pitch and bearing linearly", () => {
    const pose = lerpCamera(KF[0], KF[1], 0.5);
    expect(pose.center[0]).toBeCloseTo(144.96, 10);
    expect(pose.center[1]).toBeCloseTo(-37.79, 10);
    expect(pose.zoom).toBeCloseTo(12.5, 10);
    expect(pose.pitch).toBeCloseTo(22.5, 10);
    expect(pose.bearing).toBeCloseTo(10, 10);
  });

  it("clamps t outside 0..1 (overscroll never overshoots the keyframes)", () => {
    expect(lerpCamera(KF[0], KF[1], -0.4)).toEqual(lerpCamera(KF[0], KF[1], 0));
    expect(lerpCamera(KF[0], KF[1], 1.8)).toEqual(lerpCamera(KF[0], KF[1], 1));
  });
});

/* ------------------------------------------------------------------------ */
/* Pure scroll-scene math                                                    */
/* ------------------------------------------------------------------------ */

describe("sceneProgress", () => {
  it("is 0 when the section top sits at the viewport bottom (about to enter)", () => {
    expect(sceneProgress(800, 600, 800)).toBe(0);
  });

  it("is 1 when the section bottom reaches the viewport top (fully passed)", () => {
    expect(sceneProgress(-600, 600, 800)).toBe(1);
  });

  it("is 0.5 exactly halfway through the travel", () => {
    // travel = 800 + 600 = 1400; halfway -> top = 800 - 700 = 100.
    expect(sceneProgress(100, 600, 800)).toBeCloseTo(0.5, 10);
  });

  it("clamps beyond either end and tolerates zero-size input", () => {
    expect(sceneProgress(2000, 600, 800)).toBe(0);
    expect(sceneProgress(-5000, 600, 800)).toBe(1);
    expect(sceneProgress(0, 0, 0)).toBe(0);
  });
});

describe("pickActiveScene", () => {
  const rects = [
    { top: 100, height: 600 },
    { top: 900, height: 600 },
    { top: 1700, height: 600 },
  ];

  it("returns the scene containing the viewport midline", () => {
    // Viewport 800 -> midline 400 inside scene 0 (100..700).
    expect(pickActiveScene(rects, 800)).toBe(0);
    // All shifted up 800px -> scene 1 spans -? actually 100..700 again.
    const shifted = rects.map((r) => ({ ...r, top: r.top - 800 }));
    expect(pickActiveScene(shifted, 800)).toBe(1);
  });

  it("falls back to the nearest section centre when the midline is in a gap", () => {
    // Midline 400 sits between scene 0 (ends 300) and scene 1 (starts 900).
    const gappy = [
      { top: -300, height: 600 },
      { top: 900, height: 600 },
    ];
    expect(pickActiveScene(gappy, 800)).toBe(0);
    // Past the last section -> the last one stays active.
    const passed = [
      { top: -2000, height: 600 },
      { top: -1200, height: 600 },
    ];
    expect(pickActiveScene(passed, 800)).toBe(1);
  });

  it("returns 0 for no scenes", () => {
    expect(pickActiveScene([], 800)).toBe(0);
  });
});

/* ------------------------------------------------------------------------ */
/* useScrollScene wiring (no IntersectionObserver in jsdom - the scroll      */
/* listener fallback path is what runs here)                                 */
/* ------------------------------------------------------------------------ */

function ScrollHarness({ onFrame }: { onFrame?: (s: ScrollSceneState) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLElement>(null);
  const b = useRef<HTMLElement>(null);
  const c = useRef<HTMLElement>(null);
  const stateRef = useRef<HTMLOutputElement>(null);
  // The hook's contract: frames arrive through the callback and the consumer
  // writes the DOM imperatively - scroll never re-renders the React tree.
  useScrollScene(containerRef, [a, b, c], (s) => {
    onFrame?.(s);
    if (stateRef.current) {
      stateRef.current.textContent = `${s.activeScene}:${s.progress.toFixed(3)}`;
    }
  });
  return (
    <div ref={containerRef}>
      <section ref={a} data-top="100" data-height="600" />
      <section ref={b} data-top="900" data-height="600" />
      <section ref={c} data-top="1700" data-height="600" />
      <output ref={stateRef} data-testid="scene-state" />
    </div>
  );
}

describe("useScrollScene", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element
    ) {
      const el = this as HTMLElement;
      const top = Number(el.dataset.top ?? 0);
      const height = Number(el.dataset.height ?? 0);
      return {
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  it("measures on mount: active scene + intra-scene progress", () => {
    render(<ScrollHarness />);
    // Midline 400 in scene 0; progress = (800-100)/(800+600) = 0.5.
    expect(screen.getByTestId("scene-state")).toHaveTextContent("0:0.500");
  });

  it("updates on scroll (rAF-throttled listener path)", () => {
    render(<ScrollHarness />);
    document.querySelectorAll("section").forEach((el) => {
      const s = el as HTMLElement;
      s.dataset.top = String(Number(s.dataset.top) - 800);
    });
    fireEvent.scroll(window);
    // Scene 1 now spans 100..700 (midline 400); progress (800-100)/1400 = 0.5.
    expect(screen.getByTestId("scene-state")).toHaveTextContent("1:0.500");
  });

  it("skips identical consecutive frames (scroll events with no movement)", () => {
    const onFrame = vi.fn();
    render(<ScrollHarness onFrame={onFrame} />);
    expect(onFrame).toHaveBeenCalledTimes(1); // initial mount measure
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(onFrame).toHaveBeenCalledTimes(1); // nothing moved - no new frames
  });
});

/* ------------------------------------------------------------------------ */
/* LandingMap component                                                      */
/* ------------------------------------------------------------------------ */

describe("LandingMap", () => {
  it("mounts a non-interactive map on the first keyframe with the shared basemap", async () => {
    const { map } = await renderRig();
    expect(map.options.interactive).toBe(false);
    expect(map.options.style).toBe(BASEMAP_STYLE_URL);
    expect(map.options.center).toEqual([144.95, -37.81]);
    expect(map.options.zoom).toBe(11);
    // Scroll passes through the rig - the page, not the map, owns the gesture.
    expect(screen.getByTestId("landing-map").className).toContain("pointer-events-none");
  });

  it("setSceneProgress applies the interpolated pose via jumpTo on a frame", async () => {
    const { ref, map } = await renderRig();
    ref.current!.setSceneProgress("hero", "pin", 0.5);
    expect(map.jumpCalls).toHaveLength(1);
    const pose = map.jumpCalls[0] as ReturnType<typeof lerpCamera>;
    expect(pose.center[0]).toBeCloseTo(144.96, 10);
    expect(pose.zoom).toBeCloseTo(12.5, 10);
    expect(pose.pitch).toBeCloseTo(22.5, 10);
    expect(pose.bearing).toBeCloseTo(10, 10);
    // Unknown ids are ignored, never throw.
    ref.current!.setSceneProgress("hero", "nope", 0.5);
    expect(map.jumpCalls).toHaveLength(1);
    // Identical repeat requests dedupe - holding a keyframe never spams jumpTo.
    ref.current!.setSceneProgress("hero", "pin", 0.5);
    expect(map.jumpCalls).toHaveLength(1);
    ref.current!.setSceneProgress("hero", "pin", 0.75);
    expect(map.jumpCalls).toHaveLength(2);
  });

  it("reduced motion snaps to the nearer keyframe instead of interpolating", async () => {
    stubReducedMotion(true);
    const { ref, map } = await renderRig();
    ref.current!.setSceneProgress("hero", "pin", 0.3);
    expect(map.jumpCalls.at(-1)).toEqual(lerpCamera(KF[0], KF[1], 0));
    ref.current!.setSceneProgress("hero", "pin", 0.7);
    expect(map.jumpCalls.at(-1)).toEqual(lerpCamera(KF[0], KF[1], 1));
  });

  it("drops the pin + ring marker when the scene threshold flips pinVisible", async () => {
    const { rerender, ref } = await renderRig({ pin: BRUNSWICK_EAST, pinVisible: false });
    expect(h.markers).toHaveLength(0);
    rerender(<LandingMap ref={ref} keyframes={KF} pin={BRUNSWICK_EAST} pinVisible />);
    await waitFor(() => expect(h.markers).toHaveLength(1));
    const marker = h.markers[0];
    expect(marker.lngLat).toEqual(BRUNSWICK_EAST);
    expect(marker.element.querySelector(".landing-pin")).not.toBeNull();
    expect(marker.element.querySelector(".landing-pin-ring")).not.toBeNull();
    expect(marker.element.getAttribute("aria-hidden")).toBe("true");
    // Hiding removes it again.
    rerender(<LandingMap ref={ref} keyframes={KF} pin={BRUNSWICK_EAST} pinVisible={false} />);
    await waitFor(() => expect(marker.removed).toBe(true));
  });

  it("stagger-fades the ~6 amenity dots in POI colours via --dot-i", async () => {
    const { rerender, ref } = await renderRig({ amenityDots: DOTS, dotsVisible: false });
    expect(h.markers).toHaveLength(0);
    rerender(<LandingMap ref={ref} keyframes={KF} amenityDots={DOTS} dotsVisible />);
    await waitFor(() => expect(h.markers).toHaveLength(6));
    h.markers.forEach((m, i) => {
      const dot = m.element.querySelector(".landing-dot") as HTMLElement;
      expect(dot).not.toBeNull();
      expect(dot.style.getPropertyValue("--dot-color")).toBe(NEARBY_DOT_COLORS[i]);
      expect(dot.style.getPropertyValue("--dot-i")).toBe(String(i));
    });
    // Stable array identity -> re-render must NOT rebuild (animation restart).
    const before = h.markers.length;
    rerender(<LandingMap ref={ref} keyframes={KF} amenityDots={DOTS} dotsVisible />);
    expect(h.markers).toHaveLength(before);
  });

  it("falls back to the static Crema street grid when construction throws", async () => {
    h.throwOnConstruct = true;
    render(<LandingMap keyframes={KF} />);
    const fb = await screen.findByTestId("landing-map-fallback");
    expect(fb.querySelector("svg")).not.toBeNull();
    expect(fb.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("landing-map-canvas")).not.toBeInTheDocument();
    expect(h.maps).toHaveLength(0);
  });

  it("falls back when a legacy supported() probe reports no WebGL", async () => {
    h.supportedImpl = () => false;
    render(<LandingMap keyframes={KF} />);
    await screen.findByTestId("landing-map-fallback");
    expect(h.maps).toHaveLength(0);
  });

  it("replays scroll progress that arrived before the map finished mounting", async () => {
    const ref = createRef<LandingMapHandle>();
    render(<LandingMap ref={ref} keyframes={KF} />);
    // Map import is async - drive the seam before the constructor has run.
    ref.current!.setSceneProgress("hero", "pin", 1);
    await waitFor(() => expect(h.maps).toHaveLength(1));
    await waitFor(() => expect(h.maps[0].jumpCalls.length).toBeGreaterThan(0));
    expect(h.maps[0].jumpCalls[0]).toEqual(lerpCamera(KF[0], KF[1], 1));
  });
});

describe("NEARBY_DOT_COLORS", () => {
  it("carries the six nearby-POI palette colours from lib/poi-categories", () => {
    expect(NEARBY_DOT_COLORS).toEqual([
      "#66A61E",
      "#E7298A",
      "#377EB8",
      "#E6AB02",
      "#1B9E77",
      "#D95F02",
    ]);
  });
});
