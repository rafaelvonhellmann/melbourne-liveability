/**
 * POST /api/webhooks/stripe - the ONLY writer of purchases.status and the
 * trigger for report generation. Called by Stripe, not by browsers, so it
 * sits outside the CORS story and MUST authenticate every request by
 * signature - never by source IP, never by obscurity.
 *
 * Status updates are idempotent (WHERE ... AND status = 'pending'): replays
 * and out-of-order deliveries change zero rows and still 200.
 */

import type { Env } from "../env";
import { json, unavailable } from "../lib/http";
import { constantTimeEqual, toHex } from "../lib/token";
import { logEvent } from "../lib/log";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";
/** Reject events older than this - replay window per Stripe's guidance. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

/**
 * Verify a Stripe webhook signature (pure WebCrypto - no Stripe SDK).
 * Header shape: "t=<unix>,v1=<hex>[,v1=...]". Every v1 candidate is checked
 * with constantTimeEqual; any match passes. `nowSeconds` is injectable for
 * tests; defaults to the current clock.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const t = Number(value);
      if (Number.isFinite(t)) timestamp = t;
    } else if (key === "v1" && value.length > 0) {
      candidates.push(value.toLowerCase());
    }
  }
  if (timestamp === null || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(new Uint8Array(mac));

  // Walk every candidate (no early exit) and compare in constant time.
  let ok = false;
  for (const candidate of candidates) {
    ok = constantTimeEqual(expected, candidate) || ok;
  }
  return ok;
}

/**
 * Apply a verified checkout.session.completed event. Idempotent: the
 * `status = 'pending'` guard makes replays change zero rows. Returns whether
 * a row actually flipped.
 *
 * KNOWN GAP (logged as report_generation_pending): the R2 report artifact
 * pipeline (generate -> REPORTS.put -> report_artifacts row -> email link)
 * is a later wave. Until then a paid purchase is recorded but no artifact is
 * produced.
 */
export async function applyCheckoutCompleted(
  env: Env,
  stripeSessionId: string
): Promise<boolean> {
  const res = await env.DB.prepare(
    "UPDATE purchases SET status = 'paid' WHERE stripe_session_id = ? AND status = 'pending'"
  )
    .bind(stripeSessionId)
    .run();
  const changed = Number(res.meta["changes"] ?? 0) > 0;
  if (changed) {
    // TODO(report-pipeline): generate the artifact into env.REPORTS, insert
    // report_artifacts, email the download link (ctx.waitUntil).
    logEvent("report_generation_pending", {
      stripeSessionId,
      gap: "r2_artifact_pipeline_not_built",
    });
  }
  return changed;
}

/** Apply checkout.session.expired: pending -> failed, same idempotency. */
export async function applyCheckoutExpired(env: Env, stripeSessionId: string): Promise<boolean> {
  const res = await env.DB.prepare(
    "UPDATE purchases SET status = 'failed' WHERE stripe_session_id = ? AND status = 'pending'"
  )
    .bind(stripeSessionId)
    .run();
  return Number(res.meta["changes"] ?? 0) > 0;
}

type StripeEvent = {
  type?: unknown;
  data?: { object?: { id?: unknown } };
};

/** POST /api/webhooks/stripe - raw body + stripe-signature header. */
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return unavailable("bindings");
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return unavailable("stripe_webhook_secret");

  // Raw body BEFORE any JSON.parse - the signature covers the exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);
  if (!signature) return json({ error: "missing_signature" }, 400);
  if (!(await verifyStripeSignature(rawBody, signature, secret))) {
    return json({ error: "invalid_signature" }, 403);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const type = typeof event.type === "string" ? event.type : "";
  const objectId = event.data?.object?.id;
  const stripeSessionId = typeof objectId === "string" ? objectId : null;

  if (type === "checkout.session.completed" || type === "checkout.session.expired") {
    if (!stripeSessionId) return json({ error: "malformed_event" }, 400);
    const changed =
      type === "checkout.session.completed"
        ? await applyCheckoutCompleted(env, stripeSessionId)
        : await applyCheckoutExpired(env, stripeSessionId);
    logEvent("stripe_webhook_applied", { type, stripeSessionId, changed });
  } else {
    logEvent("stripe_webhook_ignored", { type });
  }

  // 200 fast; Stripe retries non-2xx.
  return json({ received: true });
}
