/**
 * festra-api worker entry. Route table lives here and nowhere else.
 *
 * Pre-launch state: every route except GET /api/health answers
 * 501 {"status":"coming_soon","launch":"festra.au"} (src/lib/http.ts
 * comingSoon). The real per-route logic is documented in src/routes/* as
 * typed signatures + TODO blocks; cutover swaps the comingSoon() returns
 * for those implementations route by route.
 */

import type { Env } from "./env";
import { Router } from "./router";
import { json } from "./lib/http";
import { preflight, withCors } from "./lib/cors";
import { handleMagicLinkRequest, handleVerify } from "./routes/auth";
import { handleMe } from "./routes/me";
import { handleGetProfile, handlePutProfile } from "./routes/profile";
import { handleCreateClient } from "./routes/clients";
import { handleCheckoutSession } from "./routes/checkout";
import { handleStripeWebhook } from "./routes/stripe-webhook";
import { handleHealth } from "./routes/health";

export const router = new Router<Env>()
  .post("/api/auth/magic-link", (req, env) => handleMagicLinkRequest(req, env))
  .post("/api/auth/verify", (req, env) => handleVerify(req, env))
  .get("/api/me", (req, env) => handleMe(req, env))
  .get("/api/profile", (req, env) => handleGetProfile(req, env))
  .put("/api/profile", (req, env) => handlePutProfile(req, env))
  .post("/api/clients", (req, env) => handleCreateClient(req, env))
  .post("/api/checkout/session", (req, env) => handleCheckoutSession(req, env))
  .post("/api/webhooks/stripe", (req, env) => handleStripeWebhook(req, env))
  .get("/api/health", () => handleHealth());

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    // Preflight is answered for known paths only; unknown paths fall through
    // to the router's 404 so OPTIONS probing maps the same surface as GET.
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS" && router.has(path)) {
      return preflight(request);
    }
    try {
      const response = await router.handle(request, env, ctx);
      return withCors(response, origin);
    } catch (err) {
      // Handlers that throw (including the not_implemented stubs if one is
      // ever wired by mistake) become an opaque 500 - no stack to callers.
      console.error("unhandled", request.method, path, err);
      return withCors(json({ error: "internal" }, 500), origin);
    }
  },
};

export default worker;
