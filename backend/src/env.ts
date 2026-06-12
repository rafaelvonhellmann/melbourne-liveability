/**
 * Worker environment - the typed twin of the bindings in wrangler.toml.
 * Keep the two in sync: a binding added there must appear here (and in
 * types/ambient.d.ts until @cloudflare/workers-types is installed).
 */
export interface Env {
  /** D1 database `festra` - schema.sql. */
  DB: D1Database;
  /** Session store: session id -> user id, TTL-expired. D1 `sessions` is the audit mirror. */
  SESSIONS: KVNamespace;
  /**
   * R2 bucket `festra-reports` for generated report artifacts. Bound but
   * unused until the report pipeline lands (see routes/stripe-webhook.ts
   * applyCheckoutCompleted - the gap is logged as report_generation_pending).
   */
  REPORTS: R2Bucket;
  /** Secret (`wrangler secret put STRIPE_SECRET_KEY`); checkout answers 503 while unset. */
  STRIPE_SECRET_KEY?: string;
  /** Secret (`wrangler secret put STRIPE_WEBHOOK_SECRET`); webhook answers 503 while unset. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Secret (`wrangler secret put RESEND_API_KEY`); selects the Resend email provider when set. */
  RESEND_API_KEY?: string;
  /** Optional var: set to "production" at deploy so dev-only fallbacks stay impossible. */
  ENVIRONMENT?: string;
  /**
   * Optional var: "console" forces the dev/log email stub; "resend" (or
   * unset) requires RESEND_API_KEY. Anything else -> magic-link issuance 503s.
   */
  EMAIL_PROVIDER?: string;
  /** Optional var: From header for magic-link email; defaults in lib/email.ts. */
  EMAIL_FROM?: string;
}
