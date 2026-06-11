import { describe, expect, it } from "vitest";
import { constantTimeEqual, hashToken, newToken } from "../src/lib/token";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newToken", () => {
  it("returns a v4 UUID", () => {
    expect(newToken()).toMatch(UUID_RE);
  });

  it("never repeats across calls", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(seen.size).toBe(200);
  });
});

describe("hashToken", () => {
  it("matches the SHA-256 test vector for 'abc'", async () => {
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("matches the SHA-256 test vector for the empty string", async () => {
    expect(await hashToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("is deterministic and 64 lowercase hex chars", async () => {
    const t = newToken();
    const a = await hashToken(t);
    const b = await hashToken(t);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different tokens", async () => {
    expect(await hashToken("token-a")).not.toBe(await hashToken("token-b"));
  });
});

describe("constantTimeEqual", () => {
  it("accepts equal strings", () => {
    expect(constantTimeEqual("deadbeef", "deadbeef")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("rejects same-length differences anywhere in the string", () => {
    expect(constantTimeEqual("deadbeef", "deadbee0")).toBe(false);
    expect(constantTimeEqual("deadbeef", "0eadbeef")).toBe(false);
  });

  it("rejects different lengths, including prefixes", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("handles full hash-length inputs", async () => {
    const h = await hashToken("x");
    expect(constantTimeEqual(h, h)).toBe(true);
    expect(constantTimeEqual(h, h.slice(0, 63) + (h.endsWith("0") ? "1" : "0"))).toBe(false);
  });
});
