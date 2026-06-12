/**
 * GET /api/me (the shared session gate) + POST /api/auth/logout.
 */
import { describe, expect, it } from "vitest";
import { call, makeEnv, seedUserWithSession } from "./fakes";
import { SESSION_COOKIE_NAME } from "../src/routes/auth";
import type { Env } from "../src/env";

describe("GET /api/me", () => {
  it("200s the session's user record", async () => {
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env, {
      email: "sam@festra.au",
      kind: "agent",
    });

    const res = await call(env, "GET", "/api/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: userId,
      email: "sam@festra.au",
      kind: "agent",
      createdAt: expect.any(String),
    });
  });

  it("401s without a cookie", async () => {
    const res = await call(makeEnv(), "GET", "/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("401s an unknown session id", async () => {
    const env = makeEnv();
    await seedUserWithSession(env);
    const res = await call(env, "GET", "/api/me", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${crypto.randomUUID()}` },
    });
    expect(res.status).toBe(401);
  });

  it("401s duplicate session-cookie values", async () => {
    const env = makeEnv();
    const { cookie, sessionId } = await seedUserWithSession(env);
    const res = await call(env, "GET", "/api/me", {
      headers: { Cookie: `${cookie}; theme=light; ${SESSION_COOKIE_NAME}=${sessionId}` },
    });
    expect(res.status).toBe(401);
  });

  it("401s once the KV session TTL has elapsed", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    env.SESSIONS.advance(30 * 86_400 + 1); // one second past the 30-day TTL
    const res = await call(env, "GET", "/api/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(401);
  });

  it("401s when the stored user kind has drifted out of the enum", async () => {
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env);
    env.DB.tables.users.find((u) => u.id === userId)!.kind = "admin"; // future-build drift
    const res = await call(env, "GET", "/api/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(401);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "GET", "/api/me");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "service_unavailable", reason: "bindings" });
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the KV session, keeps the D1 audit row, clears the cookie", async () => {
    const env = makeEnv();
    const { cookie, sessionId } = await seedUserWithSession(env);

    const res = await call(env, "POST", "/api/auth/logout", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });

    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");

    expect(await env.SESSIONS.get(sessionId)).toBeNull(); // hot path gone
    expect(env.DB.tables.sessions.some((s) => s.id === sessionId)).toBe(true); // audit stays
    expect((await call(env, "GET", "/api/me", { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it("is idempotent: 200 with no cookie at all", async () => {
    const res = await call(makeEnv(), "POST", "/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
