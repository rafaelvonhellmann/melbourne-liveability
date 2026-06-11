/**
 * Tiny dependency-free router. Exact-path matching only - every Festra API
 * route is a fixed path, so there is deliberately no pattern/param engine to
 * test or to get wrong. If a route ever needs params, extend here first.
 *
 * Dispatch contract:
 * - unknown path            -> 404 {"error":"not_found"}
 * - known path, wrong verb  -> 405 {"error":"method_not_allowed"} + Allow header
 * - handler throw           -> bubbles to the caller (index.ts catches and 500s)
 */

export type Handler<E> = (
  request: Request,
  env: E,
  ctx: ExecutionContext
) => Response | Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export class Router<E> {
  /** path -> (METHOD -> handler). Methods stored uppercase. */
  private readonly routes = new Map<string, Map<string, Handler<E>>>();

  on(method: string, path: string, handler: Handler<E>): this {
    let byMethod = this.routes.get(path);
    if (!byMethod) {
      byMethod = new Map();
      this.routes.set(path, byMethod);
    }
    byMethod.set(method.toUpperCase(), handler);
    return this;
  }

  get(path: string, handler: Handler<E>): this {
    return this.on("GET", path, handler);
  }

  post(path: string, handler: Handler<E>): this {
    return this.on("POST", path, handler);
  }

  put(path: string, handler: Handler<E>): this {
    return this.on("PUT", path, handler);
  }

  /** True when any verb is registered for this exact path (used for preflight). */
  has(path: string): boolean {
    return this.routes.has(path);
  }

  /** Registered verbs for a path, e.g. ["GET", "PUT"]. Empty for unknown paths. */
  methodsFor(path: string): string[] {
    const byMethod = this.routes.get(path);
    return byMethod ? [...byMethod.keys()] : [];
  }

  async handle(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    const byMethod = this.routes.get(path);
    if (!byMethod) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    const handler = byMethod.get(request.method.toUpperCase());
    if (!handler) {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...JSON_HEADERS, Allow: this.methodsFor(path).join(", ") },
      });
    }
    return handler(request, env, ctx);
  }
}
