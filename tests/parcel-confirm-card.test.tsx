// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ParcelConfirmCard, projectRingToSvg } from "../components/buyer/ParcelConfirmCard";

/**
 * The wrong-lot trust guard (P1-5): outline + area render once the Vicmap
 * parcel resolves; one tap confirms; a failed lookup renders an explicit
 * "could not identify the lot" state (VicPlan verify link) instead of
 * vanishing - the report itself is never blocked or degraded by this extra.
 * The owning page can pass the shape down (single fetch per pin); without the
 * prop the card fetches standalone.
 */

const PIN: [number, number] = [144.96, -37.81];

// ~1 ha block around the pin (same shape tests/parcel.test.ts uses).
const BLOCK_FC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { parcel_lot_number: "7", parcel_plan_number: "TP9" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [144.9595, -37.8105],
            [144.9605, -37.8105],
            [144.9605, -37.8095],
            [144.9595, -37.8095],
            [144.9595, -37.8105],
          ],
        ],
      },
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stubFetchOk = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => BLOCK_FC }))
  );

describe("projectRingToSvg", () => {
  const ring = BLOCK_FC.features[0].geometry.coordinates[0] as [number, number][];

  it("projects the ring into the viewBox with the pin inside it", () => {
    const p = projectRingToSvg(ring, PIN);
    expect(p).not.toBeNull();
    expect(p!.path).toMatch(/^M[\d. ]+(L[\d. ]+)+Z$/);
    expect(p!.pinX).toBeGreaterThan(0);
    expect(p!.pinX).toBeLessThan(96);
    expect(p!.pinY).toBeGreaterThan(0);
    expect(p!.pinY).toBeLessThan(96);
  });

  it("returns null for degenerate rings", () => {
    expect(projectRingToSvg([], PIN)).toBeNull();
    expect(
      projectRingToSvg(
        [
          [144.96, -37.81],
          [144.96, -37.81],
          [144.96, -37.81],
          [144.96, -37.81],
        ],
        PIN
      )
    ).toBeNull();
  });
});

describe("ParcelConfirmCard", () => {
  it("renders outline, area, lot/plan and the confirm prompt once the parcel resolves", async () => {
    stubFetchOk();
    render(<ParcelConfirmCard pin={PIN} onConfirm={() => {}} />);
    expect(
      await screen.findByRole("button", { name: /Yes - this is the property/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/m2/)).toBeInTheDocument();
    expect(screen.getByText(/Lot 7 TP9/)).toBeInTheDocument();
    expect(screen.getByText(/Drag the pin to adjust/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Outline of the land parcel/ })
    ).toBeInTheDocument();
  });

  it("confirming reports areaM2 + a confirmedAt timestamp", async () => {
    stubFetchOk();
    const onConfirm = vi.fn();
    render(<ParcelConfirmCard pin={PIN} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: /Yes - this is the property/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.areaM2).toBeGreaterThan(5000); // ~1 ha test block
    expect(arg.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("shows the confirmed state (no button) when already confirmed", async () => {
    stubFetchOk();
    render(
      <ParcelConfirmCard
        pin={PIN}
        confirmed={{ areaM2: 11070, confirmedAt: "2026-06-10T00:00:00.000Z" }}
      />
    );
    expect(await screen.findByText(/Confirmed as the property/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes - this is the property/ })
    ).not.toBeInTheDocument();
  });

  it("renders the explicit could-not-identify state (VicPlan link) when the lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    render(<ParcelConfirmCard pin={PIN} onConfirm={() => {}} />);
    expect(
      await screen.findByText(/Could not identify the lot at this pin/)
    ).toBeInTheDocument();
    expect(screen.getByText(/findings use the pin location/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "VicPlan" });
    expect(link).toHaveAttribute("href", expect.stringContaining("vicplan"));
    // No outline, no confirm button - there is no lot to confirm.
    expect(
      screen.queryByRole("button", { name: /Yes - this is the property/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Outline of the land parcel/ })
    ).not.toBeInTheDocument();
  });

  it("uses an owner-supplied shape without fetching (single fetch per pin)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const ring = BLOCK_FC.features[0].geometry.coordinates[0] as [number, number][];
    render(
      <ParcelConfirmCard
        pin={PIN}
        shape={{ areaM2: 11070, lot: "7", plan: "TP9", ring }}
        onConfirm={() => {}}
      />
    );
    // Renders synchronously from the prop - no WFS round-trip of its own.
    expect(
      screen.getByRole("button", { name: /Yes - this is the property/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/Lot 7 TP9/)).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
  });

  it("shape={null} (owner lookup failed) renders the failure state without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<ParcelConfirmCard pin={PIN} shape={null} onConfirm={() => {}} />);
    expect(
      screen.getByText(/Could not identify the lot at this pin/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VicPlan" })).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
  });
});
