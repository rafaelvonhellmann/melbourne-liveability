import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends relative API calls with credentials and returns JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch<{ ok: boolean }>("/api/me", { method: "GET" })
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
  });

  it("normalizes a 401 API error from the JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401)));

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    } satisfies Partial<ApiError>);
  });

  it("keeps the parsed error body for callers that need stale payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "stale", server: { version: 1, updatedAt: "t" } }, 409)
      )
    );

    await expect(apiFetch("/api/prefs")).rejects.toMatchObject({
      status: 409,
      code: "stale",
      body: { error: "stale", server: { version: 1, updatedAt: "t" } },
    } satisfies Partial<ApiError>);
  });

  it("normalizes 503 as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "bindings" }, 503)));

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    } satisfies Partial<ApiError>);
  });

  it("normalizes fetch rejection as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      status: 0,
      code: "network",
    } satisfies Partial<ApiError>);
  });
});
