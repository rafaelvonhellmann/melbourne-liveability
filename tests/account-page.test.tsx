// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AccountPage from "../app/account/page";
import { DEFAULT_PREFS, loadUserPrefs, saveUserPrefs } from "../lib/user-prefs";
import { loadProfile, saveProfile } from "../lib/user-profile";

const sessionMock = vi.hoisted(() => ({
  current: {
    status: "signed-out",
    signOut: vi.fn(async () => {}),
  } as ReturnType<typeof import("../lib/use-session").useSession>,
}));

const syncMock = vi.hoisted(() => ({
  controller: {
    status: "idle" as const,
    syncNow: vi.fn(async () => "synced" as const),
    schedulePush: vi.fn(),
    deleteSyncedCopy: vi.fn(async () => "synced" as const),
  },
}));

vi.mock("@/lib/use-places", () => ({
  usePlaces: () => ({ places: [], error: null }),
}));

vi.mock("@/lib/use-session", () => ({
  useSession: () => sessionMock.current,
}));

vi.mock("@/lib/sync", () => ({
  useAccountSync: () => syncMock.controller,
  runWithoutSyncPush: <T,>(fn: () => T) => fn(),
}));

const USER = {
  id: "u_1",
  email: "sam@example.com",
  kind: "buyer" as const,
};

beforeEach(() => {
  localStorage.clear();
  sessionMock.current = {
    status: "signed-out",
    signOut: vi.fn(async () => {}),
  } as ReturnType<typeof import("../lib/use-session").useSession>;
  syncMock.controller.status = "idle";
  syncMock.controller.syncNow.mockClear();
  syncMock.controller.schedulePush.mockClear();
  syncMock.controller.deleteSyncedCopy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("/account page", () => {
  it("renders the signed-out sync pitch with a sign-in link", () => {
    render(<AccountPage />);

    expect(screen.getByText("Sign in to sync")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });

  it("renders signed-in controls with sync now and sign out", () => {
    const signOut = vi.fn(async () => {});
    sessionMock.current = {
      status: "signed-in",
      user: USER,
      signOut,
    } as ReturnType<typeof import("../lib/use-session").useSession>;

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));

    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(syncMock.controller.syncNow).toHaveBeenCalledWith("all");
    expect(signOut).toHaveBeenCalled();
  });

  it("keeps local-data sections visible when the account service is unavailable", async () => {
    sessionMock.current = {
      status: "unavailable",
      signOut: vi.fn(async () => {}),
    } as ReturnType<typeof import("../lib/use-session").useSession>;
    saveUserPrefs({ ...DEFAULT_PREFS, shortlist: ["carlton"] });

    render(<AccountPage />);

    expect(screen.getByText("Sync offline")).toBeInTheDocument();
    await screen.findByText("Shortlist (1)");
    expect(screen.getByText("carlton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export my data/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Clear this device/ })).toBeEnabled();
  });

  it("exports prefs and profile in one JSON payload", async () => {
    saveUserPrefs({ ...DEFAULT_PREFS, shortlist: ["fitzroy"] });
    saveProfile({ type: "buyer", name: "Sam", createdAt: "2026-06-12T00:00:00.000Z" });
    let exportedBlob: Blob | null = null;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:festra-data";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: /Export my data/ }));

    expect(exportedBlob).not.toBeNull();
    const payload = JSON.parse(await exportedBlob!.text()) as {
      prefs: { shortlist: string[] };
      profile: { name: string };
    };
    expect(payload.prefs.shortlist).toEqual(["fitzroy"]);
    expect(payload.profile.name).toBe("Sam");
  });

  it("clears device-local prefs and profile after confirmation", async () => {
    saveUserPrefs({ ...DEFAULT_PREFS, shortlist: ["fitzroy"] });
    saveProfile({ type: "buyer", name: "Sam", createdAt: "2026-06-12T00:00:00.000Z" });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: /Clear this device/ }));

    await waitFor(() => {
      expect(loadUserPrefs().shortlist).toEqual([]);
      expect(loadProfile()).toBeNull();
    });
    expect(screen.getByText("Cleared. Your on-device data has been reset.")).toBeInTheDocument();
  });

  it("deletes the synced copy through sync and signs out", async () => {
    const signOut = vi.fn(async () => {});
    sessionMock.current = {
      status: "signed-in",
      user: USER,
      signOut,
    } as ReturnType<typeof import("../lib/use-session").useSession>;
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: /Delete synced copy/ }));

    await waitFor(() => expect(syncMock.controller.deleteSyncedCopy).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalled();
  });
});
