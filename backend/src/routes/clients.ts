/**
 * POST /api/clients - agent sub-profiles (mirrors AgentClient in
 * lib/user-profile.ts and the D1 clients table). Buyers get 403: the
 * buyer-has-no-clients rule from the client-side sanitizer holds server-side.
 */

import type { Env } from "../env";
import { exceedsMaxBodyBytes, MAX_CLIENTS, parseClientLabel } from "../lib/validate";
import { json, unavailable } from "../lib/http";
import { rateLimit } from "../lib/rate-limit";
import { newToken } from "../lib/token";
import { resolveSession } from "./me";

const CLIENT_WRITE_RATE_LIMIT = 5;
const CLIENT_WRITE_RATE_WINDOW_SECONDS = 60;

export type ClientRow = {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
};

/**
 * Create a client row for an agent, then trim to the newest MAX_CLIENTS (30)
 * per user - the same roll-off as the device-local addClient in
 * lib/user-profile.ts. rowid breaks created_at ties by insertion order.
 */
export async function createClient(env: Env, userId: string, label: string): Promise<ClientRow> {
  const id = newToken();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO clients (id, user_id, label, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, label, createdAt)
    .run();
  await env.DB.prepare(
    "DELETE FROM clients WHERE user_id = ?1 AND rowid NOT IN " +
      "(SELECT rowid FROM clients WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?2)"
  )
    .bind(userId, MAX_CLIENTS)
    .run();
  return { id, userId, label, createdAt };
}

/** POST /api/clients - body {label}. 201 ClientRow | 401 | 403 buyer | 422. */
export async function handleCreateClient(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.SESSIONS) return unavailable("bindings");
  const me = await resolveSession(env, request);
  if (!me) return json({ error: "unauthorized" }, 401);
  if (me.kind !== "agent") return json({ error: "agents_only" }, 403);

  const writeLimit = await rateLimit(
    env.SESSIONS,
    `rl:clients:${me.id}`,
    CLIENT_WRITE_RATE_LIMIT,
    CLIENT_WRITE_RATE_WINDOW_SECONDS
  );
  if (!writeLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(writeLimit.retryAfterSeconds),
    });
  }

  const rawBody = await request.text();
  if (exceedsMaxBodyBytes(rawBody)) return json({ error: "too_large" }, 413);
  let body: Record<string, unknown> | null;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    body = null;
  }
  const label = parseClientLabel(body?.label);
  if (!label) return json({ error: "invalid_label" }, 422);

  return json(await createClient(env, me.id, label), 201);
}
