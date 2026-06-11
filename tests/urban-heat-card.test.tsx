// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { UrbanHeatCard } from "../components/buyer/UrbanHeatCard";

/**
 * Auto-fetch card contract: the card queries the heat layer at the pin and must
 * OMIT ITSELF (render nothing) when the point has no coverage or the request
 * fails - never an error state, never a stuck spinner. fetch is mocked; no
 * network, deterministic.
 */

type FetchResponse = { ok: boolean; json: () => Promise<unknown> };

function mockFetch(response: FetchResponse | Promise<never>) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UrbanHeatCard", () => {
  it("renders the heat band + uplift when the point is covered", async () => {
    const fetchFn = mockFetch({
      ok: true,
      json: async () => ({
        features: [{ attributes: { UHI18_M: 8.42, SA2_NAME16: "Testville" } }],
      }),
    });
    render(<UrbanHeatCard lng={144.9631} lat={-37.8136} />);

    // Loading state first, then the resolved card.
    expect(screen.getByText(/Checking urban heat/)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Urban heat" })
    ).toBeInTheDocument();
    // UHI18_M rounds to one decimal and feeds the band copy (7 <= 8.4 < 10 = Hot).
    // The uplift appears in both the badge and the body copy.
    expect(screen.getAllByText(/\+8\.4/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^Hot/)).toBeInTheDocument();
    // The pin's coordinates went into the ArcGIS point query.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("geometry=144.9631,-37.8136");
    // Default (full-report) rendering keeps the attribution + snapshot vintage.
    expect(screen.getByText(/State of Victoria/)).toBeInTheDocument();
    expect(screen.getByText(/Landsat-derived, 2018/)).toBeInTheDocument();
  });

  it("compact (live glimpse) drops attribution, vintage and the caveat sentence", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        features: [{ attributes: { UHI18_M: 8.42, SA2_NAME16: "Testville" } }],
      }),
    });
    render(<UrbanHeatCard lng={144.9631} lat={-37.8136} compact />);

    expect(await screen.findByRole("heading", { name: "Urban heat" })).toBeInTheDocument();
    // The digestible fact stays...
    expect(screen.getAllByText(/\+8\.4/).length).toBeGreaterThanOrEqual(1);
    // ...the provenance/caveat tail does not (glimpse rule).
    expect(screen.queryByText(/State of Victoria/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Landsat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Leafier streets/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CC BY/)).not.toBeInTheDocument();
  });

  it("omits itself entirely when the point has no coverage", async () => {
    mockFetch({ ok: true, json: async () => ({ features: [] }) });
    const { container } = render(<UrbanHeatCard lng={141.0} lat={-38.0} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText(/Urban heat/)).not.toBeInTheDocument();
  });

  it("omits itself when the upstream request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))));
    const { container } = render(<UrbanHeatCard lng={144.9631} lat={-37.8136} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("omits itself on a malformed payload (no usable uplift)", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ features: [{ attributes: { UHI18_M: "not-a-number" } }] }),
    });
    const { container } = render(<UrbanHeatCard lng={144.9631} lat={-37.8136} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
