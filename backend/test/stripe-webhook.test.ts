/**
 * POST /api/webhooks/stripe - signature-gated, idempotent status writer.
 * Signatures are computed with the same WebCrypto HMAC the verifier uses,
 * so these tests exercise real verification, not a mocked-out gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, makeEnv, type TestEnv } from "./fakes";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from "../src/routes/stripe-webhook";
import { toHex } from "../src/lib/token";
import type { Env } from "../src/env";

const SECRET = "whsec_test_secret";
const WEBHOOK_ENV = { STRIPE_WEBHOOK_SECRET: SECRET };

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(mac));
}

/** Stripe-shaped signature header over the exact body bytes. */
async function signedHeaders(
  body: string,
  opts: { secret?: string; t?: number } = {}
): Promise<Record<string, string>> {
  const t = opts.t ?? Math.floor(Date.now() / 1000);
  const v1 = await hmacHex(`${t}.${body}`, opts.secret ?? SECRET);
  return { "stripe-signature": `t=${t},v1=${v1}` };
}

function eventBody(type: string, id: string): string {
  return JSON.stringify({ type, data: { object: { id } } });
}

function seedPurchase(env: TestEnv, stripeSessionId: string, status = "pending"): void {
  env.DB.tables.purchases.push({
    id: crypto.randomUUID(),
    user_id: null,
    email: "buyer@example.com",
    stripe_session_id: stripeSessionId,
    sku: "snapshot39",
    address_label: "12 Example St",
    status,
    created_at: new Date().toISOString(),
  });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}); // logEvent noise
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("400s a missing signature header", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body: eventBody("checkout.session.completed", "cs_1"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_signature" });
  });

  it("403s a wrong-secret signature and leaves the purchase pending", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    seedPurchase(env, "cs_1");
    const body = eventBody("checkout.session.completed", "cs_1");

    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body, { secret: "whsec_wrong" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
    expect(env.DB.tables.purchases[0]!.status).toBe("pending");
  });

  it("403s a stale timestamp outside the 300s tolerance", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    seedPurchase(env, "cs_1");
    const body = eventBody("checkout.session.completed", "cs_1");
    const stale = Math.floor(Date.now() / 1000) - (SIGNATURE_TOLERANCE_SECONDS + 60);

    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body, { t: stale }), // correctly signed, too old
    });
    expect(res.status).toBe(403);
    expect(env.DB.tables.purchases[0]!.status).toBe("pending");
  });

  it("completed flips pending -> paid and a replay is a 200 no-op", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    seedPurchase(env, "cs_1");
    const body = eventBody("checkout.session.completed", "cs_1");

    const first = await call(env, "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true });
    expect(env.DB.tables.purchases[0]!.status).toBe("paid");

    // replay: 200 (so Stripe stops retrying), zero rows changed
    const replay = await call(env, "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body),
    });
    expect(replay.status).toBe(200);
    expect(env.DB.tables.purchases).toHaveLength(1);
    expect(env.DB.tables.purchases[0]!.status).toBe("paid");
  });

  it("expired flips pending -> failed; a late completed cannot resurrect it", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    seedPurchase(env, "cs_2");

    const expired = eventBody("checkout.session.expired", "cs_2");
    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body: expired,
      headers: await signedHeaders(expired),
    });
    expect(res.status).toBe(200);
    expect(env.DB.tables.purchases[0]!.status).toBe("failed");

    // out-of-order completed after the session already expired: no-op
    const completed = eventBody("checkout.session.completed", "cs_2");
    const late = await call(env, "POST", "/api/webhooks/stripe", {
      body: completed,
      headers: await signedHeaders(completed),
    });
    expect(late.status).toBe(200);
    expect(env.DB.tables.purchases[0]!.status).toBe("failed");
  });

  it("200s and ignores unrelated event types without touching rows", async () => {
    const env = makeEnv(WEBHOOK_ENV);
    seedPurchase(env, "cs_1");
    const body = eventBody("invoice.paid", "cs_1");

    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body),
    });
    expect(res.status).toBe(200);
    expect(env.DB.tables.purchases[0]!.status).toBe("pending");
  });

  it("400s a signed event with no object id, and signed non-JSON", async () => {
    const env = makeEnv(WEBHOOK_ENV);

    const noId = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const res = await call(env, "POST", "/api/webhooks/stripe", {
      body: noId,
      headers: await signedHeaders(noId),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "malformed_event" });

    const notJson = "{not json";
    const res2 = await call(env, "POST", "/api/webhooks/stripe", {
      body: notJson,
      headers: await signedHeaders(notJson),
    });
    expect(res2.status).toBe(400);
    expect(await res2.json()).toEqual({ error: "invalid_json" });
  });

  it("503s when the webhook secret or the DB binding is missing", async () => {
    const body = eventBody("checkout.session.completed", "cs_1");

    const noSecret = await call(makeEnv(), "POST", "/api/webhooks/stripe", {
      body,
      headers: await signedHeaders(body),
    });
    expect(noSecret.status).toBe(503);
    expect(await noSecret.json()).toEqual({
      error: "service_unavailable",
      reason: "stripe_webhook_secret",
    });

    const noDb = await call({} as Env, "POST", "/api/webhooks/stripe", { body });
    expect(noDb.status).toBe(503);
    expect(await noDb.json()).toEqual({ error: "service_unavailable", reason: "bindings" });
  });
});

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const now = 1_750_000_000;

  it("accepts exactly at tolerance, rejects one second past it", async () => {
    const atEdge = now - SIGNATURE_TOLERANCE_SECONDS;
    const v1 = await hmacHex(`${atEdge}.${body}`, SECRET);
    expect(await verifyStripeSignature(body, `t=${atEdge},v1=${v1}`, SECRET, now)).toBe(true);

    const past = now - SIGNATURE_TOLERANCE_SECONDS - 1;
    const v2 = await hmacHex(`${past}.${body}`, SECRET);
    expect(await verifyStripeSignature(body, `t=${past},v1=${v2}`, SECRET, now)).toBe(false);
  });

  it("rejects future-dated timestamps past tolerance", async () => {
    const future = now + SIGNATURE_TOLERANCE_SECONDS + 1;
    const v1 = await hmacHex(`${future}.${body}`, SECRET);
    expect(await verifyStripeSignature(body, `t=${future},v1=${v1}`, SECRET, now)).toBe(false);
  });

  it("accepts when ANY v1 candidate matches (key rotation)", async () => {
    const v1 = await hmacHex(`${now}.${body}`, SECRET);
    const header = `t=${now},v1=${"0".repeat(64)},v1=${v1}`;
    expect(await verifyStripeSignature(body, header, SECRET, now)).toBe(true);
  });

  it("rejects tampered bodies and garbage headers", async () => {
    const v1 = await hmacHex(`${now}.${body}`, SECRET);
    expect(await verifyStripeSignature(body + " ", `t=${now},v1=${v1}`, SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, "", SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, `v1=${v1}`, SECRET, now)).toBe(false); // no t
    expect(await verifyStripeSignature(body, `t=${now}`, SECRET, now)).toBe(false); // no v1
  });
});
