-- Festra D1 schema (database: festra).
-- Apply at cutover:
--   wrangler d1 create festra
--   wrangler d1 execute festra --remote --file=schema.sql
--
-- Conventions:
-- * ids are crypto.randomUUID() strings minted in the worker.
-- * timestamps are ISO-8601 UTC TEXT (same convention as the client's
--   festra-profile-v1 createdAt in lib/user-profile.ts).
-- * enums are CHECK-constrained AND re-validated in src/lib/validate.ts -
--   the same enum-drift discipline as parseProfileType in lib/user-profile.ts.

-- Account = a verified email. kind mirrors the device-local ProfileType.
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('buyer', 'agent')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per emailed magic link. Only the SHA-256 hex of the token is
-- stored (src/lib/token.ts hashToken); the plaintext lives solely in the
-- email link. Single-use: verify sets used_at and never accepts the row again.
CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links (email);

-- Durable session mirror. The hot path is the SESSIONS KV namespace
-- (session id -> user id, TTL = expires_at); this table exists for
-- revoke-all-sessions and audit, not per-request reads.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Server-side copy of the device-local profile. payload is the JSON record
-- shaped exactly like festra-profile-v1 (lib/user-profile.ts UserProfile:
-- version 1, type buyer|agent, name?, createdAt, clients?, activeClientId?).
-- Every write passes src/lib/validate.ts sanitizeProfilePayload first.
CREATE TABLE IF NOT EXISTS profiles (
  user_id    TEXT PRIMARY KEY REFERENCES users (id),
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Server-side copy of the device-local preferences. payload is the JSON
-- record shaped like mlv-user-prefs-v1 (lib/user-prefs.ts UserPrefs) plus
-- a client-supplied updatedAt sync clock. Every write passes
-- src/lib/validate.ts sanitizePrefsPayload first.
CREATE TABLE IF NOT EXISTS prefs (
  user_id    TEXT PRIMARY KEY REFERENCES users (id),
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Agent sub-profiles (mirrors AgentClient in lib/user-profile.ts). Kept
-- relational - not only inside profiles.payload - so purchases/reports can
-- reference a client row later without parsing JSON.
CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients (user_id);

-- One row per Stripe Checkout session. user_id is nullable: guest checkout
-- is keyed by email alone and can be claimed by a later account. status is
-- written only by the webhook handler after signature verification.
CREATE TABLE IF NOT EXISTS purchases (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users (id),
  email             TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  sku               TEXT NOT NULL CHECK (sku IN ('snapshot39', 'premium59')),
  address_label     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases (email);

-- Generated report files in R2 (REPORTS binding). r2_key is the object key;
-- expires_at drives both the signed-URL lifetime and a cleanup cron.
CREATE TABLE IF NOT EXISTS report_artifacts (
  id          TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases (id),
  r2_key      TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_artifacts_purchase ON report_artifacts (purchase_id);
