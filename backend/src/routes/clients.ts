/**
 * POST /api/clients - agent sub-profiles (mirrors AgentClient in
 * lib/user-profile.ts and the D1 clients table). Buyers get 403: the
 * buyer-has-no-clients rule from the client-side sanitizer holds server-side.
 */

import type { Env } from "../env";
import { comingSoon } from "../lib/http";

export type ClientRow = {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
};

/**
 * Create a client row for an agent.
 *
 * Intended implementation:
 *  - id = newToken() (src/lib/token.ts)
 *  - INSERT INTO clients (id, user_id, label, created_at) VALUES (?, ?, ?, now)
 *  - cap: keep the newest 30 per user (MAX_CLIENTS in src/lib/validate.ts) -
 *    same roll-off as the device-local addClient in lib/user-profile.ts
 */
export async function createClient(
  _env: Env,
  _userId: string,
  _label: string
): Promise<ClientRow> {
  // TODO(cutover): implement per the doc block above.
  throw new Error("not_implemented: enable at cutover");
}

/** POST /api/clients - body {label}. 201 ClientRow | 401 | 403 buyer | 422. */
export async function handleCreateClient(_request: Request, _env: Env): Promise<Response> {
  // TODO(cutover):
  //  - me = await resolveSession(env, request); 401 when null
  //  - me.kind !== "agent" -> json({ error: "agents_only" }, 403)
  //  - label = parseClientLabel(body.label); 422 when null
  //  - return json(await createClient(env, me.id, label), 201)
  return comingSoon();
}
