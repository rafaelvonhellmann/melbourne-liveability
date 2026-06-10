import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addSavedCheck,
  removeSavedCheck,
  isCheckSaved,
  savedCheckId,
  loadUserPrefs,
  loadBuyerProfile,
} from "../lib/user-prefs";

function mockStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: () => true });
}

beforeEach(() => mockStorage());
afterEach(() => vi.unstubAllGlobals());

describe("savedCheckId", () => {
  it("is a stable 5-dp coordinate key", () => {
    expect(savedCheckId(-37.8, 144.97)).toBe("-37.80000,144.97000");
    expect(savedCheckId(-37.812341, 144.963211)).toBe("-37.81234,144.96321");
    expect(savedCheckId(-37.812348, 144.963214)).toBe("-37.81235,144.96321");
  });
});

describe("saved checks", () => {
  it("adds, reports saved, and removes a check", () => {
    expect(isCheckSaved(-37.8, 144.97)).toBe(false);
    addSavedCheck({ lat: -37.8, lng: 144.97, areaName: "Testville" });
    expect(isCheckSaved(-37.8, 144.97)).toBe(true);
    const prefs = loadUserPrefs();
    expect(prefs.savedChecks).toHaveLength(1);
    expect(prefs.savedChecks[0].areaName).toBe("Testville");
    expect(prefs.savedChecks[0].id).toBe(savedCheckId(-37.8, 144.97));

    removeSavedCheck(savedCheckId(-37.8, 144.97));
    expect(isCheckSaved(-37.8, 144.97)).toBe(false);
    expect(loadUserPrefs().savedChecks).toHaveLength(0);
  });

  it("de-dupes by rounded coordinate and floats the latest to the front", () => {
    addSavedCheck({ lat: -37.8, lng: 144.97, areaName: "First" });
    addSavedCheck({ lat: -37.81, lng: 144.96, areaName: "Second" });
    // Same coordinate as the first -> replaces, not duplicates, and moves to front.
    addSavedCheck({ lat: -37.8, lng: 144.97, areaName: "First-again" });
    const { savedChecks } = loadUserPrefs();
    expect(savedChecks).toHaveLength(2);
    expect(savedChecks[0].areaName).toBe("First-again");
  });

  it("drops malformed saved checks on load", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({
        version: 1,
        shortlist: [],
        recent: [],
        savedChecks: [
          { id: "x", lat: "nope", lng: 1, savedAt: "t" },
          { id: "ok", lat: -37.8, lng: 144.97, savedAt: "t" },
        ],
      })
    );
    const { savedChecks } = loadUserPrefs();
    expect(savedChecks).toHaveLength(1);
    expect(savedChecks[0].id).toBe("ok");
  });
});

describe("buyer profile back-compat", () => {
  it("returns null when no profile is saved", () => {
    expect(loadBuyerProfile()).toBeNull();
  });

  it("coerces a legacy agent profile to buyer and strips removed keys", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({
        version: 1,
        shortlist: [],
        recent: [],
        savedChecks: [],
        buyerProfile: {
          mode: "agent",
          intent: "buy",
          car: "no_car",
          quiet: "high",
          schools: "high",
          safety: "medium",
          walkability: "low",
          dealBreakers: ["flood"],
        },
      })
    );
    const p = loadBuyerProfile();
    expect(p?.mode).toBe("buyer");
    expect(p?.intent).toBe("buy");
    expect(p?.car).toBe("no_car");
    expect(p?.quiet).toBe("high");
    expect(p?.dealBreakers).toEqual(["flood"]);
    expect(p && "schools" in p).toBe(false);
    expect(p && "safety" in p).toBe(false);
    expect(p && "walkability" in p).toBe(false);
  });
});
