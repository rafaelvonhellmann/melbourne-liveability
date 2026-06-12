// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AuthVerifyPage from "../app/auth/page";
import { __resetSessionForTests } from "../lib/use-session";

const USER = {
  id: "u_1",
  email: "sam@example.com",
  kind: "buyer",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  __resetSessionForTests();
  window.history.replaceState(null, "", "/auth");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetSessionForTests();
});

describe("/auth verify page", () => {
  it("parses a fragment token and scrubs the URL before fetch fires", async () => {
    const locationAtFetch: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      locationAtFetch.push(window.location.href);
      if (String(input) === "/api/me") return jsonResponse(USER);
      return jsonResponse({ status: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/auth#token=fragment-token");

    render(<AuthVerifyPage />);

    await screen.findByRole("heading", { name: "You're signed in" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "fragment-token" }),
      })
    );
    expect(new URL(locationAtFetch[0]).pathname).toBe("/auth");
    expect(window.location.pathname).toBe("/auth");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("accepts and scrubs a legacy query token", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(String(init.body));
        if (String(input) === "/api/me") return jsonResponse(USER);
        return jsonResponse({ status: "ok" });
      })
    );
    window.history.replaceState(null, "", "/auth?token=query-token");

    render(<AuthVerifyPage />);

    await screen.findByRole("heading", { name: "You're signed in" });
    expect(bodies[0]).toBe(JSON.stringify({ token: "query-token" }));
    expect(window.location.pathname).toBe("/auth");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("renders the invalid-or-expired state on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_or_expired" }, 401))
    );
    window.history.replaceState(null, "", "/auth#token=expired");

    render(<AuthVerifyPage />);

    await screen.findByRole("heading", { name: "This sign-in link did not work" });
    expect(screen.getByRole("link", { name: "Send a new link" })).toHaveAttribute(
      "href",
      "/signin"
    );
  });

  it("renders the unavailable state on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    window.history.replaceState(null, "", "/auth#token=junk");

    render(<AuthVerifyPage />);

    await screen.findByRole("heading", { name: "Accounts aren't live yet" });
  });
});
