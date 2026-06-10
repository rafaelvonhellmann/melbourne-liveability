// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SearchBox } from "../components/SearchBox";
import { geocodeAddress } from "../lib/geocode";
import type { SearchIndexEntry } from "../lib/search";

/**
 * Combobox semantics + keyboard support for the search box: ARIA 1.2 combobox
 * (input[role=combobox] -> listbox of options, aria-activedescendant), and the
 * P0-8 submit-only geocode policy (typing never fires the network; an explicit
 * submit or the address row does).
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

const INDEX = [entry("Carlton"), entry("Carlton North"), entry("Carnegie")];

afterEach(() => {
  cleanup();
  vi.mocked(geocodeAddress).mockClear();
});

describe("SearchBox combobox semantics", () => {
  it("exposes a combobox wired to a listbox of options", () => {
    render(<SearchBox index={INDEX} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");

    fireEvent.change(input, { target: { value: "carlton" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.getAttribute("id") ?? "");
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o).toHaveAttribute("aria-selected", "false");
  });

  it("ArrowDown highlights and Enter selects, without firing the geocode", () => {
    const onSelect = vi.fn();
    render(<SearchBox index={INDEX} onSelect={onSelect} onGeocode={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "carlton" } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = screen.getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].areaName).toBe("Carlton");
    expect(geocodeAddress).not.toHaveBeenCalled();
    // Selection closes the popup.
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("ArrowUp from no highlight wraps to the last option (the address action)", () => {
    render(<SearchBox index={INDEX} onSelect={vi.fn()} onGeocode={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "carlton" } });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const options = screen.getAllByRole("option");
    const last = options[options.length - 1];
    expect(last).toHaveAttribute("aria-selected", "true");
    expect(last).toHaveTextContent(/as a full address/);
    expect(input).toHaveAttribute("aria-activedescendant", last.id);
  });

  it("Escape closes the popup and drops the highlight", () => {
    render(<SearchBox index={INDEX} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "carlton" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });
});

describe("SearchBox submit-only geocode (P0-8 regression guard)", () => {
  it("typing an address never fires the network; submit does, then a pick geocodes", async () => {
    const onGeocode = vi.fn();
    const { container } = render(
      <SearchBox index={INDEX} onSelect={vi.fn()} onGeocode={onGeocode} />
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "12 smith st, abbotsford" } });

    // Address-like query: fuzzy area rows are suppressed; only the explicit
    // "search as a full address" option is offered. No network yet.
    expect(screen.getByRole("option", { name: /as a full address/ })).toBeInTheDocument();
    expect(screen.queryByText("Carlton")).not.toBeInTheDocument();
    expect(geocodeAddress).not.toHaveBeenCalled();

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(geocodeAddress).toHaveBeenCalledTimes(1);

    const result = await screen.findByRole("option", { name: /12 Smith St, Abbotsford/ });
    fireEvent.click(result);
    expect(onGeocode).toHaveBeenCalledWith(
      expect.objectContaining({ shortLabel: "12 Smith St, Abbotsford" })
    );
  });
});
