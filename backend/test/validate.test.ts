import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  parseClientLabel,
  parsePurchaseStatus,
  parseSku,
  parseUserKind,
  sanitizeProfilePayload,
} from "../src/lib/validate";

const NOW = "2026-06-11T00:00:00.000Z";

describe("normalizeEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  Sam@Festra.AU ")).toBe("sam@festra.au");
  });

  it("rejects non-strings and empties", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail({ email: "a@b.co" })).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("rejects shapes that cannot be a deliverable address", () => {
    expect(normalizeEmail("no-at-sign")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull(); // no dot in domain
    expect(normalizeEmail("a b@c.co")).toBeNull(); // space in local part
    expect(normalizeEmail("a@b c.co")).toBeNull(); // space in domain
    expect(normalizeEmail("@b.co")).toBeNull();
    expect(normalizeEmail("a@")).toBeNull();
  });

  it("rejects addresses over the 254-char RFC cap", () => {
    const long = "a".repeat(250) + "@b.co"; // 255 chars
    expect(normalizeEmail(long)).toBeNull();
  });
});

describe("enum guards (drift discipline)", () => {
  it("parseUserKind: known values pass, everything else is null", () => {
    expect(parseUserKind("buyer")).toBe("buyer");
    expect(parseUserKind("agent")).toBe("agent");
    expect(parseUserKind("admin")).toBeNull();
    expect(parseUserKind("Buyer")).toBeNull();
    expect(parseUserKind("")).toBeNull();
    expect(parseUserKind(null)).toBeNull();
    expect(parseUserKind(1)).toBeNull();
  });

  it("parseSku: only the two live SKUs", () => {
    expect(parseSku("snapshot39")).toBe("snapshot39");
    expect(parseSku("premium59")).toBe("premium59");
    expect(parseSku("snapshot")).toBeNull();
    expect(parseSku("premium99")).toBeNull();
    expect(parseSku(undefined)).toBeNull();
  });

  it("parsePurchaseStatus: only schema-checked statuses", () => {
    expect(parsePurchaseStatus("pending")).toBe("pending");
    expect(parsePurchaseStatus("paid")).toBe("paid");
    expect(parsePurchaseStatus("failed")).toBe("failed");
    expect(parsePurchaseStatus("refunded")).toBe("refunded");
    expect(parsePurchaseStatus("complete")).toBeNull();
    expect(parsePurchaseStatus(null)).toBeNull();
  });
});

describe("sanitizeProfilePayload", () => {
  it("accepts a minimal buyer record", () => {
    expect(
      sanitizeProfilePayload({ version: 1, type: "buyer", createdAt: NOW }, NOW)
    ).toEqual({ version: 1, type: "buyer", createdAt: NOW });
  });

  it("keeps a clean name and drops a junk one", () => {
    expect(
      sanitizeProfilePayload({ version: 1, type: "buyer", name: "  Sam ", createdAt: NOW }, NOW)
    ).toEqual({ version: 1, type: "buyer", name: "Sam", createdAt: NOW });
    expect(
      sanitizeProfilePayload({ version: 1, type: "buyer", name: 42, createdAt: NOW }, NOW)
    ).toEqual({ version: 1, type: "buyer", createdAt: NOW });
  });

  it("caps name at 80 chars (MAX_TEXT parity with lib/user-profile.ts)", () => {
    const out = sanitizeProfilePayload(
      { version: 1, type: "buyer", name: "x".repeat(200), createdAt: NOW },
      NOW
    );
    expect(out?.name).toHaveLength(80);
  });

  it("rejects unknown versions, unknown types and non-objects wholesale", () => {
    expect(sanitizeProfilePayload({ version: 2, type: "buyer", createdAt: NOW }, NOW)).toBeNull();
    expect(sanitizeProfilePayload({ type: "buyer", createdAt: NOW }, NOW)).toBeNull();
    expect(sanitizeProfilePayload({ version: 1, type: "admin", createdAt: NOW }, NOW)).toBeNull();
    expect(sanitizeProfilePayload(null, NOW)).toBeNull();
    expect(sanitizeProfilePayload([], NOW)).toBeNull();
    expect(sanitizeProfilePayload("buyer", NOW)).toBeNull();
  });

  it("fills a missing/junk createdAt with the injected now", () => {
    expect(sanitizeProfilePayload({ version: 1, type: "buyer" }, NOW)?.createdAt).toBe(NOW);
    expect(
      sanitizeProfilePayload({ version: 1, type: "buyer", createdAt: 99 }, NOW)?.createdAt
    ).toBe(NOW);
  });

  it("keeps agent clients, dedupes ids and drops malformed entries", () => {
    const out = sanitizeProfilePayload(
      {
        version: 1,
        type: "agent",
        createdAt: NOW,
        clients: [
          { id: "c1", label: "First", createdAt: NOW },
          { id: "c1", label: "Dup id", createdAt: NOW },
          { id: "c2", label: "   ", createdAt: NOW }, // blank label
          { id: "", label: "No id", createdAt: NOW },
          "junk",
          { id: "c3", label: "Third" }, // missing createdAt -> now
        ],
        activeClientId: "c3",
      },
      NOW
    );
    expect(out?.clients).toEqual([
      { id: "c1", label: "First", createdAt: NOW },
      { id: "c3", label: "Third", createdAt: NOW },
    ]);
    expect(out?.activeClientId).toBe("c3");
  });

  it("repoints a dangling activeClientId at the first client", () => {
    const out = sanitizeProfilePayload(
      {
        version: 1,
        type: "agent",
        createdAt: NOW,
        clients: [{ id: "c1", label: "Only", createdAt: NOW }],
        activeClientId: "deleted",
      },
      NOW
    );
    expect(out?.activeClientId).toBe("c1");
  });

  it("caps clients at 30 (MAX_CLIENTS parity)", () => {
    const clients = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      label: `Client ${i}`,
      createdAt: NOW,
    }));
    const out = sanitizeProfilePayload(
      { version: 1, type: "agent", createdAt: NOW, clients },
      NOW
    );
    expect(out?.clients).toHaveLength(30);
  });

  it("strips clients from buyers (buyer-has-no-clients rule)", () => {
    const out = sanitizeProfilePayload(
      {
        version: 1,
        type: "buyer",
        createdAt: NOW,
        clients: [{ id: "c1", label: "Sneaky", createdAt: NOW }],
        activeClientId: "c1",
      },
      NOW
    );
    expect(out).toEqual({ version: 1, type: "buyer", createdAt: NOW });
  });

  it("omits clients/activeClientId for an agent with zero valid clients", () => {
    const out = sanitizeProfilePayload(
      { version: 1, type: "agent", createdAt: NOW, clients: ["junk"], activeClientId: "x" },
      NOW
    );
    expect(out).toEqual({ version: 1, type: "agent", createdAt: NOW });
  });
});

describe("parseClientLabel", () => {
  it("trims and caps a valid label", () => {
    expect(parseClientLabel("  The Nguyens  ")).toBe("The Nguyens");
    expect(parseClientLabel("x".repeat(200))).toHaveLength(80);
  });

  it("rejects empties and non-strings", () => {
    expect(parseClientLabel("   ")).toBeNull();
    expect(parseClientLabel("")).toBeNull();
    expect(parseClientLabel(7)).toBeNull();
    expect(parseClientLabel(undefined)).toBeNull();
  });
});
