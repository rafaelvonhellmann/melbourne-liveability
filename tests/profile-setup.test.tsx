// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfileSetup } from "../components/ProfileSetup";
import { loadProfile, getActiveClient } from "../lib/user-profile";

/**
 * Post-landing profile setup sheet: a quiet, all-optional Crema dialog that
 * persists via lib/user-profile and never blocks the map. Every dismissal
 * path (Done, Escape, backdrop) must persist the chosen type at minimum.
 */

function renderSetup(over: Partial<React.ComponentProps<typeof ProfileSetup>> = {}) {
  const props = {
    type: "buyer" as const,
    onClose: vi.fn(),
    ...over,
  };
  const utils = render(<ProfileSetup {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("buyer branch", () => {
  it("renders a dialog with the optional first-name field and Done", () => {
    renderSetup({ type: "buyer" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your window is ready" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First name (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    // No agent-only client field on the buyer branch.
    expect(screen.queryByLabelText(/first client/i)).not.toBeInTheDocument();
  });

  it("Done persists the typed name and closes", () => {
    const { props } = renderSetup({ type: "buyer" });
    fireEvent.change(screen.getByLabelText("First name (optional)"), {
      target: { value: "Sam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    const p = loadProfile();
    expect(p?.type).toBe("buyer");
    expect(p?.name).toBe("Sam");
    expect(p?.clients).toBeUndefined();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Done with nothing typed still persists the type (skippable)", () => {
    const { props } = renderSetup({ type: "buyer" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const p = loadProfile();
    expect(p?.type).toBe("buyer");
    expect(p?.name).toBeUndefined();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("agent branch", () => {
  it("renders name/agency and first-client fields", () => {
    renderSetup({ type: "agent" });
    expect(
      screen.getByRole("heading", { name: "Your client window is ready" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Your name or agency (optional)")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Add your first client (optional)")
    ).toBeInTheDocument();
  });

  it("Done persists the agent profile with the first client active", () => {
    const { props } = renderSetup({ type: "agent" });
    fireEvent.change(screen.getByLabelText("Your name or agency (optional)"), {
      target: { value: "Riverside Realty" },
    });
    fireEvent.change(screen.getByLabelText("Add your first client (optional)"), {
      target: { value: "The Chen family" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    const p = loadProfile();
    expect(p?.type).toBe("agent");
    expect(p?.name).toBe("Riverside Realty");
    expect(p?.clients).toHaveLength(1);
    expect(p?.clients?.[0].label).toBe("The Chen family");
    expect(p?.activeClientId).toBe(p?.clients?.[0].id);
    expect(getActiveClient()?.label).toBe("The Chen family");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("a blank client label adds no client", () => {
    renderSetup({ type: "agent" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const p = loadProfile();
    expect(p?.type).toBe("agent");
    expect(p?.clients).toBeUndefined();
  });
});

describe("dismissal paths (never block the map)", () => {
  it("Escape persists the type at minimum and closes", () => {
    const { props } = renderSetup({ type: "agent" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(loadProfile()?.type).toBe("agent");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape persists whatever was typed so far", () => {
    const { props } = renderSetup({ type: "buyer" });
    fireEvent.change(screen.getByLabelText("First name (optional)"), {
      target: { value: "Sam" },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    const p = loadProfile();
    expect(p?.type).toBe("buyer");
    expect(p?.name).toBe("Sam");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click persists and closes; clicks inside the panel do not", () => {
    const { props } = renderSetup({ type: "buyer" });
    // A click inside the dialog panel must NOT dismiss.
    fireEvent.click(screen.getByRole("dialog"));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(loadProfile()).toBeNull();

    fireEvent.click(screen.getByTestId("profile-setup-backdrop"));
    expect(loadProfile()?.type).toBe("buyer");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("double dismissal persists and closes exactly once", () => {
    const { props } = renderSetup({ type: "buyer" });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("profile-setup-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
