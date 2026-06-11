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
   * R2 bucket for generated report artifacts. Optional because the binding
   * is commented out in wrangler.toml until cutover - make this required
   * when [[r2_buckets]] is enabled.
   */
  REPORTS?: R2Bucket;
  /** Secret (`wrangler secret put STRIPE_SECRET_KEY`); unset until cutover. */
  STRIPE_SECRET_KEY?: string;
  /** Secret (`wrangler secret put STRIPE_WEBHOOK_SECRET`); unset until cutover. */
  STRIPE_WEBHOOK_SECRET?: string;
}
