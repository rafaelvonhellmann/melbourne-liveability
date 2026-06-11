/**
 * POST /api/webhooks/stripe - the ONLY writer of purchases.status and the
 * trigger for report generation. Called by Stripe, not by browsers, so it
 * sits outside the CORS story and MUST authenticate every request by
 * signature - never by source IP, never by obscurity.
 */

import type { Env } from "../env";
import { comingSoon } from "../lib/http";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";
/** Reject events older than this - replay window per Stripe's guidance. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verify a Stripe webhook signature.
 *
 * Intended implementation (pure WebCrypto - no Stripe SDK):
 *  - parse header "t=<unix>,v1=<hex>[,v1=...]"
 *  - reject when |now - t| > SIGNATURE_TOLERANCE_SECONDS
 *  - expected = hex(HMAC-SHA256(secret, `${t}.${rawBody}`)) via
 *    crypto.subtle.importKey("raw", ...)/sign
 *  - compare against EVERY v1 candidate with constantTimeEqual
 *    (src/lib/token.ts); any match passes
 */
export async function verifyStripeSignature(
  _rawBody: string,
  _signatureHeader: string,
  _secret: string,
  _nowSeconds?: number
): Promise<boolean> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/**
 * Apply a verified checkout.session.completed event.
 *
 * Intended implementation:
 *  - UPDATE purchases SET status = 'paid'
 *    WHERE stripe_session_id = ? AND status = 'pending'
 *    (idempotent: replays and out-of-order deliveries change zero rows)
 *  - generate the report artifact, env.REPORTS.put(r2Key, body)
 *  - INSERT INTO report_artifacts (id, purchase_id, r2_key, expires_at)
 *  - email the download link (ctx.waitUntil - never block the 200 to Stripe)
 */
export async function applyCheckoutCompleted(
  _env: Env,
  _stripeSessionId: string
): Promise<void> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/** POST /api/webhooks/stripe - raw body + stripe-signature header. */
export async function handleStripeWebhook(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - 503 if !env.STRIPE_WEBHOOK_SECRET (misconfig must be loud, not open)
  //  - rawBody = await request.text()  (BEFORE any JSON.parse - the
  //    signature covers the exact bytes)
  //  - sig = request.headers.get(STRIPE_SIGNATURE_HEADER); 400 when missing
  //  - !await verifyStripeSignature(rawBody, sig, secret) -> 401
  //  - event = JSON.parse(rawBody); switch (event.type):
  //      checkout.session.completed -> applyCheckoutCompleted(env, event.data.object.id)
  //      checkout.session.expired   -> mark purchase 'failed'
  //      default                    -> acknowledge and ignore
  //  - return json({ received: true })  (200 fast; Stripe retries non-2xx)
  return comingSoon();
}
