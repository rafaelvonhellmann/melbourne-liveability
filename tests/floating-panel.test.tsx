// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  FloatingPanel,
  computeFloatingPlacement,
  PANEL_GAP,
  PANEL_MARGIN,
} from "../components/FloatingPanel";

/**
 * Desktop pin-anchored floating report panel: pure placement maths (side
 * preference, edge flip, clamping, caret tracking) + the DOM wiring (hidden on
 * mobile, positioned from the anchor, content untouched).
 */

// Reference geometry used across the placement tests: a 360x500 panel inside a
// 1200x800 map container.
const geom = {
  panelWidth: 360,
  panelHeight: 500,
  containerWidth: 1200,
  containerHeight: 800,
};

describe("computeFloatingPlacement", () => {
  it("sits right of the pin by default, vertically centred on it", () => {
    const p = computeFloatingPlacement({ anchor: { x: 200, y: 300 }, ...geom });
    expect(p.side).toBe("right");
    expect(p.left).toBe(200 + PANEL_GAP); // 224 - clear of the ~27px marker
    expect(p.top).toBe(300 - 500 / 2); // 50
    // Caret centre tracks the pin: 300 - 50 - 12/2.
    expect(p.caretTop).toBe(244);
  });

  it("flips to the left side when the right edge would spill off the map", () => {
    const p = computeFloatingPlacement({ anchor: { x: 1000, y: 300 }, ...geom });
    expect(p.side).toBe("left");
    expect(p.left).toBe(1000 - PANEL_GAP - 360); // 616
    // Right edge of the panel still clears the pin by the full gap.
    expect(p.left + 360).toBeLessThanOrEqual(1000 - PANEL_GAP);
  });

  it("stays right and clamps when NEITHER side fits (very narrow map)", () => {
    const p = computeFloatingPlacement({
      anchor: { x: 100, y: 300 },
      ...geom,
      containerWidth: 420,
    });
    expect(p.side).toBe("right");
    // Clamped inside the container: 420 - 360 - margin.
    expect(p.left).toBe(420 - 360 - PANEL_MARGIN);
  });

  it("clamps to the top edge for a pin near the top", () => {
    const p = computeFloatingPlacement({ anchor: { x: 200, y: 40 }, ...geom });
    expect(p.top).toBe(PANEL_MARGIN);
    // Caret keeps pointing at the pin (40 - 12 - 6 = 22), inside the panel.
    expect(p.caretTop).toBe(22);
  });

  it("clamps to the bottom edge and pins the caret inside the panel", () => {
    const p = computeFloatingPlacement({ anchor: { x: 200, y: 780 }, ...geom });
    expect(p.top).toBe(800 - 500 - PANEL_MARGIN); // 288
    // Pin is below the clamped panel - caret clamps to the panel's bottom run.
    expect(p.caretTop).toBe(500 - PANEL_MARGIN - 12); // 476
  });

  it("never lets the caret leave the panel for a pin above the map", () => {
    const p = computeFloatingPlacement({ anchor: { x: 200, y: 0 }, ...geom });
    expect(p.caretTop).toBe(PANEL_MARGIN);
  });
});

describe("FloatingPanel", () => {
  // jsdom has no layout: stub the dimensions the placement effect reads. The
  // panel reads offset*, its parent reads client* - distinct props, one stub.
  const stubbed: Record<string, PropertyDescriptor | undefined> = {};
  beforeAll(() => {
    const dims: Record<string, number> = {
      offsetWidth: geom.panelWidth,
      offsetHeight: geom.panelHeight,
      clientWidth: geom.containerWidth,
      clientHeight: geom.containerHeight,
    };
    for (const [k, v] of Object.entries(dims)) {
      stubbed[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
      Object.defineProperty(HTMLElement.prototype, k, {
        configurable: true,
        get: () => v,
      });
    }
  });
  afterAll(() => {
    for (const [k, d] of Object.entries(stubbed)) {
      if (d) Object.defineProperty(HTMLElement.prototype, k, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    }
  });
  afterEach(cleanup);

  it("renders nothing until an anchor is known", () => {
    render(
      <FloatingPanel anchor={null} label="Location check report">
        <div>report-content</div>
      </FloatingPanel>
    );
    expect(screen.queryByTestId("floating-report-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("report-content")).not.toBeInTheDocument();
  });

  it("renders the children in a labelled desktop-only region beside the pin", () => {
    render(
      <FloatingPanel anchor={{ x: 200, y: 300 }} label="Location check report">
        <div>report-content</div>
      </FloatingPanel>
    );
    const panel = screen.getByRole("complementary", { name: "Location check report" });
    expect(panel).toHaveAttribute("data-testid", "floating-report-panel");
    expect(screen.getByText("report-content")).toBeInTheDocument();
    // Mobile keeps the bottom sheet: the panel is hidden below md.
    expect(panel.className).toContain("hidden");
    expect(panel.className).toContain("md:block");
    expect(panel.className).toContain("w-[360px]");
    // Positioned from the anchor (224 = x + gap; 50 = y - height/2).
    expect(panel.style.left).toBe("224px");
    expect(panel.style.top).toBe("50px");
    expect(panel.dataset.side).toBe("right");
    // Internal scroll, capped height - the map never gets a full-column wall.
    const scroller = panel.querySelector(".max-h-\\[70vh\\]");
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toContain("overflow-y-auto");
    // Connector caret tracks the pin vertically.
    const caret = panel.querySelector<HTMLElement>(".floating-panel-caret");
    expect(caret).not.toBeNull();
    expect(caret!.style.top).toBe("244px");
  });

  it("re-anchors when the pin's screen position changes (map move/zoom)", () => {
    const { rerender } = render(
      <FloatingPanel anchor={{ x: 200, y: 300 }} label="Location check report">
        <div>report-content</div>
      </FloatingPanel>
    );
    rerender(
      <FloatingPanel anchor={{ x: 1000, y: 300 }} label="Location check report">
        <div>report-content</div>
      </FloatingPanel>
    );
    const panel = screen.getByTestId("floating-report-panel");
    // Near the right edge the panel flips to the pin's left.
    expect(panel.dataset.side).toBe("left");
    expect(panel.style.left).toBe("616px");
  });
});
