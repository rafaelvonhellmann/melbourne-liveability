// @vitest-environment jsdom
/**
 * Capital switcher (app wave, phase 2 - the UI over the region seam):
 *
 * 1. RegionSwitcher component - all eight capitals listed, lazy availability
 *    probe on first open (cached), unbaked regions disabled with the quiet
 *    "Coming soon" hint, onSwitch contract.
 * 2. Map page integration - the melbourne default renders the switcher
 *    showing Melbourne with zero drift in the existing top-bar selectors
 *    (snapshot), and a switch updates the URL param, fires the camera
 *    (focusTarget at the registry center/zoom) and reloads the dataset
 *    through the loadRegionPlaces seam. Outside melbourne the buyer pin
 *    panel shows the honest melbourne-only line and never fetches the
 *    melbourne-baked report tiles.
 * 3. MelbourneMap region prop - on switch the sa2 (and lazy poi) sources are
 *    re-pointed at the region's own artifacts via the dataPath seam (the
 *    choropleth repaints from the region geojson), the panning envelope is
 *    lifted for the flight and re-clamped on arrival, and the focusTarget
 *    fly-to honours the pinned zoom + reduced motion.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RegionSwitcher, regionCityName } from "../components/RegionSwitcher";
import REGIONS, { REGION_IDS, getRegion, type RegionId } from "../lib/regions";
import { __resetPlacesDataCachesForTests } from "../lib/places-data";

/* ------------------------------------------------------------------------ */
/* Hoisted state + mocks (page integration + real-map tests)                 */
/* ------------------------------------------------------------------------ */

const ph = vi.hoisted(() => ({
  replaceCalls: [] as string[],
  search: "",
  spCache: null as URLSearchParams | null,
  spCacheKey: null as string | null,
  mapProps: [] as Record<string, unknown>[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (url: string) => ph.replaceCalls.push(url),
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  // Stable instance per search string - the real Next hook returns a stable
  // reference between renders, and useMapPersonalisation depends on its
  // identity ([searchParams] effect). A fresh object per call loops forever.
  useSearchParams: () => {
    if (ph.spCache === null || ph.spCacheKey !== ph.search) {
      ph.spCache = new URLSearchParams(ph.search);
      ph.spCacheKey = ph.search;
    }
    return ph.spCache;
  },
  usePathname: () => "/",
}));

// The page renders the map through next/dynamic - mock the module so the page
// tests record the delivered props (region, focusTarget) without MapLibre.
vi.mock("@/components/MelbourneMap", () => ({
  MelbourneMap: (props: Record<string, unknown>) => {
    ph.mapProps.push(props);
    return <div data-testid="map-stub" />;
  },
}));

// maplibre-gl fake for the REAL MelbourneMap (vi.importActual below): records
// constructor options, sources (with setData), maxBounds and camera calls.
// flyTo fires "moveend" synchronously so the bounds re-clamp is observable.
const mh = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  class FakeGeoJSONSource {
    data: unknown;
    setDataCalls: unknown[] = [];
    constructor(data: unknown) {
      this.data = data;
    }
    setData(d: unknown) {
      this.setDataCalls.push(d);
    }
  }
  class FakeMap {
    options: Record<string, unknown>;
    handlers = new Map<string, Handler[]>();
    onceHandlers = new Map<string, Handler[]>();
    sources = new Map<string, FakeGeoJSONSource>();
    layers = new Map<string, unknown>();
    styleLoaded = false;
    maxBoundsCalls: unknown[] = [];
    flyCalls: Record<string, unknown>[] = [];
    fitBoundsCalls: unknown[][] = [];
    removed = false;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      maps.push(this);
    }
    addControl() {
      return this;
    }
    on(ev: string, a: unknown, b?: unknown) {
      const key = typeof a === "string" ? `${ev}:${a}` : ev;
      const fn = (typeof a === "string" ? b : a) as Handler;
      this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn]);
    }
    once(ev: string, fn: Handler) {
      this.onceHandlers.set(ev, [...(this.onceHandlers.get(ev) ?? []), fn]);
    }
    off(ev: string, fn: Handler) {
      this.handlers.set(ev, (this.handlers.get(ev) ?? []).filter((f) => f !== fn));
      this.onceHandlers.set(ev, (this.onceHandlers.get(ev) ?? []).filter((f) => f !== fn));
    }
    fire(ev: string) {
      const once = this.onceHandlers.get(ev) ?? [];
      this.onceHandlers.set(ev, []);
      for (const fn of [...(this.handlers.get(ev) ?? []), ...once]) fn();
    }
    /** Simulate the style finishing: sources/layers get added by the handler. */
    loadStyle() {
      this.styleLoaded = true;
      this.fire("load");
    }
    isStyleLoaded() {
      return this.styleLoaded;
    }
    addSource(id: string, def: { data?: unknown }) {
      this.sources.set(id, new FakeGeoJSONSource(def.data));
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    addLayer(def: { id: string }) {
      this.layers.set(def.id, def);
    }
    getLayer(id: string) {
      return this.layers.get(id);
    }
    setFilter() {}
    setPaintProperty() {}
    setLayoutProperty() {}
    setMaxBounds(b: unknown) {
      this.maxBoundsCalls.push(b);
    }
    fitBounds(...args: unknown[]) {
      this.fitBoundsCalls.push(args);
    }
    jumpTo() {}
    flyTo(opts: Record<string, unknown>) {
      this.flyCalls.push(opts);
      this.fire("moveend");
    }
    getZoom() {
      return 9;
    }
    getBounds() {
      return { contains: () => false };
    }
    getCanvas() {
      return { style: {} as CSSStyleDeclaration };
    }
    queryRenderedFeatures() {
      return [];
    }
    remove() {
      this.removed = true;
    }
  }
  class FakePopup {
    setLngLat() {
      return this;
    }
    setHTML() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      return this;
    }
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  class FakeNavigationControl {}
  const maps: InstanceType<typeof FakeMap>[] = [];
  return { maps, FakeMap, FakePopup, FakeMarker, FakeNavigationControl };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mh.FakeMap,
    Popup: mh.FakePopup,
    Marker: mh.FakeMarker,
    NavigationControl: mh.FakeNavigationControl,
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  ph.replaceCalls.length = 0;
  ph.mapProps.length = 0;
  ph.search = "";
  ph.spCache = null;
  ph.spCacheKey = null;
  mh.maps.length = 0;
  window.history.replaceState(null, "", "/");
});

/**
 * Deep-link state for a page render: the mocked useSearchParams (ph.search)
 * AND window.location must agree - the landing gate (shouldShowLanding) reads
 * window.location.search directly, before any hook state exists.
 */
function setPageUrl(search: string) {
  ph.search = search;
  window.history.replaceState(null, "", search ? `/?${search}` : "/");
}

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

/* ------------------------------------------------------------------------ */
/* 1. RegionSwitcher component                                               */
/* ------------------------------------------------------------------------ */

describe("RegionSwitcher", () => {
  function probeStub(verdicts: Partial<Record<RegionId, boolean>>) {
    return vi.fn(async (id: RegionId) => verdicts[id] ?? false);
  }

  it("shows the current capital on the trigger and probes nothing while closed", () => {
    const check = probeStub({});
    render(<RegionSwitcher region="melbourne" onSwitch={() => {}} checkAvailability={check} />);
    const trigger = screen.getByRole("button", { name: /switch capital city/i });
    expect(trigger).toHaveTextContent("Melbourne");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it("lists all eight capitals with their registry labels on open", () => {
    render(
      <RegionSwitcher region="melbourne" onSwitch={() => {}} checkAvailability={probeStub({})} />
    );
    fireEvent.click(screen.getByRole("button", { name: /switch capital city/i }));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(8);
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining(REGION_IDS.map((id) => expect.stringContaining(REGIONS[id].label)))
    );
    // The current region is marked selected.
    expect(
      screen.getByRole("option", { name: /Greater Melbourne/ })
    ).toHaveAttribute("aria-selected", "true");
  });

  it("probes availability lazily on first open, once per region, cached on re-open", async () => {
    const check = probeStub({ canberra: true });
    render(<RegionSwitcher region="melbourne" onSwitch={() => {}} checkAvailability={check} />);
    const trigger = screen.getByRole("button", { name: /switch capital city/i });
    fireEvent.click(trigger);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(REGION_IDS.length));
    fireEvent.click(trigger); // close
    fireEvent.click(trigger); // re-open - verdicts cached, no re-probe
    expect(check).toHaveBeenCalledTimes(REGION_IDS.length);
  });

  it("renders unbaked capitals disabled with the quiet baking hint; baked ones live", async () => {
    const check = probeStub({ melbourne: true, canberra: true });
    render(<RegionSwitcher region="melbourne" onSwitch={() => {}} checkAvailability={check} />);
    fireEvent.click(screen.getByRole("button", { name: /switch capital city/i }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Canberra/ })).toBeEnabled()
    );
    expect(screen.getByRole("option", { name: /Greater Sydney/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /Greater Melbourne/ })).toBeEnabled();
    // 6 unbaked capitals (everything except melbourne + canberra) carry the hint.
    expect(screen.getAllByText("Coming soon")).toHaveLength(6);
  });

  it("fires onSwitch with the picked region and closes; disabled picks do nothing", async () => {
    const onSwitch = vi.fn();
    render(
      <RegionSwitcher
        region="melbourne"
        onSwitch={onSwitch}
        checkAvailability={probeStub({ canberra: true })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /switch capital city/i }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Canberra/ })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("option", { name: /Greater Sydney/ })); // disabled
    expect(onSwitch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /Canberra/ }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith("canberra");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("re-picking the current region closes without firing onSwitch", () => {
    const onSwitch = vi.fn();
    render(
      <RegionSwitcher region="melbourne" onSwitch={onSwitch} checkAvailability={probeStub({})} />
    );
    fireEvent.click(screen.getByRole("button", { name: /switch capital city/i }));
    fireEvent.click(screen.getByRole("option", { name: /Greater Melbourne/ }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the open list", () => {
    render(
      <RegionSwitcher region="melbourne" onSwitch={() => {}} checkAvailability={probeStub({})} />
    );
    fireEvent.click(screen.getByRole("button", { name: /switch capital city/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("regionCityName strips the Greater prefix and the ACT suffix", () => {
    expect(regionCityName("melbourne")).toBe("Melbourne");
    expect(regionCityName("sydney")).toBe("Sydney");
    expect(regionCityName("canberra")).toBe("Canberra");
    expect(regionCityName("darwin")).toBe("Darwin");
  });
});

/* ------------------------------------------------------------------------ */
/* 2. Map page integration                                                   */
/* ------------------------------------------------------------------------ */

const MEL_PLACES = {
  generatedAt: "2026-06-12T00:00:00Z",
  places: [
    {
      slug: "carlton-201011001",
      name: "Carlton",
      sa2Code: "201011001",
      centroid: [144.967, -37.8],
      suburbAliases: [],
      lga: "Melbourne",
      nonResidential: false,
    },
    {
      slug: "fitzroy-201011002",
      name: "Fitzroy",
      sa2Code: "201011002",
      centroid: [144.978, -37.798],
      suburbAliases: [],
      lga: "Yarra",
      nonResidential: false,
    },
  ],
};
const CBR_PLACES = {
  generatedAt: "2026-06-12T00:00:00Z",
  places: [
    {
      slug: "city-801051049",
      name: "City",
      sa2Code: "801051049",
      centroid: [149.13, -35.28],
      suburbAliases: [],
      lga: "Unincorporated ACT",
      nonResidential: false,
    },
  ],
};

function stubPageFetch() {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      const ok = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith("/data/places.json")) return ok(MEL_PLACES);
      if (url.endsWith("/data/places.canberra.json")) return ok(CBR_PLACES);
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    })
  );
  return calls;
}

describe("map page region switching", () => {
  let MapPage: () => React.JSX.Element;

  beforeAll(async () => {
    ({ default: MapPage } = await import("../app/(map)/page"));
  });

  beforeEach(() => {
    // Seen-flag seed (e2e parity): the landing now greets every PLAIN visit
    // regardless of this flag; it only keeps the lens-picker modal from
    // opening on the deep-link renders below.
    localStorage.setItem("mlv-onboarded-v1", "1");
    // Drop the lib/places-data session caches so each test's fetch stub fully
    // controls the verdicts (the module is a singleton across this suite).
    __resetPlacesDataCachesForTests();
  });

  /** Plain "/" lands on the landing every visit - enter via the explore CTA. */
  async function dismissLanding() {
    fireEvent.click(await screen.findByRole("button", { name: "Explore the map" }));
  }

  async function renderPage() {
    const calls = stubPageFetch();
    const utils = render(<MapPage />);
    await dismissLanding();
    await screen.findByTestId("map-stub");
    // Initial melbourne dataset resolved (the seam may serve it from the
    // session cache on later renders - the map shell is the reliable signal).
    await waitFor(() => expect(screen.getByText(/Check a location/)).toBeInTheDocument());
    return { ...utils, calls };
  }

  function topBar() {
    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    return within(header as HTMLElement);
  }

  it("melbourne default: switcher shows Melbourne, zero top-bar drift, no region URL writes", async () => {
    await renderPage();
    const bar = topBar();
    // The new region control, closed, showing the default capital.
    const trigger = bar.getByRole("button", { name: /switch capital city/i });
    expect(trigger).toHaveTextContent("Melbourne");
    // Snapshot the top-bar region control area (melbourne default) - any text,
    // role or class drift here must be a conscious decision.
    expect(bar.getByTestId("region-switcher")).toMatchInlineSnapshot(`
      <div
        class="relative hidden shrink-0 sm:block"
        data-testid="region-switcher"
      >
        <button
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-label="Switch capital city - current: Greater Melbourne"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent md:min-h-0"
          type="button"
        >
          Melbourne
          <svg
            aria-hidden="true"
            class="lucide lucide-chevron-down h-3.5 w-3.5 text-ink-muted transition-transform"
            fill="none"
            height="24"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="m6 9 6 6 6-6"
            />
          </svg>
        </button>
      </div>
    `);
    // Existing top-bar selectors, byte-for-byte.
    expect(bar.getByRole("link", { name: /Festra/i })).toHaveAttribute("href", "/");
    for (const label of [
      "Buyer check",
      "Compare",
      "Profile",
      "Alerts",
      "Methodology",
      "Disclaimer",
    ]) {
      expect(bar.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(bar.getByRole("button", { name: /feedback/i })).toBeInTheDocument();
    // No region marker and no region param leaks into URL writes by default.
    expect(document.querySelector("main")).not.toHaveAttribute("data-region");
    expect(ph.replaceCalls.some((u) => u.includes("region="))).toBe(false);
    // The map mounted on the default region.
    expect(ph.mapProps.at(-1)?.region).toBe("melbourne");
  });

  it("switching to a baked capital updates the URL, fires the camera and reloads the dataset through the seam; buyer pin panel gates honestly", async () => {
    const { calls } = await renderPage();
    const bar = topBar();
    fireEvent.click(bar.getByRole("button", { name: /switch capital city/i }));
    // Lazy availability probe: canberra HEAD verdict enables its entry.
    const option = await waitFor(() => {
      const o = bar.getByRole("option", { name: /Canberra/ });
      expect(o).toBeEnabled();
      return o;
    });
    expect(
      calls.some((c) => c.method === "HEAD" && c.url === "/data/places.canberra.json")
    ).toBe(true);
    fireEvent.click(option);

    // URL param written (melbourne never carries it; canberra does). The
    // write goes through buildMapUrl like every other URL sync, so the
    // current personalisation state (weights) rides along - only the region
    // param itself is under test here.
    expect(ph.replaceCalls.at(-1)).toMatch(/^\/\?region=canberra(&|$)/);
    // Dataset reload through the seam (loadRegionPlaces -> dataPath).
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "GET" && c.url === "/data/places.canberra.json")
      ).toBe(true)
    );
    // Camera: the existing focusTarget fly-to seam at the registry framing.
    await waitFor(() => {
      const props = ph.mapProps.at(-1) as {
        region?: string;
        focusTarget?: { center: [number, number]; zoom?: number };
      };
      expect(props.region).toBe("canberra");
      expect(props.focusTarget?.center).toEqual(getRegion("canberra").mapCenter);
      expect(props.focusTarget?.zoom).toBe(getRegion("canberra").zoom);
    });
    // The page marks the non-default region (seam contract from phase 1).
    expect(document.querySelector("main")).toHaveAttribute("data-region", "canberra");
    // The trigger now shows the new capital.
    expect(
      bar.getByRole("button", { name: /switch capital city/i })
    ).toHaveTextContent("Canberra");

    // Honest buyer gating outside melbourne: the pin report depends on
    // melbourne-baked tiles, so the panel says so - no broken empty sections,
    // and no melbourne report-tile fetches are ever fired.
    fireEvent.click(screen.getByRole("button", { name: "Check a location" }));
    expect(
      screen.getAllByText(
        "Full pin reports are Melbourne-only today - your capital is coming."
      ).length
    ).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("report-tiles"))).toBe(false);
  });

  it("personalisation URL writes and the copied share link keep the region after a switch", async () => {
    const clipboardWrites: string[] = [];
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: async (t: string) => {
          clipboardWrites.push(t);
        },
      },
      configurable: true,
    });
    try {
      await renderPage();
      const bar = topBar();
      fireEvent.click(bar.getByRole("button", { name: /switch capital city/i }));
      const option = await waitFor(() => {
        const o = bar.getByRole("option", { name: /Canberra/ });
        expect(o).toBeEnabled();
        return o;
      });
      fireEvent.click(option);
      await waitFor(() =>
        expect(document.querySelector("main")).toHaveAttribute("data-region", "canberra")
      );
      // A lens pick rewrites the URL through the personalisation hook - the
      // region must ride along (otherwise the next reload lands on melbourne).
      fireEvent.click(screen.getAllByRole("button", { name: "Family" })[0]);
      expect(ph.replaceCalls.at(-1)).toMatch(/[?&]region=canberra(&|$)/);
      // The copied map link carries it too (getShareUrl seam).
      fireEvent.click(screen.getAllByRole("button", { name: "Copy map link" })[0]);
      await waitFor(() => expect(clipboardWrites).toHaveLength(1));
      expect(clipboardWrites[0]).toContain("region=canberra");
    } finally {
      Reflect.deleteProperty(window.navigator, "clipboard");
    }
  });

  it("an unbaked ?region= link degrades to the melbourne map WITH visible copy", async () => {
    // ?region= is deep-link state: it skips the landing straight to the map.
    setPageUrl("region=sydney");
    stubPageFetch(); // sydney places artifact 404s (probe miss)
    render(<MapPage />);
    await screen.findByTestId("map-stub");
    expect(await screen.findByTestId("region-fallback-note")).toHaveTextContent(
      "Greater Sydney is not available yet. Showing Greater Melbourne instead."
    );
    const main = document.querySelector("main");
    expect(main).not.toHaveAttribute("data-region");
    expect(main).toHaveAttribute("data-region-fallback", "sydney");
    expect(ph.mapProps.at(-1)?.region).toBe("melbourne");
  });

  it("a buyer pin on a fell-back link never aims the camera outside the shown region", async () => {
    // A sydney pin is valid for the URL's own region, but sydney is not baked:
    // the app serves melbourne - the pin must not jump the camera against the
    // melbourne maxBounds (envelope edge at zoom 14.5) or restore a report.
    setPageUrl("region=sydney&buyer=1&lat=-33.8688&lng=151.2093");
    stubPageFetch();
    render(<MapPage />);
    await screen.findByTestId("map-stub");
    await screen.findByTestId("region-fallback-note");
    await waitFor(() => {
      const props = ph.mapProps.at(-1) as {
        region?: string;
        initialBuyerPin?: unknown;
      };
      expect(props.region).toBe("melbourne");
      expect(props.initialBuyerPin).toBeNull();
    });
    // Buyer mode itself restores - with the empty "drop a pin" state, not a
    // stale out-of-region report.
    await waitFor(() =>
      expect(screen.getAllByText(/Click the map/).length).toBeGreaterThan(0)
    );
  });

  it("an artifact that 404s mid-session reverts the whole app to melbourne with copy", async () => {
    // HEAD says hobart is baked (the switcher enables it) but the GET 404s -
    // e.g. the artifact vanished between probe and fetch. The app must never
    // sit on a 404'd sa2 source with another capital's framing.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const ok = (body: unknown) =>
          ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
        if (method === "HEAD") return ok(null);
        if (url.endsWith("/data/places.json")) return ok(MEL_PLACES);
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      })
    );
    render(<MapPage />);
    await dismissLanding();
    await screen.findByTestId("map-stub");
    const bar = topBar();
    fireEvent.click(bar.getByRole("button", { name: /switch capital city/i }));
    const option = await waitFor(() => {
      const o = bar.getByRole("option", { name: /Greater Hobart/ });
      expect(o).toBeEnabled();
      return o;
    });
    fireEvent.click(option);
    expect(await screen.findByTestId("region-fallback-note")).toHaveTextContent(
      "Greater Hobart is not available yet."
    );
    const main = document.querySelector("main");
    expect(main).not.toHaveAttribute("data-region");
    expect(main).toHaveAttribute("data-region-fallback", "hobart");
    await waitFor(() => {
      const props = ph.mapProps.at(-1) as {
        region?: string;
        focusTarget?: { center: [number, number]; zoom?: number };
      };
      expect(props.region).toBe("melbourne");
      expect(props.focusTarget?.center).toEqual(getRegion("melbourne").mapCenter);
    });
    // The switcher trigger is back on the capital actually shown.
    expect(
      bar.getByRole("button", { name: /switch capital city/i })
    ).toHaveTextContent("Melbourne");
  });
});

/* ------------------------------------------------------------------------ */
/* 3. Real MelbourneMap: per-region sources, bounds + pinned-zoom fly-to     */
/* ------------------------------------------------------------------------ */

describe("MelbourneMap region wiring (real component, fake maplibre)", () => {
  let RealMap: typeof import("../components/MelbourneMap").MelbourneMap;

  beforeAll(async () => {
    ({ MelbourneMap: RealMap } = await vi.importActual<
      typeof import("../components/MelbourneMap")
    >("@/components/MelbourneMap"));
  });

  function mountMap(region: RegionId = "melbourne") {
    const utils = render(<RealMap activeDomain="affordability" region={region} />);
    expect(mh.maps).toHaveLength(1);
    const map = mh.maps[0];
    act(() => map.loadStyle());
    return { ...utils, map };
  }

  it("initialises camera + sa2 source from the registry (melbourne = historical values)", () => {
    const { map } = mountMap();
    expect(map.options.center).toEqual([144.9631, -37.8136]);
    expect(map.options.zoom).toBe(9);
    expect(map.options.maxBounds).toEqual(getRegion("melbourne").maxBounds);
    expect(map.fitBoundsCalls[0]?.[0]).toEqual([
      [144.45, -38.35],
      [145.65, -37.45],
    ]);
    expect(map.sources.get("sa2")?.data).toBe("/data/places.geojson");
  });

  it("a non-default mount points the sa2 source at the region artifact", () => {
    const { map } = mountMap("canberra");
    expect(map.options.center).toEqual(getRegion("canberra").mapCenter);
    expect(map.sources.get("sa2")?.data).toBe("/data/places.canberra.geojson");
  });

  it("region switch swaps the sa2 + lazy poi sources, lifts the bounds for the flight and re-clamps at the new envelope; fly-to lands at the pinned zoom", () => {
    const { map, rerender } = mountMap();
    // Simulate an earlier lazy POI enable so the poi source exists too.
    map.addSource("pois", { data: "/data/pois.geojson" });

    rerender(
      <RealMap
        activeDomain="affordability"
        region="canberra"
        focusTarget={{
          center: getRegion("canberra").mapCenter,
          zoom: getRegion("canberra").zoom,
          nonce: 1,
        }}
      />
    );

    // Choropleth repaints from the region geojson via the dataPath seam.
    expect(map.sources.get("sa2")?.setDataCalls).toEqual([
      "/data/places.canberra.geojson",
    ]);
    expect(map.sources.get("pois")?.setDataCalls).toEqual([
      "/data/pois.canberra.geojson",
    ]);
    // Bounds: lifted (null) before the flight, re-clamped on moveend (the
    // fake fires it synchronously from flyTo) to the new region's envelope.
    expect(map.maxBoundsCalls).toEqual([null, getRegion("canberra").maxBounds]);
    // The fly-to uses the pinned registry zoom, not max(current, 12).
    expect(map.flyCalls).toHaveLength(1);
    expect(map.flyCalls[0]).toMatchObject({
      center: getRegion("canberra").mapCenter,
      zoom: 10,
      essential: true,
    });
    expect(map.flyCalls[0].duration).toBe(900);
  });

  it("region switch fly-to is reduced-motion aware (duration 0)", () => {
    stubReducedMotion(true);
    const { map, rerender } = mountMap();
    rerender(
      <RealMap
        activeDomain="affordability"
        region="canberra"
        focusTarget={{
          center: getRegion("canberra").mapCenter,
          zoom: getRegion("canberra").zoom,
          nonce: 1,
        }}
      />
    );
    expect(map.flyCalls[0]?.duration).toBe(0);
  });

  it("search fly-to without a pinned zoom keeps the historical max(current, 12)", () => {
    const { map, rerender } = mountMap();
    rerender(
      <RealMap
        activeDomain="affordability"
        region="melbourne"
        focusTarget={{ center: [144.978, -37.798], nonce: 2 }}
      />
    );
    expect(map.flyCalls[0]).toMatchObject({ center: [144.978, -37.798], zoom: 12 });
    // No region change - the panning envelope was never touched.
    expect(map.maxBoundsCalls).toEqual([]);
  });
});
