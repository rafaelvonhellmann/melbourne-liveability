/**
 * POST /api/auth/magic-link + POST /api/auth/verify.
 *
 * Issuance: hash-only storage, provider selection (console/Resend/none),
 * per-email AND per-IP rate limits, 503 on missing bindings.
 * Verification: single use, expiry, new-user creation, cookie attributes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, jsonResponse, makeEnv, stubFetch, type TestEnv } from "./fakes";
import {
  issueMagicLink,
  MAGIC_LINK_RATE_LIMIT,
  MAGIC_LINK_RATE_WINDOW_SECONDS,
  SESSION_COOKIE_NAME,
} from "../src/routes/auth";
import { hashToken } from "../src/lib/token";
import type { EmailProvider } from "../src/lib/email";
import type { Env } from "../src/env";

/** Direct-issuance stub for the verify tests - delivery is not under test. */
const silentProvider: EmailProvider = { async send() {} };

/** Env wired to the console (dev) email provider. */
function consoleEnv(): TestEnv {
  return makeEnv({ EMAIL_PROVIDER: "console" });
}

const TOKEN_IN_TEXT = /token=([0-9a-f-]{36})/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/magic-link", () => {
  it("202s, stores only the SHA-256 hash, emails the plaintext link", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = consoleEnv();

    const res = await call(env, "POST", "/api/auth/magic-link", {
      body: { email: "  Sam@Festra.AU " },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "sent" });

    const rows = env.DB.tables.magic_links;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.email).toBe("sam@festra.au"); // normalized before storage
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.used_at).toBeNull();
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());

    // The console dev provider is the one sanctioned plaintext-token sink.
    const emailLine = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("email_console_send"));
    expect(emailLine).toBeDefined();
    const token = TOKEN_IN_TEXT.exec(emailLine!)?.[1];
    expect(token).toBeDefined();
    expect(token).not.toBe(row.token_hash); // plaintext never persisted
    expect(await hashToken(token!)).toBe(row.token_hash);
  });

  it("400s an invalid email without issuing anything", async () => {
    const env = consoleEnv();
    const res = await call(env, "POST", "/api/auth/magic-link", {
      body: { email: "not-an-email" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_email" });
    expect(env.DB.tables.magic_links).toHaveLength(0);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "POST", "/api/auth/magic-link", {
      body: { email: "a@b.co" },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "service_unavailable", reason: "bindings" });
  });

  it("503s when no email provider is configured (misconfig is loud)", async () => {
    const res = await call(makeEnv(), "POST", "/api/auth/magic-link", {
      body: { email: "a@b.co" },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "service_unavailable",
      reason: "email_provider",
    });
  });

  it("delivers through Resend when RESEND_API_KEY is set", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = makeEnv({ RESEND_API_KEY: "re_test_123" });
    const stub = stubFetch(() => jsonResponse({ id: "email_1" }));
    try {
      const res = await call(env, "POST", "/api/auth/magic-link", {
        body: { email: "sam@festra.au" },
      });
      expect(res.status).toBe(202);

      expect(stub.calls).toHaveLength(1);
      const { url, init } = stub.calls[0]!;
      expect(url).toBe("https://api.resend.com/emails");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer re_test_123");
      const sent = JSON.parse(String(init?.body)) as { to: string[]; text: string };
      expect(sent.to).toEqual(["sam@festra.au"]);
      const token = TOKEN_IN_TEXT.exec(sent.text)?.[1];
      expect(token).toBeDefined();
      expect(await hashToken(token!)).toBe(env.DB.tables.magic_links[0]!.token_hash);
    } finally {
      stub.restore();
    }
  });

  it("429s the same email past the limit, even across rotating IPs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = consoleEnv();
    for (let i = 0; i < MAGIC_LINK_RATE_LIMIT; i++) {
      const ok = await call(env, "POST", "/api/auth/magic-link", {
        body: { email: "sam@festra.au" },
        headers: { "CF-Connecting-IP": `203.0.113.${i}` },
      });
      expect(ok.status).toBe(202);
    }

    const res = await call(env, "POST", "/api/auth/magic-link", {
      body: { email: "sam@festra.au" },
      headers: { "CF-Connecting-IP": "203.0.113.99" },
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(MAGIC_LINK_RATE_WINDOW_SECONDS);
    // the denied request issued no link
    expect(env.DB.tables.magic_links).toHaveLength(MAGIC_LINK_RATE_LIMIT);
  });

  it("429s the same IP past the limit, even across rotating emails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = consoleEnv();
    for (let i = 0; i < MAGIC_LINK_RATE_LIMIT; i++) {
      const ok = await call(env, "POST", "/api/auth/magic-link", {
        body: { email: `user${i}@festra.au` },
        headers: { "CF-Connecting-IP": "198.51.100.7" },
      });
      expect(ok.status).toBe(202);
    }

    const res = await call(env, "POST", "/api/auth/magic-link", {
      body: { email: "fresh@festra.au" },
      headers: { "CF-Connecting-IP": "198.51.100.7" },
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(env.DB.tables.magic_links).toHaveLength(MAGIC_LINK_RATE_LIMIT);
  });
});

describe("POST /api/auth/verify", () => {
  it("mints a session + new buyer user and pins the cookie attributes", async () => {
    const env = consoleEnv();
    const token = await issueMagicLink(env, "new@festra.au", silentProvider);

    const res = await call(env, "POST", "/api/auth/verify", { body: { token } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });

    const setCookie = res.headers.get("Set-Cookie")!;
    const sessionId = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie)?.[1];
    expect(sessionId).toBeDefined();
    for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Expires="]) {
      expect(setCookie).toContain(attr);
    }

    // new user created as buyer; KV is the hot path, D1 the audit mirror
    expect(env.DB.tables.users).toHaveLength(1);
    const user = env.DB.tables.users[0]!;
    expect(user.email).toBe("new@festra.au");
    expect(user.kind).toBe("buyer");
    expect(await env.SESSIONS.get(sessionId!)).toBe(user.id);
    expect(
      env.DB.tables.sessions.some((s) => s.id === sessionId && s.user_id === user.id)
    ).toBe(true);
    // link burned on first use
    expect(env.DB.tables.magic_links[0]!.used_at).not.toBeNull();
  });

  it("reuses the existing user on later verifies (no duplicate accounts)", async () => {
    const env = consoleEnv();
    const t1 = await issueMagicLink(env, "sam@festra.au", silentProvider);
    expect((await call(env, "POST", "/api/auth/verify", { body: { token: t1 } })).status).toBe(200);

    const t2 = await issueMagicLink(env, "sam@festra.au", silentProvider);
    expect((await call(env, "POST", "/api/auth/verify", { body: { token: t2 } })).status).toBe(200);

    expect(env.DB.tables.users).toHaveLength(1);
    expect(env.DB.tables.sessions).toHaveLength(2); // two sessions, one user
  });

  it("401s a reused link (single use) and mints no second session", async () => {
    const env = consoleEnv();
    const token = await issueMagicLink(env, "sam@festra.au", silentProvider);
    expect((await call(env, "POST", "/api/auth/verify", { body: { token } })).status).toBe(200);

    const replay = await call(env, "POST", "/api/auth/verify", { body: { token } });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "invalid_or_expired" });
    expect(env.DB.tables.sessions).toHaveLength(1);
  });

  it("401s an expired link and leaves it unburned", async () => {
    const env = consoleEnv();
    const token = await issueMagicLink(env, "sam@festra.au", silentProvider);
    env.DB.tables.magic_links[0]!.expires_at = new Date(Date.now() - 1000).toISOString();

    const res = await call(env, "POST", "/api/auth/verify", { body: { token } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_or_expired" });
    expect(env.DB.tables.users).toHaveLength(0); // no user minted
    expect(env.DB.tables.magic_links[0]!.used_at).toBeNull();
  });

  it("401s an unknown token; 400s a missing/empty/non-JSON one", async () => {
    const env = consoleEnv();
    const unknown = await call(env, "POST", "/api/auth/verify", {
      body: { token: crypto.randomUUID() },
    });
    expect(unknown.status).toBe(401);

    expect((await call(env, "POST", "/api/auth/verify", { body: {} })).status).toBe(400);
    expect((await call(env, "POST", "/api/auth/verify", { body: { token: "" } })).status).toBe(400);
    expect((await call(env, "POST", "/api/auth/verify", { body: "not json{" })).status).toBe(400);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "POST", "/api/auth/verify", {
      body: { token: crypto.randomUUID() },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "service_unavailable", reason: "bindings" });
  });
});
