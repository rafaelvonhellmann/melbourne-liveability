// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OnboardingModal } from "../components/OnboardingModal";

/**
 * First-run onboarding moment: brand lead (pin-dot F + wordmark + tagline)
 * over a decorative map vignette, the existing lens picker (semantics +
 * localStorage key unchanged), and the dismissal/focus-trap/Escape contract.
 */

const SEEN_KEY = "mlv-onboarded-v1";
const PREFS_KEY = "mlv-user-prefs-v1";

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("OnboardingModal", () => {
  it("opens for a first-time visitor with the brand tagline as the dialog title", () => {
    render(<OnboardingModal />);
    const dialog = screen.getByRole("dialog", {
      name: /a window towards your new home/i,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Brand lead: wordmark + tagline heading, in that order before the picker.
    expect(screen.getByText("Festra")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "A window towards your new home" })
    ).toBeInTheDocument();
  });

  it("renders the intro vignette as pure decoration (aria-hidden, no pointer targets)", () => {
    render(<OnboardingModal />);
    const intro = screen.getByTestId("onboarding-intro");
    expect(intro).toHaveAttribute("aria-hidden", "true");
    expect(intro.className).toContain("pointer-events-none");
    // The animation cast: camera layer, dropping pin, staggered data chips.
    expect(intro.querySelector(".onboard-cam")).not.toBeNull();
    expect(intro.querySelector(".onboard-pin")).not.toBeNull();
    const chips = intro.querySelectorAll<HTMLElement>(".onboard-chip");
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(intro.textContent).toContain("Station 8 min walk");
    expect(intro.textContent).toContain("No flood zone");
    // Each chip carries its stagger index for the 25ms CSS delay ladder.
    chips.forEach((chip, i) => {
      expect(chip.style.getPropertyValue("--chip-i")).toBe(String(i));
    });
    // Inline-SVG street grid - no images, no network.
    expect(intro.querySelector("svg")).not.toBeNull();
    expect(intro.querySelector("img")).toBeNull();
  });

  it("does not open again once the seen flag is set", () => {
    localStorage.setItem(SEEN_KEY, "1");
    render(<OnboardingModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("skips returning users with saved prefs and marks them as seen", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ interestView: "family", shortlist: [] })
    );
    render(<OnboardingModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(SEEN_KEY)).toBe("1");
  });

  it("picking a lens saves the pref, fires onPick + onDismiss and closes", () => {
    const onPick = vi.fn();
    const onDismiss = vi.fn();
    render(<OnboardingModal onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    expect(onPick).toHaveBeenCalledWith("general");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SEEN_KEY)).toBe("1");
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    expect(prefs.interestView).toBe("general");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it('"Start exploring" dismisses without picking a lens and fires onDismiss', () => {
    const onPick = vi.fn();
    const onDismiss = vi.fn();
    render(<OnboardingModal onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    expect(onPick).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape dismisses and fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(<OnboardingModal onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus into the dialog on open and traps Tab at both ends", () => {
    render(<OnboardingModal />);
    const first = screen.getByRole("button", { name: /balanced/i });
    const last = screen.getByRole("button", { name: "Start exploring" });
    // Focus lands on the first focusable (a lens) when the dialog opens.
    expect(document.activeElement).toBe(first);
    // Shift+Tab from the first wraps to the last...
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // ...and Tab from the last wraps back to the first.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });
});
