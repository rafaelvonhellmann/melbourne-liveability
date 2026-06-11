/**
 * Auth: emailed magic link -> KV-backed session behind an httpOnly cookie.
 *
 * Flow at cutover:
 *  1. POST /api/auth/magic-link {email} -> issueMagicLink stores a SHA-256
 *     token hash in D1 and emails the plaintext link. Always 202 - the
 *     response never reveals whether the email has an account.
 *  2. User clicks https://festra.au/auth?token=... ; the page POSTs
 *     /api/auth/verify {token} -> verifyMagicLink burns the link, upserts
 *     the user, creates a session (KV + D1 mirror) and Set-Cookie's the id.
 */

import type { Env } from "../env";
import { comingSoon } from "../lib/http";

export const SESSION_COOKIE_NAME = "festra_session";
export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;

/**
 * Issue a magic link for an already-validated email.
 *
 * Intended implementation:
 *  - token = newToken(); hash = await hashToken(token)   (src/lib/token.ts)
 *  - INSERT INTO magic_links (token_hash, email, expires_at)
 *    VALUES (?, ?, now + MAGIC_LINK_TTL_MINUTES)
 *  - send the email (provider TBD - likely Resend or SES via API) with
 *    https://festra.au/auth?token=<plaintext>
 *  - return the plaintext token ONLY so the caller can hand it to the email
 *    sender; it is never logged and never stored.
 */
export async function issueMagicLink(_env: Env, _email: string): Promise<string> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/**
 * Verify a magic-link token and mint a session.
 *
 * Intended implementation:
 *  - hash = await hashToken(token); SELECT * FROM magic_links WHERE token_hash = ?
 *  - reject when missing, used_at set, or expires_at < now (one generic
 *    "invalid or expired" error - no oracle about which check failed);
 *    compare stored vs computed hash with constantTimeEqual
 *  - UPDATE magic_links SET used_at = now (single-use)
 *  - upsert users by email (kind defaults to 'buyer'; agents flip via profile)
 *  - sessionId = newToken();
 *    SESSIONS.put(sessionId, userId, { expirationTtl: SESSION_TTL_DAYS in s })
 *    + INSERT INTO sessions (id, user_id, expires_at)  (revocation/audit mirror)
 *  - respond with Set-Cookie: sessionCookie(sessionId, expires)
 */
export async function verifyMagicLink(
  _env: Env,
  _token: string
): Promise<{ sessionId: string; userId: string; expires: Date }> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/**
 * Session cookie attributes, fixed by design: httpOnly (no JS access),
 * Secure, SameSite=Lax (top-level navigations from the email link still
 * carry it; cross-site POSTs do not), Path=/. Implemented now - it is pure
 * string assembly and the tests pin the attribute set.
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

/** POST /api/auth/magic-link - body {email}. */
export async function handleMagicLinkRequest(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - email = normalizeEmail((await request.json()).email); 400 on null
  //  - rate-limit per email + per IP (KV counter) before issuing
  //  - await issueMagicLink(env, email)
  //  - return json({ status: "sent" }, 202)  - identical for unknown emails
  return comingSoon();
}

/** POST /api/auth/verify - body {token}; sets the session cookie. */
export async function handleVerify(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - token = body.token (string, 400 otherwise)
  //  - { sessionId, expires } = await verifyMagicLink(env, token); 401 on failure
  //  - return json({ status: "ok" }, 200,
  //      { "Set-Cookie": sessionCookie(sessionId, expires) })
  return comingSoon();
}
