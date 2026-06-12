/** Shared response helpers - the only place response envelopes are minted. */

/** JSON response with explicit status. Body is stringified once, here. */
export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}

/**
 * 503 for a missing binding/secret. Misconfiguration must be loud, never an
 * open fail: a route that cannot do its job safely refuses to do it at all.
 * `reason` names the missing piece (binding/secret name class, no values).
 */
export function unavailable(reason: string): Response {
  return json({ error: "service_unavailable", reason }, 503);
}
