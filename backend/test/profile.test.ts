/**
 * GET/PUT /api/profile - sanitize-on-write, sanitize-on-read, and the
 * users.kind follow-the-profile flip. The payload shape mirrors the
 * device-local festra-profile-v1 record.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, makeEnv, seedUserWithSession } from "./fakes";
import type { Env } from "../src/env";

const NOW = "2026-06-12T00:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/profile", () => {
  it("401s without a session", async () => {
    const res = await call(makeEnv(), "GET", "/api/profile");
    expect(res.status).toBe(401);
  });

  it("204s when nothing is stored", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const res = await call(env, "GET", "/api/profile", { headers: { Cookie: cookie } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("204s when the stored payload is corrupt JSON (reads as null, never throws)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env);
    env.DB.tables.profiles.push({ user_id: userId, payload: "{not json", updated_at: NOW });
    const res = await call(env, "GET", "/api/profile", { headers: { Cookie: cookie } });
    expect(res.status).toBe(204);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "GET", "/api/profile");
    expect(res.status).toBe(503);
  });
});

describe("PUT /api/profile", () => {
  it("sanitizes a buyer record and round-trips it through GET", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);

    const res = await call(env, "PUT", "/api/profile", {
      headers: { Cookie: cookie },
      body: {
        version: 1,
        type: "buyer",
        name: `  Sam ${"x".repeat(200)}`, // padded + over the 80-char cap
        createdAt: NOW,
        clients: [{ id: "c1", label: "sneaky", createdAt: NOW }], // buyers carry no clients
        activeClientId: "c1",
        junk: true, // unknown field dropped
      },
    });
    expect(res.status).toBe(200);
    const echoed = (await res.json()) as Record<string, unknown>;
    expect(echoed.version).toBe(1);
    expect(echoed.type).toBe("buyer");
    expect(echoed.createdAt).toBe(NOW);
    expect((echoed.name as string).length).toBeLessThanOrEqual(80);
    expect(echoed.name).toMatch(/^Sam x+$/);
    expect(echoed).not.toHaveProperty("clients");
    expect(echoed).not.toHaveProperty("activeClientId");
    expect(echoed).not.toHaveProperty("junk");

    // the device converges on exactly what was stored
    const got = await call(env, "GET", "/api/profile", { headers: { Cookie: cookie } });
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(echoed);
  });

  it("sanitizes an agent record: dedupes clients, fixes a dangling activeClientId", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env, { kind: "agent" });

    const res = await call(env, "PUT", "/api/profile", {
      headers: { Cookie: cookie },
      body: {
        version: 1,
        type: "agent",
        createdAt: NOW,
        clients: [
          { id: "c1", label: " First Client ", createdAt: NOW },
          { id: "c1", label: "duplicate id", createdAt: NOW }, // dropped
          { id: "c2", label: 42 }, // non-string label -> dropped
          { id: "", label: "no id" }, // dropped
          { id: "c3", label: "Third" }, // missing createdAt -> filled
        ],
        activeClientId: "ghost", // dangling -> first client
      },
    });
    expect(res.status).toBe(200);
    const echoed = (await res.json()) as {
      clients: Array<{ id: string; label: string; createdAt: string }>;
      activeClientId: string;
    };
    expect(echoed.clients.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(echoed.clients[0]!.label).toBe("First Client");
    expect(typeof echoed.clients[1]!.createdAt).toBe("string");
    expect(echoed.activeClientId).toBe("c1");

    const got = await call(env, "GET", "/api/profile", { headers: { Cookie: cookie } });
    expect(await got.json()).toEqual(echoed);
  });

  it("flips users.kind to follow the synced profile type", async () => {
    const env = makeEnv();
    const { userId, cookie } = await seedUserWithSession(env, { kind: "buyer" });

    const res = await call(env, "PUT", "/api/profile", {
      headers: { Cookie: cookie },
      body: { version: 1, type: "agent", createdAt: NOW },
    });
    expect(res.status).toBe(200);
    expect(env.DB.tables.users.find((u) => u.id === userId)!.kind).toBe("agent");

    const me = await call(env, "GET", "/api/me", { headers: { Cookie: cookie } });
    expect(((await me.json()) as { kind: string }).kind).toBe("agent");
  });

  it("422s wholesale-invalid records and 400s non-JSON; nothing is stored", async () => {
    const env = makeEnv();
    const { cookie } = await seedUserWithSession(env);
    const headers = { Cookie: cookie };

    const wrongVersion = await call(env, "PUT", "/api/profile", {
      headers,
      body: { version: 2, type: "buyer", createdAt: NOW },
    });
    expect(wrongVersion.status).toBe(422);
    expect(await wrongVersion.json()).toEqual({ error: "invalid_profile" });

    const unknownType = await call(env, "PUT", "/api/profile", {
      headers,
      body: { version: 1, type: "admin", createdAt: NOW },
    });
    expect(unknownType.status).toBe(422);

    const notJson = await call(env, "PUT", "/api/profile", { headers, body: "not json{" });
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "invalid_json" });

    expect(env.DB.tables.profiles).toHaveLength(0);
  });

  it("401s without a session; 503s without bindings", async () => {
    const env = makeEnv();
    const unauth = await call(env, "PUT", "/api/profile", {
      body: { version: 1, type: "buyer", createdAt: NOW },
    });
    expect(unauth.status).toBe(401);

    const res = await call({} as Env, "PUT", "/api/profile", {
      body: { version: 1, type: "buyer", createdAt: NOW },
    });
    expect(res.status).toBe(503);
  });
});
