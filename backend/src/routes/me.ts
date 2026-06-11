/**
 * GET /api/me - who is behind the session cookie.
 */

import type { Env } from "../env";
import type { UserKind } from "../lib/validate";
import { comingSoon } from "../lib/http";

export type MeResponse = {
  id: string;
  email: string;
  kind: UserKind;
  createdAt: string;
};

/**
 * Resolve the festra_session cookie to a user.
 *
 * Intended implementation (the shared auth gate - profile/clients/checkout
 * reuse this exact function):
 *  - parse Cookie header for SESSION_COOKIE_NAME (routes/auth.ts)
 *  - userId = await env.SESSIONS.get(sessionId); null -> null (expired ids
 *    vanish from KV by TTL; no D1 read on the hot path)
 *  - SELECT id, email, kind, created_at FROM users WHERE id = ?
 *  - kind passes parseUserKind before it is trusted (enum drift guard)
 */
export async function resolveSession(_env: Env, _request: Request): Promise<MeResponse | null> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/** GET /api/me -> 200 MeResponse | 401 when no/invalid session. */
export async function handleMe(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - me = await resolveSession(env, request)
  //  - return me ? json(me) : json({ error: "unauthorized" }, 401)
  return comingSoon();
}
