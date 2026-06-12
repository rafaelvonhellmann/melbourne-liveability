/**
 * GET/PUT /api/prefs - syncs the device-local mlv-user-prefs-v1 payload with
 * whole-blob last-write-wins and a stale-write 409.
 */
import { describe, expect, it } from "vitest";
import { call, makeEnv, seedUserWithSession } from "./fakes";
import { MAX_BODY_BYTES } from "../src/lib/validate";
import type { Env } from "../src/env";

const NOW = "2026-06-12T00:00:00.000Z";
const LATER = "2026-06-12T00:01:00.000Z";
const EARLIER = "2026-06-11T23:59:00.000Z";

function prefs(updatedAt: string = NOW) {
  return {
    version: 1,
    updatedAt,
    weights: { affordability: 30, transport: 18, safety: 14, health: 14 },
    interestView: "homeBuyer",
    shortlist: ["carlton", "fitzroy"],
    recent: [{ slug: "carlton", name: "Carlton", viewedAt: NOW }],
    savedChecks: [
      {
        id: "-37.80000,144.97000",
        lat: -37.8,
        lng: 144.97,
        areaName: "Carlton",
        label: "Near park",
        savedAt: NOW,
      },
    ],
    alertEmail: "buyer@festra.au",
    colorblindRamp: true,
    buyerProfile: {
      mode: "buyer",
      intent: "buy",
      household: "family",
      car: "one_car",
      commuteLabel: "CBD",
      anchors: [{ id: "a1", kind: "work", label: "Office", lng: 144.96, lat: -37.81 }],
      quiet: "high",
      transport: "medium",
      dealBreakers: ["flood", "noise"],
      updatedAt: NOW,
    },
  };
}

describe("GET /api/prefs", () => {
  it("401s without a session", async () => {
    const res = await call(makeEnv(), "GET", "/api/prefs");
    expect(res.status).toBe(401);
  });

  it("204s when nothing is stored", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const res = await call(env, "GET", "/api/prefs", { headers: { Cookie: cookie } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("204s when the stored payload is corrupt JSON", async () => {
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env);
    env.DB.tables.prefs.push({ user_id: userId, payload: "{not json", updated_at: NOW });
    const res = await call(env, "GET", "/api/prefs", { headers: { Cookie: cookie } });
    expect(res.status).toBe(204);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "GET", "/api/prefs");
    expect(res.status).toBe(503);
  });
});

describe("PUT /api/prefs", () => {
  it("sanitizes a prefs record and round-trips it through GET", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);

    const res = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie },
      body: {
        ...prefs(),
        shortlist: [" carlton ", 42, "fitzroy"],
        recent: [
          { slug: " carlton ", name: " Carlton ", viewedAt: NOW },
          { slug: "bad", name: "Bad", viewedAt: "today" },
        ],
        weights: { affordability: -1, transport: 70, greenSpace: 50 },
        alertEmail: "  Buyer@Festra.AU ",
        personaId: "family",
        junk: true,
      },
    });
    expect(res.status).toBe(200);
    const echoed = (await res.json()) as Record<string, unknown>;
    expect(echoed).toMatchObject({
      version: 1,
      updatedAt: NOW,
      weights: { affordability: 0, transport: 60 },
      interestView: "homeBuyer",
      shortlist: ["carlton", "fitzroy"],
      recent: [{ slug: "carlton", name: "Carlton", viewedAt: NOW }],
      alertEmail: "buyer@festra.au",
    });
    expect(echoed).not.toHaveProperty("personaId");
    expect(echoed).not.toHaveProperty("junk");

    const got = await call(env, "GET", "/api/prefs", { headers: { Cookie: cookie } });
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(echoed);
  });

  it("409s stale writes with the server payload and accepts equal timestamps", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);

    const first = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie },
      body: prefs(LATER),
    });
    expect(first.status).toBe(200);
    const server = await first.json();

    const stale = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie },
      body: { ...prefs(EARLIER), shortlist: ["stale"] },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "stale", server });

    const equal = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie },
      body: { ...prefs(LATER), shortlist: ["equal-wins"] },
    });
    expect(equal.status).toBe(200);
    expect(((await equal.json()) as { shortlist: string[] }).shortlist).toEqual(["equal-wins"]);
  });

  it("422s wholesale-invalid records and 400s non-JSON; nothing is stored", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const headers = { Cookie: cookie };

    const wrongVersion = await call(env, "PUT", "/api/prefs", {
      headers,
      body: { ...prefs(), version: 2 },
    });
    expect(wrongVersion.status).toBe(422);
    expect(await wrongVersion.json()).toEqual({ error: "invalid_prefs" });

    const missingUpdatedAt = await call(env, "PUT", "/api/prefs", {
      headers,
      body: { version: 1, shortlist: [] },
    });
    expect(missingUpdatedAt.status).toBe(422);

    const notJson = await call(env, "PUT", "/api/prefs", { headers, body: "not json{" });
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "invalid_json" });

    expect(env.DB.tables.prefs).toHaveLength(0);
  });

  it("413s a body over 64KB before parsing", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const res = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...prefs(),
        shortlist: ["x".repeat(MAX_BODY_BYTES)],
      }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("429s the 13th prefs write in a minute", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const body = prefs();
    for (let i = 0; i < 12; i++) {
      const ok = await call(env, "PUT", "/api/prefs", { headers: { Cookie: cookie }, body });
      expect(ok.status).toBe(200);
    }

    const limited = await call(env, "PUT", "/api/prefs", {
      headers: { Cookie: cookie },
      body,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("401s without a session; 503s without bindings", async () => {
    const unauth = await call(makeEnv(), "PUT", "/api/prefs", { body: prefs() });
    expect(unauth.status).toBe(401);

    const res = await call({} as Env, "PUT", "/api/prefs", { body: prefs() });
    expect(res.status).toBe(503);
  });
});
