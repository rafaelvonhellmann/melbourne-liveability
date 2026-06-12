import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiFetchInit } from "../lib/api-client";
import { DEFAULT_PREFS, loadUserPrefs, saveUserPrefs } from "../lib/user-prefs";
import { loadProfile, saveProfile } from "../lib/user-profile";
import {
  __resetSyncForTests,
  __setApiFetchForTests,
  __setSyncSessionForTests,
  mergePrefs,
  mergeProfiles,
  schedulePush,
  syncNow,
  type SyncedUserPrefs,
} from "../lib/sync";

const EARLIER = "2026-06-12T00:00:00.000Z";
const LATER = "2026-06-12T00:05:00.000Z";
const AFTER = "2026-06-12T00:10:00.000Z";

function prefs(updatedAt = EARLIER): SyncedUserPrefs {
  return {
    version: 1,
    updatedAt,
    interestView: "homeBuyer",
    shortlist: ["server-a"],
    recent: [{ slug: "server-a", name: "Server A", viewedAt: EARLIER }],
    savedChecks: [
      {
        id: "server-check",
        lat: -37.8,
        lng: 144.97,
        savedAt: EARLIER,
        label: "Server check",
      },
    ],
    colorblindRamp: true,
  };
}

function savedCheck(id: string) {
  return {
    id,
    lat: -37.8,
    lng: 144.97,
    savedAt: EARLIER,
  };
}

function mockStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", {
    localStorage: ls,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

beforeEach(() => {
  mockStorage();
  __resetSyncForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetSyncForTests();
});

describe("mergeProfiles", () => {
  it("pulls a server profile when the device has none", () => {
    const server = {
      version: 1 as const,
      type: "buyer" as const,
      name: "Sam",
      createdAt: EARLIER,
    };

    expect(mergeProfiles(null, server)).toEqual(server);
  });

  it("keeps server fields while unioning local-only agent clients by id", () => {
    const server = {
      version: 1 as const,
      type: "agent" as const,
      name: "Server Agency",
      createdAt: EARLIER,
      clients: [
        { id: "c1", label: "Server One", createdAt: EARLIER },
        { id: "c2", label: "Server Two", createdAt: EARLIER },
      ],
      activeClientId: "c2",
    };
    const local = {
      version: 1 as const,
      type: "agent" as const,
      name: "Local Agency",
      createdAt: EARLIER,
      clients: [
        { id: "c2", label: "Local duplicate loses", createdAt: EARLIER },
        { id: "c3", label: "Local Three", createdAt: EARLIER },
      ],
      activeClientId: "c3",
    };

    expect(mergeProfiles(local, server)).toEqual({
      ...server,
      clients: [
        { id: "c1", label: "Server One", createdAt: EARLIER },
        { id: "c2", label: "Server Two", createdAt: EARLIER },
        { id: "c3", label: "Local Three", createdAt: EARLIER },
      ],
      activeClientId: "c2",
    });
  });

  it("caps merged clients at the profile sanitizer limit", () => {
    const serverClients = Array.from({ length: 25 }, (_, i) => ({
      id: `server-${i}`,
      label: `Server ${i}`,
      createdAt: EARLIER,
    }));
    const localClients = Array.from({ length: 10 }, (_, i) => ({
      id: `local-${i}`,
      label: `Local ${i}`,
      createdAt: EARLIER,
    }));

    const merged = mergeProfiles(
      {
        version: 1,
        type: "agent",
        createdAt: EARLIER,
        clients: localClients,
        activeClientId: "local-0",
      },
      {
        version: 1,
        type: "agent",
        createdAt: EARLIER,
        clients: serverClients,
        activeClientId: "server-24",
      }
    );

    expect(merged?.clients).toHaveLength(30);
    expect(merged?.clients?.slice(0, 25)).toEqual(serverClients);
    expect(merged?.clients?.slice(25).map((c) => c.id)).toEqual([
      "local-0",
      "local-1",
      "local-2",
      "local-3",
      "local-4",
    ]);
    expect(merged?.activeClientId).toBe("server-24");
  });
});

describe("mergePrefs", () => {
  it("pushes non-pristine local prefs when the server has no copy", () => {
    const merged = mergePrefs(
      { ...DEFAULT_PREFS, shortlist: ["local-a"] },
      null,
      EARLIER
    );

    expect(merged).toMatchObject({
      version: 1,
      updatedAt: EARLIER,
      shortlist: ["local-a"],
      recent: [],
      savedChecks: [],
    });
  });

  it("pulls server prefs when local prefs are pristine", () => {
    const server = prefs(LATER);

    expect(mergePrefs(DEFAULT_PREFS, server, AFTER)).toEqual(server);
  });

  it("uses the newer blob for normal fields but unions shortlist and saved checks", () => {
    const server = {
      ...prefs(LATER),
      interestView: "family" as const,
      shortlist: ["server-a", "shared"],
      savedChecks: [
        { ...savedCheck("server-check"), label: "Server wins duplicate fields" },
        savedCheck("shared-check"),
      ],
    };
    const local = {
      ...prefs(EARLIER),
      interestView: "retiree" as const,
      shortlist: ["local-a", "shared"],
      savedChecks: [
        { ...savedCheck("local-check"), label: "Local only" },
        { ...savedCheck("server-check"), label: "Local duplicate loses" },
      ],
    };

    const merged = mergePrefs(local, server, AFTER);

    expect(merged).toMatchObject({
      interestView: "family",
      shortlist: ["server-a", "shared", "local-a"],
      savedChecks: [
        { id: "server-check", label: "Server wins duplicate fields" },
        { id: "shared-check" },
        { id: "local-check", label: "Local only" },
      ],
    });
    expect(merged?.updatedAt).toBe(AFTER);
  });

  it("caps unioned shortlist and saved checks at the prefs sanitizer limits", () => {
    const server = {
      ...prefs(LATER),
      shortlist: Array.from({ length: 60 }, (_, i) => `server-${i}`),
      savedChecks: Array.from({ length: 30 }, (_, i) => savedCheck(`server-${i}`)),
    };
    const local = {
      ...prefs(EARLIER),
      shortlist: Array.from({ length: 60 }, (_, i) => `local-${i}`),
      savedChecks: Array.from({ length: 30 }, (_, i) => savedCheck(`local-${i}`)),
    };

    const merged = mergePrefs(local, server, AFTER);

    expect(merged?.shortlist).toHaveLength(100);
    expect(merged?.shortlist.slice(0, 60)).toEqual(server.shortlist);
    expect(merged?.shortlist.slice(60)).toEqual(
      Array.from({ length: 40 }, (_, i) => `local-${i}`)
    );
    expect(merged?.savedChecks).toHaveLength(50);
    expect(merged?.savedChecks.slice(0, 30)).toEqual(server.savedChecks);
    expect(merged?.savedChecks.slice(30).map((c) => c.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `local-${i}`)
    );
  });

  it("re-merges an incoming stale write with the 409 server copy", () => {
    const incoming = {
      ...prefs(EARLIER),
      shortlist: ["local-a"],
      savedChecks: [savedCheck("local-check")],
    };
    const staleServer = {
      ...prefs(LATER),
      shortlist: ["server-a"],
      savedChecks: [savedCheck("server-check")],
    };

    expect(mergePrefs(incoming, staleServer, AFTER)).toMatchObject({
      updatedAt: AFTER,
      shortlist: ["server-a", "local-a"],
      savedChecks: [{ id: "server-check" }, { id: "local-check" }],
    });
  });
});

describe("sync engine", () => {
  it("syncNow pulls server prefs into a pristine device without re-putting", async () => {
    const server = prefs(LATER);
    const calls: Array<{ path: string; init?: { method?: string } }> = [];
    __setSyncSessionForTests({
      id: "u_1",
      email: "sam@example.com",
      kind: "buyer",
    });
    __setApiFetchForTests(
      async <T = unknown>(path: `/api/${string}`, init?: ApiFetchInit): Promise<T> => {
        calls.push({ path, init });
        return server as T;
      }
    );

    await syncNow("prefs");

    expect(calls).toEqual([{ path: "/api/prefs", init: undefined }]);
    expect(loadUserPrefs().shortlist).toEqual(["server-a"]);
  });

  it("schedulePush debounces prefs PUTs and re-merges once on a 409 stale body", async () => {
    vi.useFakeTimers();
    // Pin the clock BEFORE the fixture timestamps: the local push-stamp must be
    // older than the server's LATER for the server copy to win the remerge.
    // (useFakeTimers defaults to the real date, which postdates the fixtures.)
    vi.setSystemTime(new Date(EARLIER));
    saveUserPrefs({ ...DEFAULT_PREFS, shortlist: ["local-a"] });
    const calls: Array<{ path: string; body: unknown }> = [];
    const server = { ...prefs(LATER), shortlist: ["server-a"], savedChecks: [] };
    __setSyncSessionForTests({
      id: "u_1",
      email: "sam@example.com",
      kind: "buyer",
    });
    __setApiFetchForTests(
      async <T = unknown>(path: `/api/${string}`, init?: ApiFetchInit): Promise<T> => {
        calls.push({ path, body: init?.json });
        if (calls.length === 1) {
          throw new ApiError(409, "stale", { error: "stale", server });
        }
        return init?.json as T;
      }
    );

    schedulePush("prefs");
    schedulePush("prefs");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(calls).toHaveLength(2);
    expect(calls[0].path).toBe("/api/prefs");
    expect(calls[1].body).toMatchObject({
      shortlist: ["server-a", "local-a"],
      savedChecks: [],
    });
  });

  it("syncNow pushes a local profile when the server has no copy", async () => {
    saveProfile({ type: "buyer", name: "Sam", createdAt: EARLIER });
    const calls: Array<{ path: string; method?: string; body: unknown }> = [];
    __setSyncSessionForTests({
      id: "u_1",
      email: "sam@example.com",
      kind: "buyer",
    });
    __setApiFetchForTests(
      async <T = unknown>(path: `/api/${string}`, init?: ApiFetchInit): Promise<T> => {
        calls.push({ path, method: init?.method, body: init?.json });
        if (!init?.method) return null as T;
        return init.json as T;
      }
    );

    await syncNow("profile");

    expect(calls).toEqual([
      { path: "/api/profile", method: undefined, body: undefined },
      {
        path: "/api/profile",
        method: "PUT",
        body: { version: 1, type: "buyer", name: "Sam", createdAt: EARLIER },
      },
    ]);
    expect(loadProfile()?.name).toBe("Sam");
  });
});
