/**
 * GET/PUT /api/prefs - server-side copy of the device-local
 * mlv-user-prefs-v1 record (lib/user-prefs.ts in the repo root), plus a
 * client-supplied updatedAt sync clock for whole-blob last-write-wins.
 */

import type { Env } from "../env";
import { exceedsMaxBodyBytes, sanitizePrefsPayload, type PrefsPayload } from "../lib/validate";
import { json, unavailable } from "../lib/http";
import { logEvent } from "../lib/log";
import { rateLimit } from "../lib/rate-limit";
import { resolveSession } from "./me";

const PREFS_WRITE_RATE_LIMIT = 12;
const PREFS_WRITE_RATE_WINDOW_SECONDS = 60;

function isServerNewer(server: PrefsPayload, incoming: PrefsPayload): boolean {
  return Date.parse(server.updatedAt) > Date.parse(incoming.updatedAt);
}

/**
 * Load the stored prefs payload for a user. Unparseable or no-longer
 * sanitizable rows read as null, matching the profile route's load discipline.
 */
export async function loadPrefsRow(env: Env, userId: string): Promise<PrefsPayload | null> {
  const row = await env.DB.prepare("SELECT payload FROM prefs WHERE user_id = ?")
    .bind(userId)
    .first<{ payload: string }>();
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    logEvent("prefs_payload_unparseable", { userId });
    return null;
  }
  return sanitizePrefsPayload(parsed);
}

/** Upsert the (already sanitized - handler's job) payload for a user. */
export async function savePrefsRow(
  env: Env,
  userId: string,
  payload: PrefsPayload
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO prefs (user_id, payload, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT (user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
  )
    .bind(userId, JSON.stringify(payload), now)
    .run();
}

/** GET /api/prefs -> 200 PrefsPayload | 204 none | 401. */
export async function handleGetPrefs(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  if (!me) return json({ error: "unauthorized" }, 401);
  const payload = await loadPrefsRow(env, me.id);
  return payload ? json(payload) : new Response(null, { status: 204 });
}

/** PUT /api/prefs - body is the full mlv-user-prefs-v1 sync record. */
export async function handlePutPrefs(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  if (!me) return json({ error: "unauthorized" }, 401);

  const writeLimit = await rateLimit(
    env.SESSIONS,
    `rl:prefs:${me.id}`,
    PREFS_WRITE_RATE_LIMIT,
    PREFS_WRITE_RATE_WINDOW_SECONDS
  );
  if (!writeLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(writeLimit.retryAfterSeconds),
    });
  }

  const rawBody = await request.text();
  if (exceedsMaxBodyBytes(rawBody)) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = undefined;
  }
  if (body === undefined) return json({ error: "invalid_json" }, 400);

  const payload = sanitizePrefsPayload(body);
  if (!payload) return json({ error: "invalid_prefs" }, 422);

  const server = await loadPrefsRow(env, me.id);
  if (server && isServerNewer(server, payload)) {
    return json({ error: "stale", server }, 409);
  }

  await savePrefsRow(env, me.id, payload);
  return json(payload);
}
