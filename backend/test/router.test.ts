import { describe, expect, it } from "vitest";
import { Router } from "../src/router";

type TestEnv = { tag: string };

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

const env: TestEnv = { tag: "test-env" };

function req(method: string, path: string): Request {
  return new Request(`https://api.festra.au${path}`, { method });
}

describe("Router dispatch", () => {
  it("routes by exact path and method", async () => {
    const router = new Router<TestEnv>()
      .get("/api/a", () => new Response("get-a"))
      .post("/api/a", () => new Response("post-a"))
      .put("/api/b", () => new Response("put-b"));

    expect(await (await router.handle(req("GET", "/api/a"), env, ctx)).text()).toBe("get-a");
    expect(await (await router.handle(req("POST", "/api/a"), env, ctx)).text()).toBe("post-a");
    expect(await (await router.handle(req("PUT", "/api/b"), env, ctx)).text()).toBe("put-b");
  });

  it("passes request, env and ctx through to the handler", async () => {
    let seen: unknown[] = [];
    const router = new Router<TestEnv>().get("/api/x", (r, e, c) => {
      seen = [new URL(r.url).pathname, e.tag, c];
      return new Response("ok");
    });
    await router.handle(req("GET", "/api/x"), env, ctx);
    expect(seen).toEqual(["/api/x", "test-env", ctx]);
  });

  it("supports async handlers", async () => {
    const router = new Router<TestEnv>().get("/api/x", async () => new Response("later"));
    expect(await (await router.handle(req("GET", "/api/x"), env, ctx)).text()).toBe("later");
  });

  it("404s unknown paths with a JSON envelope", async () => {
    const router = new Router<TestEnv>().get("/api/x", () => new Response("ok"));
    const res = await router.handle(req("GET", "/api/nope"), env, ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("does not prefix- or suffix-match paths", async () => {
    const router = new Router<TestEnv>().get("/api/x", () => new Response("ok"));
    expect((await router.handle(req("GET", "/api/x/sub"), env, ctx)).status).toBe(404);
    expect((await router.handle(req("GET", "/api"), env, ctx)).status).toBe(404);
  });

  it("405s a known path with the wrong verb and lists allowed methods", async () => {
    const router = new Router<TestEnv>()
      .get("/api/x", () => new Response("ok"))
      .put("/api/x", () => new Response("ok"));
    const res = await router.handle(req("DELETE", "/api/x"), env, ctx);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PUT");
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("exposes has() and methodsFor() for preflight wiring", () => {
    const router = new Router<TestEnv>()
      .get("/api/x", () => new Response("ok"))
      .post("/api/x", () => new Response("ok"));
    expect(router.has("/api/x")).toBe(true);
    expect(router.has("/api/y")).toBe(false);
    expect(router.methodsFor("/api/x")).toEqual(["GET", "POST"]);
    expect(router.methodsFor("/api/y")).toEqual([]);
  });

  it("propagates handler throws to the caller (index.ts owns the 500)", async () => {
    const router = new Router<TestEnv>().get("/api/x", () => {
      throw new Error("boom");
    });
    await expect(router.handle(req("GET", "/api/x"), env, ctx)).rejects.toThrow("boom");
  });
});
