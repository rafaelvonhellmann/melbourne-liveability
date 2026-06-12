/**
 * Dispatch-level behaviour through the worker's fetch handler - routing,
 * CORS, preflight, the opaque 500 guard and the session-cookie attribute
 * pins. Per-route behaviour lives in the sibling *.test.ts files; this file
 * stays at the surface.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, makeEnv, seedUserWithSession } from "./fakes";
import { clearSessionCookie, sessionCookie, SESSION_COOKIE_NAME } from "../src/routes/auth";
import type { Env } from "../src/env";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers 200 {ok:true} with no bindings at all", async () => {
    const res = await call({} as Env, "GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("worker fetch dispatch", () => {
  it("404s unknown paths", async () => {
    const res = await call(makeEnv(), "GET", "/api/unknown");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("405s wrong verbs on known paths with an Allow header", async () => {
    const res = await call(makeEnv(), "DELETE", "/api/profile");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PUT");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("answers OPTIONS preflight for known paths with allowed origin", async () => {
    const res = await call(makeEnv(), "OPTIONS", "/api/profile", {
      headers: { Origin: "https://festra.au" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://festra.au");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("OPTIONS on an unknown path falls through to 404 (no surface mapping gap)", async () => {
    const res = await call(makeEnv(), "OPTIONS", "/api/unknown", {
      headers: { Origin: "https://festra.au" },
    });
    expect(res.status).toBe(404);
  });

  it("adds CORS headers to responses for allowed origins", async () => {
    const res = await call(makeEnv(), "GET", "/api/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("withholds CORS headers from disallowed origins", async () => {
    const res = await call(makeEnv(), "GET", "/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(200); // same-origin/server callers still work
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("unhandled handler errors", () => {
  it("500s with an opaque envelope: requestId out, stack stays at the log sink", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    env.SESSIONS.get = async () => {
      throw new Error("kv exploded");
    };

    const res = await call(env, "GET", "/api/me", {
      headers: { Cookie: cookie, Origin: "https://festra.au" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toBe("internal");
    expect(typeof body.requestId).toBe("string");
    expect(JSON.stringify(body)).not.toContain("kv exploded");
    // the 500 still rides CORS for the allowed origin; the stack was logged
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://festra.au");
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("session cookies", () => {
  it("sessionCookie pins the security attributes: HttpOnly, Secure, SameSite=Lax, Path=/", () => {
    const expires = new Date("2026-07-12T00:00:00.000Z");
    const cookie = sessionCookie("abc-123", expires);
    expect(cookie).toBe(
      `${SESSION_COOKIE_NAME}=abc-123; HttpOnly; Secure; SameSite=Lax; Path=/; ` +
        `Expires=${expires.toUTCString()}`
    );
  });

  it("clearSessionCookie expires the cookie with the same attribute set", () => {
    expect(clearSessionCookie()).toBe(
      `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; ` +
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });
});
