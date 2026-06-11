/**
 * POST /api/checkout/session - one-off Stripe Checkout for a report SKU.
 * Prices are AUD inclusive of GST (Australian consumer pricing law: the
 * displayed price IS the paid price). Fulfilment happens exclusively in the
 * webhook (routes/stripe-webhook.ts) - a redirect back to the success URL
 * proves nothing.
 */

import type { Env } from "../env";
import type { PurchaseSku } from "../lib/validate";
import { comingSoon } from "../lib/http";

/** Unit amounts in AUD cents, GST inclusive. The SKU name carries the dollar price. */
export const SKU_UNIT_AMOUNT_AUD_CENTS: Record<PurchaseSku, number> = {
  snapshot39: 3900,
  premium59: 5900,
};

export type CheckoutInput = {
  sku: PurchaseSku;
  /** Human-readable address the report is about; snapshotted onto the purchase row. */
  addressLabel: string;
  /** Buyer email for guest checkout; ignored when a session user exists. */
  email: string;
  /** Set when the request carries a valid session - links purchases.user_id. */
  userId?: string;
};

/**
 * Create a Stripe Checkout Session and the pending purchase row.
 *
 * Intended implementation (fetch-based - no Stripe SDK in the worker):
 *  - POST https://api.stripe.com/v1/checkout/sessions with
 *    Authorization: Bearer env.STRIPE_SECRET_KEY (501 if unset) and a
 *    form-encoded body: mode=payment, currency=aud,
 *    line_items[0][price_data][unit_amount]=SKU_UNIT_AMOUNT_AUD_CENTS[sku],
 *    line_items[0][price_data][tax_behavior]=inclusive,
 *    customer_email, metadata[sku], metadata[address_label],
 *    success_url=https://festra.au/report?cs={CHECKOUT_SESSION_ID},
 *    cancel_url=https://festra.au/buyer/report
 *  - INSERT INTO purchases (id, user_id, email, stripe_session_id, sku,
 *    address_label, status) VALUES (..., 'pending')
 *  - return the session URL for the client redirect
 */
export async function createCheckoutSession(
  _env: Env,
  _input: CheckoutInput
): Promise<{ url: string; stripeSessionId: string }> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/** POST /api/checkout/session - body {sku, addressLabel, email}. */
export async function handleCheckoutSession(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - body = await request.json()
  //  - sku = parseSku(body.sku); 422 when null (enum drift guard)
  //  - email = normalizeEmail(body.email); 422 when null
  //  - addressLabel = parseClientLabel(body.addressLabel); 422 when null
  //  - userId = (await resolveSession(env, request))?.id  (optional - guests allowed)
  //  - { url } = await createCheckoutSession(env, { sku, addressLabel, email, userId })
  //  - return json({ url }, 201)
  return comingSoon();
}
