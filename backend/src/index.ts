/**
 * festra-api worker entry. Route table lives here and nowhere else.
 *
 * Code-complete, NOT deployed: routes/deploy stay commented out in
 * wrangler.toml until the cutover checklist in README.md runs. Routes that
 * need an unset secret (Stripe keys, email provider) answer 503 - loud
 * misconfig, never an open fail.
 */

import type { Env } from "./env";
import { Router } from "./router";
import { json } from "./lib/http";
import { preflight, withCors } from "./lib/cors";
import { logError } from "./lib/log";
import { newToken } from "./lib/token";
import { handleMagicLinkRequest, handleVerify } from "./routes/auth";
import { handleLogout, handleMe } from "./routes/me";
import { handleGetProfile, handlePutProfile } from "./routes/profile";
import { handleCreateClient } from "./routes/clients";
import { handleCheckoutSession } from "./routes/checkout";
import { handleStripeWebhook } from "./routes/stripe-webhook";
import { handleHealth } from "./routes/health";

export const router = new Router<Env>()
  .post("/api/auth/magic-link", (req, env) => handleMagicLinkRequest(req, env))
  .post("/api/auth/verify", (req, env) => handleVerify(req, env))
  .post("/api/auth/logout", (req, env) => handleLogout(req, env))
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
      // Opaque 500: the requestId correlates the response with the logged
      // stack; the stack itself never leaves the log sink.
      const requestId = request.headers.get("cf-ray") ?? newToken();
      logError("unhandled_error", err, { method: request.method, path, requestId });
      return withCors(json({ error: "internal", requestId }, 500), origin);
    }
  },
};

export default worker;
