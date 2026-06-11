// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  Landing,
  shouldShowLanding,
  sceneLocalT,
  ONBOARDED_KEY,
  PROFILE_CHOICE_KEY,
} from "../components/Landing";
import { geocodeAddress } from "../lib/geocode";
import type { SearchIndexEntry } from "../lib/search";

/**
 * First-visit landing experience: gate decision (shouldShowLanding), the hero
 * search wired to the buyer-pin seams, the five map-backed scroll scenes, and
 * the profile-choice close band. Every dismissal path must set the SAME
 * onboarding flag the OnboardingModal uses, so the modal never fires after
 * the landing.
 */

vi.mock("../lib/geocode", () => ({
  NOMINATIM_ATTRIBUTION:
    "Address search (c) OpenStreetMap contributors, via Nominatim",
  geocodeAddress: vi.fn(async () => [
    {
      lat: -37.802,
      lng: 144.996,
      label: "12 Smith Street, Abbotsford VIC 3067",
      shortLabel: "12 Smith St, Abbotsford",
    },
  ]),
}));

// The map rig dynamically imports maplibre-gl; its own behaviour is covered in
// tests/landing-map.test.tsx. Here a minimal fake keeps jsdom happy so the
// Landing mounts the REAL rig wiring (keyframes, pin seams) without WebGL.
vi.mock("maplibre-gl", () => {
  class FakeMap {
    constructor(public options: Record<string, unknown>) {}
    jumpTo() {}
    remove() {}
    on() {}
    once() {}
    off() {}
  }
  class FakeMarker {
    element: HTMLElement;
    constructor(opts?: { element?: HTMLElement }) {
      this.element = opts?.element ?? document.createElement("div");
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return { default: { Map: FakeMap, Marker: FakeMarker } };
});

const entry = (label: string, over: Partial<SearchIndexEntry> = {}): SearchIndexEntry => ({
  key: label.toLowerCase(),
  sa2Code: "206011106",
  slug: label.toLowerCase().replace(/\s+/g, "-"),
  label,
  suburb: label,
  kind: "area",
  areaName: label,
  normalized: label.toLowerCase(),
  ...over,
});

const INDEX = [entry("Carlton"), entry("Brunswick East"), entry("Carnegie")];

async function renderLanding(over: Partial<React.ComponentProps<typeof Landing>> = {}) {
  const props = {
    searchIndex: INDEX,
    onGeocode: vi.fn(),
    onAreaSelect: vi.fn(),
    onDismiss: vi.fn(),
    onProfileChoice: vi.fn(),
    ...over,
  };
  const utils = render(<Landing {...props} />);
  // Flush the rig's async maplibre mount inside act (mocked, resolves fast).
  await act(async () => {});
  return { ...utils, props };
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

beforeEach(() => {
  localStorage.clear();
  // Deterministic, synchronous rAF: the rig coalesces camera jumps per frame.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(geocodeAddress).mockClear();
});

describe("shouldShowLanding (first-visit gate)", () => {
  it("shows for a fresh visitor with no URL state", () => {
    expect(shouldShowLanding("")).toBe(true);
  });

  it("hides once the onboarded flag is set (e2e seeds this exact key)", () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    expect(shouldShowLanding("")).toBe(false);
  });

  it("hides for share-URL visitors and never marks them onboarded", () => {
    expect(shouldShowLanding("?buyer=1&lat=-37.8136&lng=144.9631")).toBe(false);
    expect(shouldShowLanding("?select=brunswick-east-206011106")).toBe(false);
    expect(shouldShowLanding("?view=family")).toBe(false);
    expect(shouldShowLanding("?list=toorak-206061138")).toBe(false);
    // Share visitors go straight to the map exactly as today - flag untouched.
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeNull();
  });

  it("skips pre-flag returning users with saved prefs and marks them seen (modal parity)", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ interestView: "family", shortlist: [] })
    );
    expect(shouldShowLanding("")).toBe(false);
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });
});

describe("sceneLocalT (camera continuity math)", () => {
  it("maps a section's active window (midline inside) onto 0..1", () => {
    // 150vh section: midline enters at t=0.2 and leaves at t=0.8.
    expect(sceneLocalT(0.2, 150)).toBe(0);
    expect(sceneLocalT(0.5, 150)).toBeCloseTo(0.5, 10);
    expect(sceneLocalT(0.8, 150)).toBe(1);
  });

  it("clamps outside the active window (handoffs never overshoot)", () => {
    expect(sceneLocalT(0, 120)).toBe(0);
    expect(sceneLocalT(1, 120)).toBe(1);
  });
});

describe("Landing hero (scene 1)", () => {
  it("renders the wordmark h1, the big search with the exact owner copy, and the quiet hatches", async () => {
    await renderLanding();
    expect(
      screen.getByRole("heading", { level: 1, name: "Festra" })
    ).toBeInTheDocument();
    // Owner copy, EXACT - the headline lives in the search placeholder.
    expect(
      screen.getByPlaceholderText("A window onto your new home")
    ).toBeInTheDocument();
    expect(screen.getByText("or scroll to see how it works")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explore the map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // The live map rig is mounted behind the scenes.
    expect(screen.getByTestId("landing-map")).toBeInTheDocument();
  });

  it("address search pick sets the flag, fires the pin seam and dismisses", async () => {
    const { container, props } = await renderLanding();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "12 smith st, abbotsford" } });
    // Submit-only geocode policy is inherited from SearchBox.
    expect(geocodeAddress).not.toHaveBeenCalled();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const result = await screen.findByRole("option", {
      name: /12 Smith St, Abbotsford/,
    });
    fireEvent.click(result);

    expect(props.onGeocode).toHaveBeenCalledWith(
      expect.objectContaining({ shortLabel: "12 Smith St, Abbotsford" })
    );
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onAreaSelect).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it("suburb / data-area pick sets the flag, fires the area seam and dismisses", async () => {
    const { props } = await renderLanding();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "carlton" } });
    fireEvent.click(screen.getAllByRole("option")[0]);

    expect(props.onAreaSelect).toHaveBeenCalledWith("carlton");
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onGeocode).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it('"Explore the map" sets the flag and dismisses without a pin', async () => {
    const { props } = await renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Explore the map" }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onGeocode).not.toHaveBeenCalled();
    expect(props.onAreaSelect).not.toHaveBeenCalled();
    expect(props.onProfileChoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it('"Sign in" smooth-scrolls to the close band without dismissing or flagging', async () => {
    const { props } = await renderLanding();
    const band = document.getElementById("get-started") as HTMLElement;
    expect(band).not.toBeNull();
    expect(within(band).getByText("Set up your window")).toBeInTheDocument();
    const spy = vi.fn();
    band.scrollIntoView = spy;
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "smooth", block: "start" });
    expect(props.onDismiss).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeNull();
  });

  it('"Sign in" snaps (behavior: auto) under prefers-reduced-motion', async () => {
    stubReducedMotion(true);
    await renderLanding();
    const band = document.getElementById("get-started") as HTMLElement;
    const spy = vi.fn();
    band.scrollIntoView = spy;
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "auto" });
  });
});

describe("Landing keyboard dismissal (a11y - no scrolling required)", () => {
  it("Escape sets the flag and dismisses like every other path", async () => {
    const { props } = await renderLanding();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onGeocode).not.toHaveBeenCalled();
    expect(props.onProfileChoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it("Escape inside the search yields to the combobox (popup close, field clear)", async () => {
    const { props } = await renderLanding();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "carlton" } });
    // Popup open: SearchBox consumes the event (preventDefault) to close it.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onDismiss).not.toHaveBeenCalled();
    // Popup closed, text still present: the native search-clear gets this one.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onDismiss).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeNull();
  });
});

describe("Landing scroll scenes", () => {
  it("renders all five scene headings", async () => {
    await renderLanding();
    expect(
      screen.getByRole("heading", { level: 1, name: "Festra" })
    ).toBeInTheDocument();
    for (const name of [
      "Drop a pin anywhere in Australia",
      "Read the area in one glance",
      "Go deep when you are serious",
      "Compare before you commit",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("every scene section carries the scroll-scrub contract (.landing-scene + --scene-t)", async () => {
    await renderLanding();
    for (let i = 1; i <= 5; i++) {
      const section = screen.getByTestId(`landing-scene-${i}`);
      // The class the reduced-motion CSS override targets, and the custom
      // property the scrubbed opacity/transform ramps derive from.
      expect(section.className).toContain("landing-scene");
      expect(section.style.getPropertyValue("--scene-t")).not.toBe("");
      // Scenes must never swallow the scroll or the basemap attribution.
      expect(section.className).toContain("pointer-events-none");
    }
  });

  it("scene 2 carries the honest coverage line", async () => {
    await renderLanding();
    expect(
      screen.getByText("Greater Melbourne today, every capital at launch.")
    ).toBeInTheDocument();
  });

  it("scene 3 glimpse replicates the panel: suburb heading, amenity distances, planning + noise lines", async () => {
    await renderLanding();
    // The suburb heading appears in BOTH the glimpse panel and the report
    // sheet (the owner wants the area name leading each) - assert both exist.
    expect(
      screen.getAllByRole("heading", { level: 3, name: "Brunswick East" }).length
    ).toBeGreaterThanOrEqual(2);
    // REAL POIs from the baked tile (report-tiles/pois/14/14790/10050.json).
    expect(screen.getByText("Fleming Park")).toBeInTheDocument();
    expect(screen.getByText("62 m")).toBeInTheDocument();
    expect(screen.getByText("Joan Specialty Coffee")).toBeInTheDocument();
    expect(screen.getByText("East Brunswick Medical Centre")).toBeInTheDocument();
    expect(screen.getByText("Heritage rules apply here")).toBeInTheDocument();
    expect(screen.getByText("Tram corridor within 200 m")).toBeInTheDocument();
  });

  it("scene 4 area report glance: real percentile ranks, walk-access counts, source note", async () => {
    await renderLanding();
    // The eyebrow names the surface; the area name is the heading.
    expect(screen.getByText("Area report - free for every suburb")).toBeInTheDocument();
    // Real percentiles from places.json (brunswick-east-206011106).
    expect(
      screen.getByText("How it ranks across Greater Melbourne")
    ).toBeInTheDocument();
    // Appears in BOTH the rank bars and the compare table - assert both.
    expect(screen.getAllByText("Affordability").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("92").length).toBeGreaterThanOrEqual(1);
    // Real walk-access counts within 1.2 km.
    expect(screen.getByText("Within a 1.2 km walk")).toBeInTheDocument();
    expect(screen.getByText("Cafes and restaurants")).toBeInTheDocument();
    expect(screen.getAllByText("67").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Schools in the area")).toBeInTheDocument();
    expect(screen.getByText(/src: ABS ERP 2023/)).toBeInTheDocument();
  });

  it("scene 5 compare table: real ranks vs the Greater Melbourne baseline, education honestly to Preston East", async () => {
    await renderLanding();
    const table = screen.getByRole("table");
    for (const name of ["Brunswick East", "Preston East", "Greater Melbourne"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    }
    for (const name of ["Affordability", "Health access", "Transport", "Education"]) {
      expect(within(table).getByRole("rowheader", { name })).toBeInTheDocument();
    }
    // Preston East wins education (82 vs 57) - the table must not flatter;
    // 82 appears twice in the table (BE transport + PE education).
    expect(within(table).getAllByText("82").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Landing close band (three doors)", () => {
  it("renders all three cards under the deep-accent heading, with the honest lines", async () => {
    await renderLanding();
    const band = document.getElementById("get-started") as HTMLElement;
    expect(band).not.toBeNull();
    expect(
      within(band).getByRole("heading", { level: 2, name: "Set up your window" })
    ).toBeInTheDocument();
    // Free card.
    expect(
      within(band).getByRole("heading", { level: 3, name: "Explore free" })
    ).toBeInTheDocument();
    expect(within(band).getByText("No account needed.")).toBeInTheDocument();
    // Paid report card - priced, honestly marked as not-yet-purchasable.
    expect(
      within(band).getByRole("heading", { level: 3, name: "Buyer Report Snapshot - $39" })
    ).toBeInTheDocument();
    expect(within(band).getByText("Available at launch.")).toBeInTheDocument();
    // Profile card - the device-local honesty line, verbatim.
    expect(
      within(band).getByRole("heading", { level: 3, name: "Save your search" })
    ).toBeInTheDocument();
    expect(
      within(band).getByText(
        "Profiles live on this device for now - accounts are coming."
      )
    ).toBeInTheDocument();
  });

  it('"Open the map" sets the flag and dismisses without a pin or profile', async () => {
    const { props } = await renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Open the map" }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onGeocode).not.toHaveBeenCalled();
    expect(props.onAreaSelect).not.toHaveBeenCalled();
    expect(props.onProfileChoice).not.toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it("the report CTA links to the sample report (no payment wiring exists yet)", async () => {
    await renderLanding();
    const link = screen.getByRole("link", { name: "See a sample report" });
    expect(link).toHaveAttribute("href", "/buyer/sample-report");
  });

  it('"I am buying a home" stores the choice, fires onProfileChoice("buyer") and dismisses', async () => {
    const { props } = await renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /I am buying a home/ }));
    expect(props.onProfileChoice).toHaveBeenCalledWith("buyer");
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PROFILE_CHOICE_KEY)).toBe("buyer");
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it('"I work with buyers" stores the choice, fires onProfileChoice("agent") and dismisses', async () => {
    const { props } = await renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /I work with buyers/ }));
    expect(props.onProfileChoice).toHaveBeenCalledWith("agent");
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PROFILE_CHOICE_KEY)).toBe("agent");
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });

  it('"Skip for now" fires onProfileChoice(null), stores no choice and dismisses', async () => {
    const { props } = await renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(props.onProfileChoice).toHaveBeenCalledWith(null);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PROFILE_CHOICE_KEY)).toBeNull();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
  });
});

describe("Landing footer", () => {
  it("mounts SiteFooter with the legal, privacy and licence links", async () => {
    await renderLanding();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(within(footer).getByRole("link", { name: "Disclaimer" })).toHaveAttribute(
      "href",
      "/disclaimer"
    );
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(
      within(footer).getByRole("link", { name: "Data licences & attribution" })
    ).toHaveAttribute("href", "/methodology#attribution");
    // The general-information line (the footer-sized echo of BUYER_DISCLAIMER).
    expect(
      within(footer).getByText("not relocation, financial, or legal advice")
    ).toBeInTheDocument();
  });

  it("carries the contact and feedback mailtos", async () => {
    await renderLanding();
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: "hello@festra.au" })
    ).toHaveAttribute("href", "mailto:hello@festra.au");
    expect(
      within(footer).getByRole("link", { name: "Send feedback" })
    ).toHaveAttribute("href", "mailto:hello@festra.au?subject=Festra%20feedback");
  });
});
