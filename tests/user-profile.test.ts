import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PROFILE_STORAGE_KEY,
  parseProfileType,
  loadProfile,
  saveProfile,
  addClient,
  setActiveClient,
  clearProfile,
  getActiveClient,
  getProfileGreeting,
} from "../lib/user-profile";

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

describe("parseProfileType (enum drift guard)", () => {
  it("accepts only the known types", () => {
    expect(parseProfileType("buyer")).toBe("buyer");
    expect(parseProfileType("agent")).toBe("agent");
    expect(parseProfileType("admin")).toBeNull();
    expect(parseProfileType("")).toBeNull();
    expect(parseProfileType(null)).toBeNull();
  });
});

describe("round-trip", () => {
  it("saves and loads a buyer profile with a name and ISO createdAt", () => {
    const saved = saveProfile({ type: "buyer", name: "Sam" });
    expect(saved.version).toBe(1);
    const loaded = loadProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe("buyer");
    expect(loaded?.name).toBe("Sam");
    expect(() => new Date(loaded!.createdAt).toISOString()).not.toThrow();
    expect(loaded?.clients).toBeUndefined();
    expect(loaded?.activeClientId).toBeUndefined();
  });

  it("returns null when nothing is stored", () => {
    expect(loadProfile()).toBeNull();
  });

  it("preserves createdAt across re-saves and trims the name", () => {
    saveProfile({ type: "buyer", name: "Sam", createdAt: "2026-01-02T03:04:05.000Z" });
    const again = saveProfile({ type: "buyer", name: "  Samantha  " });
    expect(again.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(loadProfile()?.name).toBe("Samantha");
  });

  it("clearProfile forgets the record", () => {
    saveProfile({ type: "agent", name: "Riverside Realty" });
    clearProfile();
    expect(loadProfile()).toBeNull();
    expect(getProfileGreeting()).toBeNull();
  });

  it("a blank name is dropped, not stored as empty string", () => {
    saveProfile({ type: "buyer", name: "   " });
    expect(loadProfile()?.name).toBeUndefined();
  });
});

describe("poisoned storage never throws (prefs poisoning style)", () => {
  const POISON = [
    "{not json!!",
    "null",
    "42",
    '"a string"',
    "[]",
    JSON.stringify({}),
    JSON.stringify({ version: 99, type: "buyer" }),
    JSON.stringify({ version: "1", type: "buyer" }),
    JSON.stringify({ type: "buyer" }), // missing version
    JSON.stringify({ version: 1 }), // missing type
    JSON.stringify({ version: 1, type: "admin" }), // unknown enum
    JSON.stringify({ version: 1, type: 5 }),
    JSON.stringify({ version: 1, type: { nested: true } }),
  ];

  it.each(POISON.map((p) => [p]))("-> null for %s", (payload) => {
    localStorage.setItem(PROFILE_STORAGE_KEY, payload);
    expect(() => loadProfile()).not.toThrow();
    expect(loadProfile()).toBeNull();
  });

  it("sanitizes field-level drift while keeping the record", () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        type: "agent",
        name: 12345, // non-string -> dropped
        createdAt: { bad: true }, // non-string -> re-stamped
        clients: [
          { id: "a", label: "The Chen family", createdAt: "t" },
          { id: "b", label: { bad: true } }, // poisoned label -> dropped
          { id: 7, label: "No id" }, // non-string id -> dropped
          "junk",
          null,
          { id: "a", label: "Duplicate id" }, // dup id -> dropped
        ],
        activeClientId: "missing", // dangling -> falls back to first client
      })
    );
    const p = loadProfile();
    expect(p).not.toBeNull();
    expect(p?.type).toBe("agent");
    expect(p?.name).toBeUndefined();
    expect(typeof p?.createdAt).toBe("string");
    expect(p?.clients).toHaveLength(1);
    expect(p?.clients?.[0].label).toBe("The Chen family");
    expect(p?.activeClientId).toBe("a");
  });

  it("strips clients from a buyer record (buyers have no client list)", () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        type: "buyer",
        clients: [{ id: "a", label: "Should not survive", createdAt: "t" }],
        activeClientId: "a",
      })
    );
    const p = loadProfile();
    expect(p?.type).toBe("buyer");
    expect(p?.clients).toBeUndefined();
    expect(p?.activeClientId).toBeUndefined();
  });

  it("non-array clients reads as no clients", () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ version: 1, type: "agent", clients: { not: "an array" } })
    );
    const p = loadProfile();
    expect(p?.type).toBe("agent");
    expect(p?.clients).toBeUndefined();
  });

  it("a blocked setItem degrades silently (Safari private mode)", () => {
    const ls = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      clear: () => {},
    };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", { localStorage: ls, dispatchEvent: () => true });
    expect(() => saveProfile({ type: "buyer", name: "Sam" })).not.toThrow();
    expect(() => clearProfile()).not.toThrow();
  });
});

describe("agent clients (add / switch)", () => {
  it("addClient appends, generates unique ids and activates the new client", () => {
    saveProfile({ type: "agent", name: "Riverside Realty" });
    const one = addClient("The Chen family");
    expect(one?.clients).toHaveLength(1);
    expect(one?.activeClientId).toBe(one?.clients?.[0].id);

    const two = addClient("J. Nguyen");
    expect(two?.clients).toHaveLength(2);
    expect(two?.clients?.[0].id).not.toBe(two?.clients?.[1].id);
    // The newest client becomes active.
    expect(two?.activeClientId).toBe(two?.clients?.[1].id);
    expect(getActiveClient()?.label).toBe("J. Nguyen");
  });

  it("setActiveClient switches; unknown ids leave the state untouched", () => {
    saveProfile({ type: "agent" });
    addClient("First");
    const after = addClient("Second");
    const firstId = after!.clients![0].id;

    const switched = setActiveClient(firstId);
    expect(switched?.activeClientId).toBe(firstId);
    expect(getActiveClient()?.label).toBe("First");

    const unknown = setActiveClient("nope");
    expect(unknown?.activeClientId).toBe(firstId);
  });

  it("addClient is a no-op for buyer profiles and blank labels", () => {
    saveProfile({ type: "buyer", name: "Sam" });
    expect(addClient("The Chen family")?.clients).toBeUndefined();

    clearProfile();
    expect(addClient("anything")).toBeNull();

    saveProfile({ type: "agent" });
    expect(addClient("   ")?.clients).toBeUndefined();
  });

  it("round-trips clients through storage", () => {
    saveProfile({ type: "agent", name: "Riverside Realty" });
    addClient("The Chen family");
    const p = loadProfile();
    expect(p?.clients).toHaveLength(1);
    expect(p?.clients?.[0].label).toBe("The Chen family");
    expect(p?.activeClientId).toBe(p?.clients?.[0].id);
  });
});

describe("getProfileGreeting (inert greeting seam)", () => {
  it("is null without a profile", () => {
    expect(getProfileGreeting()).toBeNull();
  });

  it("greets a named buyer", () => {
    saveProfile({ type: "buyer", name: "Sam" });
    expect(getProfileGreeting()).toBe("Welcome back, Sam");
  });

  it("greets an unnamed buyer without a dangling comma", () => {
    saveProfile({ type: "buyer" });
    expect(getProfileGreeting()).toBe("Welcome back");
  });

  it("surfaces the active client label for agents", () => {
    saveProfile({ type: "agent", name: "Riverside Realty" });
    expect(getProfileGreeting()).toBe("Welcome back, Riverside Realty");
    addClient("The Chen family");
    addClient("J. Nguyen");
    expect(getProfileGreeting()).toBe("Welcome back, Riverside Realty - viewing for J. Nguyen");
    const p = loadProfile();
    setActiveClient(p!.clients![0].id);
    expect(getProfileGreeting()).toBe(
      "Welcome back, Riverside Realty - viewing for The Chen family"
    );
  });
});
