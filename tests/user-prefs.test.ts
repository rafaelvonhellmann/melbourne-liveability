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

describe("schema version migration", () => {
  it("loads a v1 payload with retired persona/agent fields intact", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({
        version: 1,
        personaId: "families",
        shortlist: ["carlton", "fitzroy"],
        recent: [{ slug: "carlton", name: "Carlton", viewedAt: "t" }],
        savedChecks: [{ id: "ok", lat: -37.8, lng: 144.97, savedAt: "t" }],
        buyerProfile: { mode: "agent", intent: "buy", schools: "high" },
      })
    );
    const prefs = loadUserPrefs();
    expect(prefs.version).toBe(1);
    expect(prefs.shortlist).toEqual(["carlton", "fitzroy"]);
    expect(prefs.recent).toHaveLength(1);
    expect(prefs.savedChecks).toHaveLength(1);
    expect(loadBuyerProfile()?.mode).toBe("buyer");
  });

  it("treats a missing version as v1", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ shortlist: ["carlton"], recent: [], savedChecks: [] })
    );
    const prefs = loadUserPrefs();
    expect(prefs.version).toBe(1);
    expect(prefs.shortlist).toEqual(["carlton"]);
  });

  it("treats a non-numeric version as v1", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: "later", shortlist: ["carlton"] })
    );
    const prefs = loadUserPrefs();
    expect(prefs.version).toBe(1);
    expect(prefs.shortlist).toEqual(["carlton"]);
  });

  it("falls back to defaults on a future-version payload without crashing", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 99, shortlist: { not: "an array" }, extra: true })
    );
    const prefs = loadUserPrefs();
    expect(prefs).toEqual({ version: 1, shortlist: [], recent: [], savedChecks: [] });
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("mlv-user-prefs-v1", "{not json!!");
    const prefs = loadUserPrefs();
    expect(prefs).toEqual({ version: 1, shortlist: [], recent: [], savedChecks: [] });
  });
});

describe("persona retirement migration (P1-11)", () => {
  it("folds a stored persona-era choice into the lens it maps to", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 1, personaId: "youngPro", shortlist: [] })
    );
    expect(loadUserPrefs().interestView).toBe("rental");
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 1, personaId: "family", shortlist: [] })
    );
    expect(loadUserPrefs().interestView).toBe("family");
  });

  it("never lets a stored personaId override a valid saved lens", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({
        version: 1,
        personaId: "retiree",
        interestView: "homeBuyer",
        shortlist: [],
      })
    );
    expect(loadUserPrefs().interestView).toBe("homeBuyer");
  });

  it("leaves the lens unset for an unmappable or non-string personaId", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 1, personaId: "families", shortlist: [] })
    );
    expect(loadUserPrefs().interestView).toBeUndefined();
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 1, personaId: 7, shortlist: [] })
    );
    expect(loadUserPrefs().interestView).toBeUndefined();
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

describe("interestView enum-drift guard (live incident 2026-06-11)", () => {
  it("strips a persona-era lens id an old build wrote", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({ version: 1, interestView: "youngPro", shortlist: [], recent: [], savedChecks: [] })
    );
    expect(loadUserPrefs().interestView).toBeUndefined();
  });
  it("strips non-string and unknown lens ids but keeps valid ones", () => {
    localStorage.setItem("mlv-user-prefs-v1", JSON.stringify({ version: 1, interestView: 5 }));
    expect(loadUserPrefs().interestView).toBeUndefined();
    localStorage.setItem("mlv-user-prefs-v1", JSON.stringify({ version: 1, interestView: "family" }));
    expect(loadUserPrefs().interestView).toBe("family");
  });
  it("drops savedChecks entries with non-string label/areaName", () => {
    localStorage.setItem(
      "mlv-user-prefs-v1",
      JSON.stringify({
        version: 1,
        savedChecks: [
          { lat: -37.8, lng: 144.9, label: { bad: true } },
          { lat: -37.8, lng: 144.9, label: "good" },
        ],
      })
    );
    const prefs = loadUserPrefs();
    expect(prefs.savedChecks).toHaveLength(1);
    expect(prefs.savedChecks[0].label).toBe("good");
  });
});
