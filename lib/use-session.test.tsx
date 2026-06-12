// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { __resetSessionForTests, useSession } from "./use-session";

const USER = {
  id: "u_1",
  email: "sam@example.com",
  kind: "buyer",
  createdAt: "2026-06-13T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function SessionProbe({ label = "session" }: { label?: string }) {
  const session = useSession();
  return (
    <div>
      <span data-testid={label}>{session.status}</span>
      {session.status === "signed-in" && <span>{session.user.email}</span>}
      <button type="button" onClick={() => void session.signOut()}>
        Sign out
      </button>
    </div>
  );
}

beforeEach(() => {
  __resetSessionForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetSessionForTests();
});

describe("useSession", () => {
  it("starts loading, then renders signed-in user state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(USER)));
    render(<SessionProbe />);

    expect(screen.getByTestId("session")).toHaveTextContent("loading");
    await screen.findByText("sam@example.com");
    expect(screen.getByTestId("session")).toHaveTextContent("signed-in");
  });

  it("renders signed-out on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401))
    );
    render(<SessionProbe />);

    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("signed-out"));
  });

  it("renders unavailable on 503 or network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "bindings" }, 503))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(<SessionProbe />);
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("unavailable"));

    cleanup();
    __resetSessionForTests();
    render(<SessionProbe label="second" />);
    await waitFor(() => expect(screen.getByTestId("second")).toHaveTextContent("unavailable"));
  });

  it("shares one /api/me round-trip across multiple consumers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(USER));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <SessionProbe label="a" />
        <SessionProbe label="b" />
      </>
    );

    await waitFor(() => expect(screen.getByTestId("a")).toHaveTextContent("signed-in"));
    expect(screen.getByTestId("b")).toHaveTextContent("signed-in");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts logout and resets cached state on sign out", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/logout") return jsonResponse({ status: "ok" });
      return jsonResponse(USER);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionProbe />);

    await screen.findByText("sam@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("signed-out"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });
});
