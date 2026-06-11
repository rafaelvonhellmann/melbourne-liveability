/**
 * End-to-end dispatch through the worker's fetch handler - pure node, no
 * workers runtime. Bindings are never touched pre-cutover (every handler
 * short-circuits to comingSoon / health), so an empty Env cast is honest.
 */
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { comingSoon } from "../src/lib/http";
import { sessionCookie, SESSION_COOKIE_NAME } from "../src/routes/auth";
import type { Env } from "../src/env";

const env = {} as Env;
const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

function call(method: string, path: string, headers?: HeadersInit): Promise<Response> {
  return worker.fetch(new Request(`https://api.festra.au${path}`, { method, headers }), env, ctx);
}

const COMING_SOON_ROUTES: Array<[string, string]> = [
  ["POST", "/api/auth/magic-link"],
  ["POST", "/api/auth/verify"],
  ["GET", "/api/me"],
  ["GET", "/api/profile"],
  ["PUT", "/api/profile"],
  ["POST", "/api/clients"],
  ["POST", "/api/checkout/session"],
  ["POST", "/api/webhooks/stripe"],
];

describe("GET /api/health", () => {
  it("is the one live route: 200 {ok:true}", async () => {
    const res = await call("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("pre-cutover coming_soon envelope", () => {
  it.each(COMING_SOON_ROUTES)("%s %s -> 501 coming_soon", async (method, path) => {
    const res = await call(method, path);
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ status: "coming_soon", launch: "festra.au" });
  });

  it("comingSoon() mints the exact envelope", async () => {
    const res = comingSoon();
    expect(res.status).toBe(501);
    expect(await res.text()).toBe('{"status":"coming_soon","launch":"festra.au"}');
  });
});

describe("worker fetch dispatch", () => {
  it("404s unknown paths", async () => {
    const res = await call("GET", "/api/unknown");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("405s wrong verbs on known paths", async () => {
    const res = await call("DELETE", "/api/profile");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PUT");
  });

  it("answers OPTIONS preflight for known paths with allowed origin", async () => {
    const res = await call("OPTIONS", "/api/profile", { Origin: "https://festra.au" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://festra.au");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("OPTIONS on an unknown path falls through to 404 (no surface mapping gap)", async () => {
    const res = await call("OPTIONS", "/api/unknown", { Origin: "https://festra.au" });
    expect(res.status).toBe(404);
  });

  it("adds CORS headers to responses for allowed origins", async () => {
    const res = await call("GET", "/api/health", { Origin: "http://localhost:3000" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("withholds CORS headers from disallowed origins", async () => {
    const res = await call("GET", "/api/health", { Origin: "https://evil.example" });
    expect(res.status).toBe(200); // same-origin/server callers still work
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("sessionCookie", () => {
  it("pins the security attributes: HttpOnly, Secure, SameSite=Lax, Path=/", () => {
    const expires = new Date("2026-07-11T00:00:00.000Z");
    const cookie = sessionCookie("abc-123", expires);
    expect(cookie).toBe(
      `${SESSION_COOKIE_NAME}=abc-123; HttpOnly; Secure; SameSite=Lax; Path=/; ` +
        `Expires=${expires.toUTCString()}`
    );
  });
});
