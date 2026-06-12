/**
 * GET/PUT /api/profile - server-side copy of the device-local
 * festra-profile-v1 record (lib/user-profile.ts in the repo root). The
 * device stays the source of truth until accounts launch; this endpoint is
 * the sync target so a profile survives a cleared localStorage / new device.
 *
 * sanitizeProfilePayload runs on BOTH directions: writes are rejected (422)
 * when the record is wholesale-invalid, and stored rows are re-sanitized on
 * the way OUT so a schema bump never hands an old shape to the client.
 */

import type { Env } from "../env";
import { MAX_BODY_BYTES, sanitizeProfilePayload, type ProfilePayload } from "../lib/validate";
import { json, unavailable } from "../lib/http";
import { rateLimit } from "../lib/rate-limit";
import { logEvent } from "../lib/log";
import { resolveSession } from "./me";

const PROFILE_WRITE_RATE_LIMIT = 10;
const PROFILE_WRITE_RATE_WINDOW_SECONDS = 60;

function bodyBytes(raw: string): number {
  return new TextEncoder().encode(raw).byteLength;
}

/**
 * Load the stored profile payload for a user. Unparseable or
 * no-longer-sanitizable rows read as null (same load discipline as
 * lib/user-profile.ts loadProfile).
 */
export async function loadProfileRow(env: Env, userId: string): Promise<ProfilePayload | null> {
  const row = await env.DB.prepare("SELECT payload FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ payload: string }>();
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    logEvent("profile_payload_unparseable", { userId });
    return null;
  }
  return sanitizeProfilePayload(parsed);
}

/** Upsert the (already sanitized - handler's job) payload for a user. */
export async function saveProfileRow(
  env: Env,
  userId: string,
  payload: ProfilePayload
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, payload, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT (user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
  )
    .bind(userId, JSON.stringify(payload), now)
    .run();
}

/** GET /api/profile -> 200 ProfilePayload | 204 none | 401. */
export async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  if (!me) return json({ error: "unauthorized" }, 401);
  const payload = await loadProfileRow(env, me.id);
  return payload ? json(payload) : new Response(null, { status: 204 });
}

/** PUT /api/profile - body is the full festra-profile-v1 record. */
export async function handlePutProfile(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  if (!me) return json({ error: "unauthorized" }, 401);

  const writeLimit = await rateLimit(
    env.SESSIONS,
    `rl:profile:${me.id}`,
    PROFILE_WRITE_RATE_LIMIT,
    PROFILE_WRITE_RATE_WINDOW_SECONDS
  );
  if (!writeLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(writeLimit.retryAfterSeconds),
    });
  }

  const rawBody = await request.text();
  if (bodyBytes(rawBody) > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = undefined;
  }
  if (body === undefined) return json({ error: "invalid_json" }, 400);
  // Reject wholesale - the server never "fixes" an unknown schema version.
  const payload = sanitizeProfilePayload(body);
  if (!payload) return json({ error: "invalid_profile" }, 422);

  await saveProfileRow(env, me.id, payload);
  // "agents flip via profile": users.kind follows the synced profile type.
  if (payload.type !== me.kind) {
    await env.DB.prepare("UPDATE users SET kind = ? WHERE id = ?")
      .bind(payload.type, me.id)
      .run();
  }
  // Echo the SANITIZED record so the device converges on what was stored.
  return json(payload);
}
