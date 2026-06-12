/**
 * GET /api/me - who is behind the session cookie - plus the shared session
 * gate (resolveSession) that profile/clients/checkout reuse, and
 * POST /api/auth/logout (KV delete + cookie clear; the D1 sessions row stays
 * as the audit mirror).
 */

import type { Env } from "../env";
import { parseUserKind, type UserKind } from "../lib/validate";
import { json, unavailable } from "../lib/http";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "./auth";

export type MeResponse = {
  id: string;
  email: string;
  kind: UserKind;
  createdAt: string;
};

type UserRow = {
  id: string;
  email: string;
  kind: string;
  created_at: string;
};

/** Extract the festra_session cookie value, or null. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

/**
 * Resolve the festra_session cookie to a user - the shared auth gate.
 * KV is the hot path (expired ids vanish by TTL; no D1 read when the
 * session is gone); the users row is fetched once and kind passes
 * parseUserKind before it is trusted (enum drift guard).
 */
export async function resolveSession(env: Env, request: Request): Promise<MeResponse | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;
  const userId = await env.SESSIONS.get(sessionId);
  if (!userId) return null;
  const row = await env.DB.prepare(
    "SELECT id, email, kind, created_at FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<UserRow>();
  if (!row) return null;
  const kind = parseUserKind(row.kind);
  if (!kind) return null;
  return { id: row.id, email: row.email, kind, createdAt: row.created_at };
}

/** GET /api/me -> 200 MeResponse | 401 when no/invalid session. */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  return me ? json(me) : json({ error: "unauthorized" }, 401);
}

/**
 * POST /api/auth/logout -> 200 always (idempotent). Deletes the KV session
 * and clears the cookie; the D1 sessions row is kept on purpose (audit).
 */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (!env.SESSIONS) return unavailable("bindings");
  const sessionId = readSessionCookie(request);
  if (sessionId) await env.SESSIONS.delete(sessionId);
  return json({ status: "ok" }, 200, { "Set-Cookie": clearSessionCookie() });
}
