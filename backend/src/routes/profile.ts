/**
 * GET/PUT /api/profile - server-side copy of the device-local
 * festra-profile-v1 record (lib/user-profile.ts in the repo root). The
 * device stays the source of truth until accounts launch; this endpoint is
 * the sync target so a profile survives a cleared localStorage / new device.
 */

import type { Env } from "../env";
import type { ProfilePayload } from "../lib/validate";
import { comingSoon } from "../lib/http";

/**
 * Load the stored profile payload for a user.
 *
 * Intended implementation:
 *  - SELECT payload FROM profiles WHERE user_id = ?
 *  - JSON.parse, then sanitizeProfilePayload - stored rows are re-sanitized
 *    on the way OUT too, so a schema bump never hands an old shape to the
 *    client (same load discipline as lib/user-profile.ts loadProfile).
 */
export async function loadProfileRow(
  _env: Env,
  _userId: string
): Promise<ProfilePayload | null> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/**
 * Upsert the profile payload for a user.
 *
 * Intended implementation:
 *  - payload already passed sanitizeProfilePayload (handler's job)
 *  - INSERT INTO profiles (user_id, payload, updated_at) VALUES (?, ?, now)
 *    ON CONFLICT (user_id) DO UPDATE SET payload = ?, updated_at = now
 */
export async function saveProfileRow(
  _env: Env,
  _userId: string,
  _payload: ProfilePayload
): Promise<void> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/** GET /api/profile -> 200 ProfilePayload | 204 none | 401. */
export async function handleGetProfile(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - me = await resolveSession(env, request); 401 when null
  //  - payload = await loadProfileRow(env, me.id)
  //  - return payload ? json(payload) : new Response(null, { status: 204 })
  return comingSoon();
}

/** PUT /api/profile - body is the full festra-profile-v1 record. */
export async function handlePutProfile(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - me = await resolveSession(env, request); 401 when null
  //  - payload = sanitizeProfilePayload(await request.json()); 422 when null
  //    (reject wholesale - the server never "fixes" an unknown schema version)
  //  - await saveProfileRow(env, me.id, payload)
  //  - return json(payload)  - echo the SANITIZED record so the device
  //    converges on what the server actually stored
  return comingSoon();
}
