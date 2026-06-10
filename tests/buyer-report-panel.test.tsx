// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BuyerReportPanel } from "../components/buyer/BuyerReportPanel";
import type { BuyerReport, BuyerFinding } from "../lib/buyer-report";
import type { Place } from "../lib/types";

/**
 * Section-gating tests for the buyer report panel: which sections the LIVE
 * (compact map hint) variant hides vs the SAMPLE / EMBEDDED (full report)
 * variants. Deterministic: fetch is stubbed so the auto-fetch context cards
 * (urban heat etc.) resolve to "no coverage" and omit themselves.
 */

const finding = (over: Partial<BuyerFinding> & { id: string }): BuyerFinding => ({
  kind: "verify",
  severity: "medium",
  title: "untitled",
  summary: "summary",
  confidence: "high",
  geography: "sa2",
  ...over,
});

const CHECK = finding({
  id: "flood-check",
  title: "Flood overlay covers part of this area",
  verifyAction: "Ask council for a property-specific planning certificate.",
  sourceRefs: [
    {
      id: "vic-planning-flood",
      label: "Vicplan - LSIO overlay",
      // period "current" is a liveness claim, not a vintage -> falls through
      // to the fetch date for the inline "as at" (P1-2).
      period: "current",
      fetchedAt: "2026-05-29",
    },
  ],
});
const CONCERN = finding({
  id: "traffic",
  kind: "red_flag",
  tone: "concern",
  severity: "high",
  title: "Very busy road within 200 m",
});
const POSITIVE = finding({
  id: "station",
  kind: "positive",
  severity: "info",
  title: "Train station within a 10-minute walk",
});
const NEUTRAL = finding({
  id: "data-note",
  kind: "neutral",
  severity: "info",
  title: "Data confidence is medium here",
});

function makeReport(over: Partial<BuyerReport> = {}): BuyerReport {
  return {
    id: "r1",
    generatedAt: "2026-06-10T00:00:00.000Z",
    mode: "pin",
    accessMode: "straight",
    location: {
      lat: -37.8136,
      lng: 144.9631,
      sa2Code: "206011106",
      sa2Name: "Testville",
      lgaName: "Test City",
    },
    summary: {
      headline: "A solid all-round location.",
      subheadline: "Two checks before you offer.",
      confidence: "medium",
    },
    findings: [CHECK, CONCERN, POSITIVE, NEUTRAL],
    priorityChecks: [CHECK],
    nearbyAmenities: [
      {
        id: "a1",
        name: "Test Supermarket",
        category: "supermarket",
        lat: -37.8137,
        lng: 144.9632,
        distanceMeters: 250,
      },
    ],
    amenityCountsByCategory: { supermarket: 1 },
    sourceRefs: [
      {
        id: "osm-amenities",
        label: "OpenStreetMap - amenities",
        url: "https://www.openstreetmap.org/",
        fetchedAt: "2026-06-01",
        licence: "ODbL",
      },
    ],
    disclaimers: ["Information only - not advice."],
    ...over,
  };
}

const PLACE: Place = {
  sa2Code: "206011106",
  slug: "testville-206011106",
  name: "Testville",
  lga: "Test City",
  suburbAliases: [],
  centroid: [144.96, -37.81],
  domains: {
    affordability: { domain: "affordability", scored: true, percentile: 60, subIndicators: {} },
    transport: { domain: "transport", scored: true, percentile: 80, subIndicators: {} },
  },
  context: {
    community: {
      renterPct: 41.2,
      apartmentPct: 22.5,
      firstNationsPct: 0.5,
      sourceId: "abs-census",
      period: "2021",
    },
    equity: { irsadDecile: 7, irsdDecile: 6, sourceId: "abs-seifa", period: "2021" },
  },
};

beforeEach(() => {
  // Auto-fetch cards (urban heat / canopy / noise / waterway / beach) all treat
  // a non-ok response as "no coverage" -> they omit themselves. No network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BuyerReportPanel - sample (full) variant", () => {
  // Cold mount of the full panel (first jsdom render in the file) can exceed
  // the 5s default on slower machines - logic is covered, timeout is env cost.
  it("renders the full-report chrome the live panel hides", { timeout: 20000 }, () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="sample" />);

    // Not-advice banner + sample marker
    expect(screen.getByText(/Information only - verify before buying/)).toBeInTheDocument();
    expect(screen.getByText(/Sample report - not a report for a specific property/)).toBeInTheDocument();
    // Header confidence badge
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    // Full-only sections
    expect(screen.getByRole("heading", { name: "Area liveability snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community & census context" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources and confidence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data notes" })).toBeInTheDocument();
    // Finding detail: verify-action (priority TL;DR + finding card) + provenance
    expect(
      screen.getAllByText(/Ask council for a property-specific planning certificate/).length
    ).toBe(2);
    expect(screen.getAllByText(/Confidence: high/).length).toBeGreaterThan(0);
    // Source row formats the manifest date + licence
    expect(screen.getByText(/updated 2026-06-01/)).toBeInTheDocument();
    // P1-2: the per-finding provenance line carries the dataset vintage inline
    expect(screen.getAllByText(/as at 2026-05-29/).length).toBeGreaterThan(0);
  });

  it("groups findings into weigh-up / verify / positive sections with counts", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="sample" />);
    expect(screen.getByRole("heading", { name: "What to weigh up" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Things to verify" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What looks positive" })).toBeInTheDocument();
    expect(screen.getByText("Very busy road within 200 m")).toBeInTheDocument();
    expect(screen.getByText("Train station within a 10-minute walk")).toBeInTheDocument();
    // Priority TL;DR lists the top check
    expect(
      screen.getByRole("heading", { name: "Before you offer, check these first" })
    ).toBeInTheDocument();
  });

  it("always offers print / save as PDF", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="sample" />);
    expect(screen.getByRole("button", { name: /Print \/ save as PDF/ })).toBeInTheDocument();
  });
});

describe("BuyerReportPanel - live (compact) variant", () => {
  it("hides the full-report sections and finding detail", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="live" />);

    expect(screen.queryByText(/Information only - verify before buying/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Area liveability snapshot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Community & census context" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sources and confidence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Data notes" })).not.toBeInTheDocument();
    // Compact finding cards: no verify-action, no provenance line on screen
    expect(
      screen.queryByText(/Ask council for a property-specific planning certificate/)
    ).not.toBeInTheDocument();
    // Findings themselves still render (titles only)
    expect(screen.getByText("Very busy road within 200 m")).toBeInTheDocument();
  });

  it("links out to the full area report and keeps the print button", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="live" />);
    expect(screen.getByRole("link", { name: /See the full area report/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print \/ save as PDF/ })).toBeInTheDocument();
  });

  it("offers 'Open the full report' linking to /buyer/report for this exact pin (P1-1)", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="live" />);
    const link = screen.getByRole("link", { name: /Open the full report/ });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/buyer/report?lat=-37.813600&lng=144.963100")
    );
  });

  it("hides the full-report link when there is no pin", () => {
    render(
      <BuyerReportPanel
        report={makeReport({ location: { sa2Name: "Testville" } })}
        place={PLACE}
        variant="live"
      />
    );
    expect(screen.queryByRole("link", { name: /Open the full report/ })).not.toBeInTheDocument();
  });

  it("shows clear-pin and save-check actions only when handlers are wired", () => {
    const { rerender } = render(
      <BuyerReportPanel report={makeReport()} place={PLACE} variant="live" />
    );
    expect(screen.queryByRole("button", { name: /Clear pin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save this check/ })).not.toBeInTheDocument();
    rerender(
      <BuyerReportPanel
        report={makeReport()}
        place={PLACE}
        variant="live"
        onClear={() => {}}
        onSaveCheck={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /Clear pin/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save this check/ })).toBeInTheDocument();
  });
});

describe("BuyerReportPanel - embedded variant", () => {
  it("renders the full report but no full-area-report button (it IS that page)", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="embedded" />);
    expect(screen.getByRole("heading", { name: "Sources and confidence" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /See the full area report/ })).not.toBeInTheDocument();
    // No "Sample report" disclaimer suffix outside the sample variant
    expect(screen.queryByText(/Sample report - not a report/)).not.toBeInTheDocument();
  });
});

describe("BuyerReportPanel - no-pin report", () => {
  it("omits pin-only sections (sun path, auto-fetch cards never fetch)", () => {
    render(
      <BuyerReportPanel
        report={makeReport({ location: { sa2Name: "Testville" } })}
        place={PLACE}
        variant="sample"
      />
    );
    expect(screen.queryByRole("heading", { name: "Sun & light" })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("BuyerReportPanel - full variant (/buyer/report route for a real pin)", () => {
  it("shows everything the sample shows, minus the sample wording", () => {
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="full" />);
    // Full chrome: banner, confidence badge, full-only sections, finding detail
    expect(screen.getByText(/Information only - verify before buying/)).toBeInTheDocument();
    expect(screen.queryByText(/Sample report - not a report/)).not.toBeInTheDocument();
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Area liveability snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sources and confidence" })).toBeInTheDocument();
    expect(
      screen.getAllByText(/Ask council for a property-specific planning certificate/).length
    ).toBe(2);
    expect(screen.getAllByText(/Confidence: high/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/as at 2026-05-29/).length).toBeGreaterThan(0);
    // It IS the full pin report - no self-referential "Open the full report"
    expect(screen.queryByRole("link", { name: /Open the full report/ })).not.toBeInTheDocument();
  });
});

describe("BuyerReportPanel - price context card (P1-6 wiring)", () => {
  // Keep this describe LAST in the file: lib/price-context caches the baked
  // file at module level once loaded, so a successful load here must not run
  // before the no-fetch assertions above.
  const PRICE_FILE = {
    generatedAt: "2026-06-01",
    sources: {
      house: { id: "vgv-house", name: "VGV houses", url: "", licence: "CC BY 4.0", period: "2024" },
      unit: { id: "vgv-unit", name: "VGV units", url: "", licence: "CC BY 4.0", period: "2024" },
      rent: { id: "dffh-rent", name: "DFFH rent", url: "", licence: "CC BY 4.0", period: "Sep 2025" },
    },
    suburbs: {
      testville: {
        suburb: "Testville",
        lng: 144.9631,
        lat: -37.8136,
        houseMedianByYear: { "2020": 900000, "2024": 1000000 },
      },
    },
  };

  function stubPriceFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        if (String(input).includes("/data/price-context.json")) {
          return { ok: true, status: 200, json: async () => PRICE_FILE };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );
  }

  it("renders in the live variant when the baked file covers the pin", async () => {
    stubPriceFetch();
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="live" />);
    expect(await screen.findByRole("heading", { name: "Price context" })).toBeInTheDocument();
  });

  it("renders in the full variant too (and shows the not-a-valuation framing)", async () => {
    stubPriceFetch();
    render(<BuyerReportPanel report={makeReport()} place={PLACE} variant="full" />);
    expect(await screen.findByRole("heading", { name: "Price context" })).toBeInTheDocument();
    expect(screen.getByText(/not a valuation/i)).toBeInTheDocument();
  });
});
