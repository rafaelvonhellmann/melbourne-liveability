/** Shared response helpers - the only place response envelopes are minted. */

/** JSON response with explicit status. Body is stringified once, here. */
export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}

/**
 * Pre-launch envelope: every API route except /api/health answers with this
 * single helper until cutover, so flipping the backend live is "replace the
 * comingSoon() return" per handler - never an envelope hunt.
 */
export function comingSoon(): Response {
  return json({ status: "coming_soon", launch: "festra.au" }, 501);
}
