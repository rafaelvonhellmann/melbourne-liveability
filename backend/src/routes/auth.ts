/**
 * Auth: emailed magic link -> KV-backed session behind an httpOnly cookie.
 *
 * Flow:
 *  1. POST /api/auth/magic-link {email} -> issueMagicLink stores a SHA-256
 *     token hash in D1 and emails the plaintext link. Always 202 - the
 *     response never reveals whether the email has an account or was throttled.
 *     Issuance is rate limited per email AND per IP (KV counters).
 *  2. User clicks https://festra.au/auth#token=... ; the page POSTs
 *     /api/auth/verify {token} -> verifyMagicLink burns the link (single
 *     use), upserts the user, creates a session (KV + D1 mirror) and
 *     Set-Cookie's the id.
 *
 * The plaintext token travels in the email ONLY: never logged (except the
 * explicit ConsoleEmailProvider dev stub), never stored, never echoed.
 */

import type { Env } from "../env";
import { json, unavailable } from "../lib/http";
import { constantTimeEqual, hashToken, newToken } from "../lib/token";
import { normalizeEmail } from "../lib/validate";
import { emailProviderFromEnv, type EmailProvider } from "../lib/email";
import { rateLimit } from "../lib/rate-limit";
import { logEvent } from "../lib/log";

export const SESSION_COOKIE_NAME = "__Host-festra_session";
export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;
export const MAX_SESSIONS_PER_USER = 5;
/** Max magic-link issuances per email and per IP within the window. */
export const MAGIC_LINK_RATE_LIMIT = 5;
export const MAGIC_LINK_RATE_WINDOW_SECONDS = 3600;

type MagicLinkRow = {
  token_hash: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  kind: string;
  created_at: string;
};

type SessionIdRow = {
  id: string;
};

async function pruneOldSessions(env: Env, userId: string): Promise<void> {
  const evicted = await env.DB.prepare(
    "SELECT id FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?2"
  )
    .bind(userId, MAX_SESSIONS_PER_USER)
    .all<SessionIdRow>();
  const evictedIds = evicted.results.map((row) => row.id).filter((id) => id.length > 0);
  for (const id of evictedIds) {
    await env.SESSIONS.delete(id);
  }
  for (const id of evictedIds) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(id, userId).run();
  }
}

/**
 * Issue a magic link for an already-validated email: store the SHA-256 hash
 * in D1 (15-min TTL) and hand the plaintext link to the email provider.
 * Returns the plaintext token for the caller/tests; it is never persisted.
 */
export async function issueMagicLink(
  env: Env,
  email: string,
  provider: EmailProvider
): Promise<string> {
  const token = newToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)"
  )
    .bind(tokenHash, email, expiresAt)
    .run();
  await provider.send({
    to: email,
    subject: "Your Festra sign-in link",
    text:
      `Sign in to Festra:\n\nhttps://festra.au/auth#token=${token}\n\n` +
      `This link expires in ${MAGIC_LINK_TTL_MINUTES} minutes and works once. ` +
      `If you did not request it, ignore this email.`,
  });
  return token;
}

/**
 * Verify a magic-link token and mint a session. Returns null on ANY failure
 * (missing, already used, expired) - one generic outcome, no oracle about
 * which check failed.
 */
export async function verifyMagicLink(
  env: Env,
  token: string
): Promise<{ sessionId: string; userId: string; expires: Date } | null> {
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT token_hash, email, expires_at, used_at FROM magic_links WHERE token_hash = ?"
  )
    .bind(tokenHash)
    .first<MagicLinkRow>();
  const nowIso = new Date().toISOString();
  if (
    !row ||
    row.used_at !== null ||
    row.expires_at <= nowIso ||
    !constantTimeEqual(row.token_hash, tokenHash)
  ) {
    return null;
  }

  // Single-use burn. The `used_at IS NULL` guard makes a concurrent double
  // verify lose cleanly: zero rows changed -> reject.
  const burn = await env.DB.prepare(
    "UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL"
  )
    .bind(nowIso, tokenHash)
    .run();
  if (Number(burn.meta["changes"] ?? 0) === 0) return null;

  // Upsert the user. kind defaults to 'buyer'; agents flip via PUT /api/profile.
  const existing = await env.DB.prepare(
    "SELECT id, email, kind, created_at FROM users WHERE email = ?"
  )
    .bind(row.email)
    .first<UserRow>();
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    userId = newToken();
    await env.DB.prepare(
      "INSERT INTO users (id, email, kind, created_at) VALUES (?, ?, 'buyer', ?)"
    )
      .bind(userId, row.email, nowIso)
      .run();
  }

  const sessionId = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await env.SESSIONS.put(sessionId, userId, {
    expirationTtl: SESSION_TTL_DAYS * 86_400,
  });
  try {
    await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(sessionId, userId, expires.toISOString())
      .run();
  } catch (err) {
    await env.SESSIONS.delete(sessionId);
    throw err;
  }
  await pruneOldSessions(env, userId);
  return { sessionId, userId, expires };
}

/**
 * Session cookie attributes, fixed by design: httpOnly (no JS access),
 * Secure, SameSite=Lax (top-level navigations from the email link still
 * carry it; cross-site POSTs do not), Path=/.
 */
export function sessionCookie(sessionId: string, expires: Date): string {
  return [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Expires=${expires.toUTCString()}`,
  ].join("; ");
}

/** Expired empty cookie - same attribute set, used by logout. */
export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

/** POST /api/auth/magic-link - body {email}. 202 always (no account oracle). */
export async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const provider = emailProviderFromEnv(env);
  if (!provider) return unavailable("email_provider");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = normalizeEmail(body?.email);
  if (!email) return json({ error: "invalid_email" }, 400);

  // Throttle per email AND per IP before issuing. Both counters are always
  // charged so rotating one identifier still burns the other.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const byEmail = await rateLimit(
    env.SESSIONS,
    `rl:magic:email:${email}`,
    MAGIC_LINK_RATE_LIMIT,
    MAGIC_LINK_RATE_WINDOW_SECONDS
  );
  const byIp = await rateLimit(
    env.SESSIONS,
    `rl:magic:ip:${ip}`,
    MAGIC_LINK_RATE_LIMIT,
    MAGIC_LINK_RATE_WINDOW_SECONDS
  );
  if (!byEmail.allowed || !byIp.allowed) {
    logEvent("magic_link_throttled", {});
    return json({ status: "sent" }, 202);
  }

  await issueMagicLink(env, email, provider);
  logEvent("magic_link_issued", {}); // deliberately no email / token fields
  return json({ status: "sent" }, 202);
}

/** POST /api/auth/verify - body {token}; sets the session cookie. */
export async function handleVerify(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" && body.token.length > 0 ? body.token : null;
  if (!token) return json({ error: "invalid_token" }, 400);

  const session = await verifyMagicLink(env, token);
  if (!session) return json({ error: "invalid_or_expired" }, 401);
  return json({ status: "ok" }, 200, {
    "Set-Cookie": sessionCookie(session.sessionId, session.expires),
  });
}
