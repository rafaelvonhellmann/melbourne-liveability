// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MobileSheet } from "../components/MobileSheet";

/**
 * Tab logic for the mobile bottom sheet: ARIA tabs pattern + buyer-mode gating,
 * plus the peek/half/full sheet positions.
 */

function renderSheet(props: { buyerMode?: boolean; hasSelection?: boolean } = {}) {
  // The tab tests assert panel visibility, which requires an open (half) sheet;
  // without a selection the sheet starts at peek with every panel hidden.
  return render(
    <MobileSheet
      explore={<div>explore-panel</div>}
      search={<div>search-panel</div>}
      layers={<div>layers-panel</div>}
      weights={<div>weights-panel</div>}
      hasSelection
      {...props}
    />
  );
}

const sheetPosition = (container: HTMLElement) =>
  container.querySelector("[data-position]")?.getAttribute("data-position");

const handle = () => screen.getByRole("button", { name: /Resize panel/ });

afterEach(cleanup);

describe("MobileSheet tabs", () => {
  it("renders all four tabs with Explore active by default", () => {
    renderSheet();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Explore", "Search", "Layers", "Weights"]);
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("explore-panel")).toBeVisible();
    // Inactive panels exist but are hidden
    expect(screen.getByText("layers-panel")).not.toBeVisible();
  });

  it("switches the visible panel on tab click (roving tabindex)", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    expect(screen.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("layers-panel")).toBeVisible();
    expect(screen.getByText("explore-panel")).not.toBeVisible();
    // Roving tabindex: only the selected tab is in the tab order
    expect(screen.getByRole("tab", { name: "Layers" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves selection with arrow keys, wrapping at the ends", () => {
    renderSheet();
    const tablist = screen.getByRole("tablist", { name: "Map panels" });
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    fireEvent.keyDown(tablist, { key: "ArrowLeft" }); // wraps Explore -> Weights
    expect(screen.getByRole("tab", { name: "Weights" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Weights" })).toHaveAttribute("aria-selected", "true");
  });

  it("hides the scored Weights tab in buyer mode (lens-not-scored)", () => {
    renderSheet({ buyerMode: true });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Explore", "Search", "Layers"]);
    expect(screen.queryByRole("tab", { name: "Weights" })).not.toBeInTheDocument();
  });

  it("falls back to the first visible tab when the active tab gets hidden", () => {
    const { rerender } = renderSheet();
    fireEvent.click(screen.getByRole("tab", { name: "Weights" }));
    expect(screen.getByText("weights-panel")).toBeVisible();
    // Entering buyer mode while on Weights must not strand the sheet
    rerender(
      <MobileSheet
        explore={<div>explore-panel</div>}
        search={<div>search-panel</div>}
        layers={<div>layers-panel</div>}
        weights={<div>weights-panel</div>}
        buyerMode
        hasSelection
      />
    );
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("explore-panel")).toBeVisible();
  });
});

describe("MobileSheet positions (peek / half / full)", () => {
  it("starts at peek with no selection: tabs render but every panel is hidden", () => {
    const { container } = renderSheet({ hasSelection: false });
    expect(sheetPosition(container)).toBe("peek");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByText("explore-panel")).not.toBeVisible();
    expect(handle()).toHaveAccessibleName("Resize panel (collapsed)");
  });

  it("starts at half when a selection exists", () => {
    const { container } = renderSheet();
    expect(sheetPosition(container)).toBe("half");
    expect(screen.getByText("explore-panel")).toBeVisible();
  });

  it("tapping the handle cycles peek -> half -> full -> peek", () => {
    const { container } = renderSheet({ hasSelection: false });
    fireEvent.click(handle());
    expect(sheetPosition(container)).toBe("half");
    expect(screen.getByText("explore-panel")).toBeVisible();
    fireEvent.click(handle());
    expect(sheetPosition(container)).toBe("full");
    expect(handle()).toHaveAccessibleName("Resize panel (full screen)");
    fireEvent.click(handle());
    expect(sheetPosition(container)).toBe("peek");
    expect(screen.getByText("explore-panel")).not.toBeVisible();
  });

  it("clicking a tab from peek opens the sheet to half (e2e journeys rely on this)", () => {
    const { container } = renderSheet({ hasSelection: false });
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(sheetPosition(container)).toBe("half");
    expect(screen.getByText("search-panel")).toBeVisible();
  });

  it("follows the selection: opens to half when one appears, collapses when it clears", () => {
    const props = {
      explore: <div>explore-panel</div>,
      search: <div>search-panel</div>,
      layers: <div>layers-panel</div>,
      weights: <div>weights-panel</div>,
    };
    const { container, rerender } = render(<MobileSheet {...props} />);
    expect(sheetPosition(container)).toBe("peek");
    rerender(<MobileSheet {...props} hasSelection />);
    expect(sheetPosition(container)).toBe("half");
    expect(screen.getByText("explore-panel")).toBeVisible();
    rerender(<MobileSheet {...props} />);
    expect(sheetPosition(container)).toBe("peek");
    expect(screen.getByText("explore-panel")).not.toBeVisible();
  });

  it("a selection never shrinks a manually expanded (full) sheet", () => {
    const props = {
      explore: <div>explore-panel</div>,
      search: <div>search-panel</div>,
      layers: <div>layers-panel</div>,
      weights: <div>weights-panel</div>,
    };
    const { container, rerender } = render(<MobileSheet {...props} />);
    fireEvent.click(handle()); // peek -> half
    fireEvent.click(handle()); // half -> full
    expect(sheetPosition(container)).toBe("full");
    rerender(<MobileSheet {...props} hasSelection />);
    expect(sheetPosition(container)).toBe("full");
  });

  it("dragging the handle steps one position and swallows the synthetic click", () => {
    const { container } = renderSheet({ hasSelection: false });
    // Drag up well past the 32px threshold: peek -> half.
    fireEvent.pointerDown(handle(), { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 200, pointerId: 1 });
    fireEvent.click(handle()); // synthetic click after the drag - must be ignored
    expect(sheetPosition(container)).toBe("half");
    // Drag down: half -> peek.
    fireEvent.pointerDown(handle(), { clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 300, pointerId: 1 });
    fireEvent.click(handle());
    expect(sheetPosition(container)).toBe("peek");
  });
});
