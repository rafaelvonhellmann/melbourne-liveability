/**
 * POST /api/checkout/session - one-off Stripe Checkout for a report SKU.
 * Prices are AUD inclusive of GST (Australian consumer pricing law: the
 * displayed price IS the paid price). Fulfilment happens exclusively in the
 * webhook (routes/stripe-webhook.ts) - a redirect back to the success URL
 * proves nothing.
 *
 * Stripe is called via raw fetch with a form-encoded body - no SDK in the
 * worker. The pending purchase row is inserted only AFTER Stripe accepts the
 * session (no orphan rows); a Stripe failure surfaces as 502.
 */

import type { Env } from "../env";
import {
  normalizeEmail,
  parseClientLabel,
  parseSku,
  type PurchaseSku,
} from "../lib/validate";
import { json, unavailable } from "../lib/http";
import { newToken } from "../lib/token";
import { logError } from "../lib/log";
import { resolveSession } from "./me";

/** Unit amounts in AUD cents, GST inclusive. The SKU name carries the dollar price. */
export const SKU_UNIT_AMOUNT_AUD_CENTS: Record<PurchaseSku, number> = {
  snapshot39: 3900,
  premium59: 5900,
};

/** Stripe line-item product names (receipt copy, not site pricing copy). */
export const SKU_PRODUCT_NAME: Record<PurchaseSku, string> = {
  snapshot39: "Festra Snapshot report",
  premium59: "Festra Premium report",
};

const STRIPE_CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";

export type CheckoutInput = {
  sku: PurchaseSku;
  /** Human-readable address the report is about; snapshotted onto the purchase row. */
  addressLabel: string;
  /** Buyer email for guest checkout; ignored when a session user exists. */
  email: string;
  /** Set when the request carries a valid session - links purchases.user_id. */
  userId?: string;
};

/** Stripe call failed or answered garbage - the handler maps this to 502. */
export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(`stripe_api_error ${status}: ${detail}`);
    this.name = "StripeApiError";
  }
}

/**
 * Create a Stripe Checkout Session, then (and only then) the pending
 * purchase row. Throws StripeApiError when Stripe fails - nothing has been
 * written at that point, so there is never an orphan pending row.
 */
export async function createCheckoutSession(
  env: Env,
  input: CheckoutInput
): Promise<{ url: string; stripeSessionId: string }> {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("stripe_secret_key_missing"); // handler 503s first

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("customer_email", input.email);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "aud");
  form.set("line_items[0][price_data][unit_amount]", String(SKU_UNIT_AMOUNT_AUD_CENTS[input.sku]));
  form.set("line_items[0][price_data][tax_behavior]", "inclusive");
  form.set("line_items[0][price_data][product_data][name]", SKU_PRODUCT_NAME[input.sku]);
  form.set("metadata[sku]", input.sku);
  form.set("metadata[address_label]", input.addressLabel);
  form.set("success_url", "https://festra.au/report?cs={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", "https://festra.au/buyer/report");

  const res = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new StripeApiError(res.status, detail.slice(0, 500));
  }
  const session = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown } | null;
  if (!session || typeof session.id !== "string" || typeof session.url !== "string") {
    throw new StripeApiError(res.status, "malformed checkout session response");
  }

  // Pending row strictly AFTER Stripe succeeded - no orphan rows.
  await env.DB.prepare(
    "INSERT INTO purchases (id, user_id, email, stripe_session_id, sku, address_label, status) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'pending')"
  )
    .bind(newToken(), input.userId ?? null, input.email, session.id, input.sku, input.addressLabel)
    .run();

  return { url: session.url, stripeSessionId: session.id };
}

/** POST /api/checkout/session - body {sku, addressLabel, email}. 201 {url}. */
export async function handleCheckoutSession(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  if (!env.STRIPE_SECRET_KEY) return unavailable("stripe_secret_key");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "invalid_json" }, 400);
  const sku = parseSku(body.sku);
  if (!sku) return json({ error: "invalid_sku" }, 422);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid_email" }, 422);
  const addressLabel = parseClientLabel(body.addressLabel);
  if (!addressLabel) return json({ error: "invalid_address_label" }, 422);

  // Optional session - guests check out by email alone.
  const userId = (await resolveSession(env, request))?.id;

  try {
    const { url } = await createCheckoutSession(env, { sku, addressLabel, email, userId });
    return json({ url }, 201);
  } catch (err) {
    logError("stripe_checkout_failed", err, { sku });
    return json({ error: "stripe_error" }, 502);
  }
}
