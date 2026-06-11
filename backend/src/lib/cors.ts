/**
 * CORS allowlist. Production origins are pinned exactly; localhost (any
 * port, http or https) is allowed for previews. Everything else gets no
 * CORS headers at all - the browser blocks the read, the API never echoes
 * an untrusted Origin.
 */

const ALLOWED_ORIGINS = new Set([
  "https://festra.au",
  "https://www.festra.au",
  "https://festra.com.au",
  "https://www.festra.com.au",
]);

/** localhost / 127.0.0.1 with an optional port - dev + preview servers. */
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || LOCALHOST_RE.test(origin);
}

/**
 * Headers for an allowed origin. Credentials are enabled because auth rides
 * an httpOnly cookie; that is exactly why the origin must be echoed from a
 * pinned allowlist and never wildcarded.
 */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Copy of `response` with CORS headers applied when (and only when) the
 * origin is allowlisted. Non-allowed/missing origins return the response
 * untouched except Vary: Origin, so caches never serve a CORS'd body to the
 * wrong origin.
 */
export function withCors(response: Response, origin: string | null): Response {
  const out = new Response(response.body, response);
  if (origin && isAllowedOrigin(origin)) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      out.headers.set(k, v);
    }
  } else {
    out.headers.set("Vary", "Origin");
  }
  return out;
}

/** OPTIONS preflight: 204 + CORS headers when allowed, bare 204 otherwise. */
export function preflight(request: Request): Response {
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin)) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return new Response(null, { status: 204, headers: { Vary: "Origin" } });
}
