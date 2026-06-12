/**
 * POST /api/checkout/session - Stripe Checkout via raw fetch. The pending
 * purchase row is written only AFTER Stripe accepts the session; a Stripe
 * failure is a 502 with NO orphan row.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, jsonResponse, makeEnv, seedUserWithSession, stubFetch } from "./fakes";
import type { FetchStub } from "./fakes";
import type { Env } from "../src/env";

const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_123" };
const VALID_BODY = {
  sku: "snapshot39",
  addressLabel: "  12 Example St, Kew  ",
  email: " Buyer@Example.COM ",
};

let stub: FetchStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
  vi.restoreAllMocks();
});

function stripeAccepts(): FetchStub {
  return stubFetch(() =>
    jsonResponse({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" })
  );
}

describe("POST /api/checkout/session", () => {
  it("201s {url} and writes the pending row for a guest (user_id null)", async () => {
    const env = makeEnv(STRIPE_ENV);
    stub = stripeAccepts();

    const res = await call(env, "POST", "/api/checkout/session", { body: VALID_BODY });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });

    // exactly one Stripe call, correctly formed
    expect(stub.calls).toHaveLength(1);
    const { url, init } = stub.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_test_123");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("customer_email")).toBe("buyer@example.com");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("3900");
    expect(form.get("line_items[0][price_data][currency]")).toBe("aud");
    expect(form.get("line_items[0][price_data][tax_behavior]")).toBe("inclusive"); // GST inclusive
    expect(form.get("metadata[sku]")).toBe("snapshot39");
    expect(form.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");

    // pending row snapshotted after Stripe accepted
    expect(env.DB.tables.purchases).toHaveLength(1);
    expect(env.DB.tables.purchases[0]).toMatchObject({
      status: "pending",
      sku: "snapshot39",
      email: "buyer@example.com",
      address_label: "12 Example St, Kew",
      stripe_session_id: "cs_test_1",
      user_id: null,
    });
  });

  it("links purchases.user_id when a valid session rides along", async () => {
    const env = makeEnv(STRIPE_ENV);
    const { userId, cookie } = await seedUserWithSession(env);
    stub = stripeAccepts();

    const res = await call(env, "POST", "/api/checkout/session", {
      headers: { Cookie: cookie },
      body: VALID_BODY,
    });
    expect(res.status).toBe(201);
    expect(env.DB.tables.purchases[0]!.user_id).toBe(userId);
  });

  it("prices premium59 at 5900 cents", async () => {
    const env = makeEnv(STRIPE_ENV);
    stub = stripeAccepts();
    const res = await call(env, "POST", "/api/checkout/session", {
      body: { ...VALID_BODY, sku: "premium59" },
    });
    expect(res.status).toBe(201);
    const form = new URLSearchParams(String(stub.calls[0]!.init?.body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("5900");
    expect(env.DB.tables.purchases[0]!.sku).toBe("premium59");
  });

  it("502s when Stripe rejects - and writes NO orphan row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = makeEnv(STRIPE_ENV);
    stub = stubFetch(() => jsonResponse({ error: { message: "card declined" } }, 402));

    const res = await call(env, "POST", "/api/checkout/session", { body: VALID_BODY });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "stripe_error" });
    expect(env.DB.tables.purchases).toHaveLength(0);
  });

  it("502s on a malformed Stripe response (missing id/url) - still no row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = makeEnv(STRIPE_ENV);
    stub = stubFetch(() => jsonResponse({ object: "checkout.session" })); // 200 but garbage

    const res = await call(env, "POST", "/api/checkout/session", { body: VALID_BODY });
    expect(res.status).toBe(502);
    expect(env.DB.tables.purchases).toHaveLength(0);
  });

  it("503s when STRIPE_SECRET_KEY is unset - Stripe is never called", async () => {
    const env = makeEnv(); // bindings live, secret missing
    stub = stubFetch(() => {
      throw new Error("must not be called");
    });

    const res = await call(env, "POST", "/api/checkout/session", { body: VALID_BODY });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "service_unavailable",
      reason: "stripe_secret_key",
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("validates the body before any Stripe call: 400 non-JSON, 422 per field", async () => {
    const env = makeEnv(STRIPE_ENV);
    stub = stubFetch(() => {
      throw new Error("must not be called");
    });

    expect(
      (await call(env, "POST", "/api/checkout/session", { body: "not json{" })).status
    ).toBe(400);

    const badSku = await call(env, "POST", "/api/checkout/session", {
      body: { ...VALID_BODY, sku: "premium99" },
    });
    expect(badSku.status).toBe(422);
    expect(await badSku.json()).toEqual({ error: "invalid_sku" });

    const badEmail = await call(env, "POST", "/api/checkout/session", {
      body: { ...VALID_BODY, email: "not-an-email" },
    });
    expect(badEmail.status).toBe(422);
    expect(await badEmail.json()).toEqual({ error: "invalid_email" });

    const badLabel = await call(env, "POST", "/api/checkout/session", {
      body: { ...VALID_BODY, addressLabel: "   " },
    });
    expect(badLabel.status).toBe(422);
    expect(await badLabel.json()).toEqual({ error: "invalid_address_label" });

    expect(stub.calls).toHaveLength(0);
    expect(env.DB.tables.purchases).toHaveLength(0);
  });

  it("503s when bindings are absent", async () => {
    const res = await call({} as Env, "POST", "/api/checkout/session", { body: VALID_BODY });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "service_unavailable", reason: "bindings" });
  });
});
