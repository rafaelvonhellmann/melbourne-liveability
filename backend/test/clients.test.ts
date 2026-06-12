/**
 * POST /api/clients - agent-only sub-profiles with the 30-cap roll-off
 * (mirrors the device-local addClient in lib/user-profile.ts).
 */
import { describe, expect, it } from "vitest";
import { call, makeEnv, seedUserWithSession } from "./fakes";
import { MAX_BODY_BYTES, MAX_CLIENTS } from "../src/lib/validate";
import type { Env } from "../src/env";

describe("POST /api/clients", () => {
  it("401s without a session", async () => {
    const res = await call(makeEnv(), "POST", "/api/clients", { body: { label: "A Client" } });
    expect(res.status).toBe(401);
  });

  it("403s buyers - the buyer-has-no-clients rule holds server-side", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "buyer" });
    const res = await call(env, "POST", "/api/clients", {
      headers: { Cookie: cookie },
      body: { label: "A Client" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "agents_only" });
    expect(env.DB.tables.clients).toHaveLength(0);
  });

  it("201s an agent's client with the trimmed, capped label", async () => {
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env, { kind: "agent" });
    const res = await call(env, "POST", "/api/clients", {
      headers: { Cookie: cookie },
      body: { label: `  12 Example St ${"y".repeat(100)}` }, // over the 80-char cap
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      userId: string;
      label: string;
      createdAt: string;
    };
    expect(body.userId).toBe(userId);
    expect(body.label.length).toBe(80);
    expect(body.label.startsWith("12 Example St")).toBe(true);
    expect(env.DB.tables.clients).toHaveLength(1);
    expect(env.DB.tables.clients[0]!.label).toBe(body.label);
  });

  it("422s an unusable label", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "agent" });
    const headers = { Cookie: cookie };
    for (const body of [{ label: "   " }, { label: 42 }, {}]) {
      const res = await call(env, "POST", "/api/clients", { headers, body });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: "invalid_label" });
    }
    expect(env.DB.tables.clients).toHaveLength(0);
  });

  it("413s a body over 64KB before parsing", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "agent" });
    const res = await call(env, "POST", "/api/clients", {
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "x".repeat(MAX_BODY_BYTES) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("429s the 6th client write in a minute", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "agent" });
    for (let i = 0; i < 5; i++) {
      const ok = await call(env, "POST", "/api/clients", {
        headers: { Cookie: cookie },
        body: { label: `client ${i}` },
      });
      expect(ok.status).toBe(201);
    }

    const limited = await call(env, "POST", "/api/clients", {
      headers: { Cookie: cookie },
      body: { label: "client 6" },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("caps a user at MAX_CLIENTS (30), rolling the oldest off - other agents untouched", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "agent", email: "a@festra.au" });
    // a second agent whose client must survive the first agent's roll-off
    const otherId = crypto.randomUUID();
    env.DB.tables.clients.push({
      rowid: 9999,
      id: crypto.randomUUID(),
      user_id: otherId,
      label: "other agent's client",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    for (let i = 1; i <= MAX_CLIENTS + 1; i++) {
      if (i > 1 && (i - 1) % 5 === 0) env.SESSIONS.advance(61);
      const res = await call(env, "POST", "/api/clients", {
        headers: { Cookie: cookie },
        body: { label: `client ${i}` },
      });
      expect(res.status).toBe(201);
    }

    const mine = env.DB.tables.clients.filter((c) => c.user_id !== otherId);
    const labels = mine.map((c) => c.label);
    expect(labels).toHaveLength(MAX_CLIENTS);
    expect(labels).not.toContain("client 1"); // oldest rolled off
    expect(labels).toContain("client 2");
    expect(labels).toContain(`client ${MAX_CLIENTS + 1}`);
    expect(env.DB.tables.clients.some((c) => c.user_id === otherId)).toBe(true);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "POST", "/api/clients", { body: { label: "A Client" } });
    expect(res.status).toBe(503);
  });
});
