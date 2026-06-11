import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin, preflight, withCors } from "../src/lib/cors";

describe("isAllowedOrigin", () => {
  it("allows the production origins exactly", () => {
    expect(isAllowedOrigin("https://festra.au")).toBe(true);
    expect(isAllowedOrigin("https://www.festra.au")).toBe(true);
    expect(isAllowedOrigin("https://festra.com.au")).toBe(true);
    expect(isAllowedOrigin("https://www.festra.com.au")).toBe(true);
  });

  it("allows localhost previews on any port, http or https", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost")).toBe(true);
    expect(isAllowedOrigin("https://localhost:8788")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("rejects lookalikes, subdomain tricks and junk", () => {
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
    expect(isAllowedOrigin("http://festra.au")).toBe(false); // http downgrade
    expect(isAllowedOrigin("https://festra.au.evil.com")).toBe(false);
    expect(isAllowedOrigin("https://evilfestra.au")).toBe(false);
    expect(isAllowedOrigin("https://festra.dev")).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.com")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.2:3000")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false); // sandboxed-iframe Origin
  });
});

describe("corsHeaders", () => {
  it("echoes the given origin, with credentials and Vary", () => {
    const h = corsHeaders("https://festra.au");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://festra.au");
    expect(h["Access-Control-Allow-Credentials"]).toBe("true");
    expect(h["Vary"]).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toContain("PUT");
  });
});

describe("withCors", () => {
  it("adds CORS headers for an allowed origin, preserving status and body", async () => {
    const res = withCors(
      new Response(JSON.stringify({ ok: true }), { status: 418 }),
      "https://festra.au"
    );
    expect(res.status).toBe(418);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://festra.au");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("never echoes a non-allowlisted origin", () => {
    const res = withCors(new Response("x"), "https://evil.example");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("handles a missing origin (same-origin / curl) without CORS headers", () => {
    const res = withCors(new Response("x"), null);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

describe("preflight", () => {
  it("answers 204 with CORS headers for an allowed origin", () => {
    const res = preflight(
      new Request("https://api.festra.au/api/profile", {
        method: "OPTIONS",
        headers: { Origin: "https://festra.au" },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://festra.au");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });

  it("answers a bare 204 for a disallowed origin", () => {
    const res = preflight(
      new Request("https://api.festra.au/api/profile", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
