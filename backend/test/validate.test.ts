import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  parseClientLabel,
  parsePurchaseStatus,
  parseSku,
  parseUserKind,
  sanitizePrefsPayload,
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
          { id: "c3", label: "Third" }, // missing createdAt -> dropped
        ],
        activeClientId: "c3",
      },
      NOW
    );
    expect(out?.clients).toEqual([{ id: "c1", label: "First", createdAt: NOW }]);
    expect(out?.activeClientId).toBe("c1");
  });

  it("drops clients with oversized ids or non-ISO createdAt values", () => {
    const out = sanitizeProfilePayload(
      {
        version: 1,
        type: "agent",
        createdAt: NOW,
        clients: [
          { id: "x".repeat(65), label: "Too Long", createdAt: NOW },
          { id: "ok-id", label: "Bad Date", createdAt: "yesterday" },
          { id: "good-id", label: "Good", createdAt: NOW },
        ],
      },
      NOW
    );
    expect(out?.clients).toEqual([{ id: "good-id", label: "Good", createdAt: NOW }]);
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

describe("sanitizePrefsPayload", () => {
  it("accepts and cleans a current prefs record", () => {
    const out = sanitizePrefsPayload({
      version: 1,
      updatedAt: NOW,
      weights: { affordability: 30, transport: 18, equity: 99 },
      interestView: "homeBuyer",
      shortlist: [" carlton ", 42, ""],
      recent: [{ slug: " fitzroy ", name: " Fitzroy ", viewedAt: NOW }],
      savedChecks: [
        {
          id: " -37.80000,144.97000 ",
          lat: -37.8,
          lng: 144.97,
          areaName: " Carlton ",
          label: " Near park ",
          savedAt: NOW,
        },
      ],
      alertEmail: "  Sam@Festra.AU ",
      colorblindRamp: true,
      buyerProfile: {
        mode: "agent",
        intent: "buy",
        household: "family",
        car: "one_car",
        commuteLabel: "  CBD  ",
        anchors: [{ id: "a1", kind: "work", label: " Office ", lng: 144.96, lat: -37.81 }],
        quiet: "high",
        transport: "medium",
        dealBreakers: ["flood", "flood", "noise", "bad"],
        updatedAt: NOW,
        removed: "field",
      },
      personaId: "family",
      junk: true,
    });

    expect(out).toEqual({
      version: 1,
      updatedAt: NOW,
      weights: { affordability: 30, transport: 18 },
      interestView: "homeBuyer",
      shortlist: ["carlton"],
      recent: [{ slug: "fitzroy", name: "Fitzroy", viewedAt: NOW }],
      savedChecks: [
        {
          id: "-37.80000,144.97000",
          lat: -37.8,
          lng: 144.97,
          areaName: "Carlton",
          label: "Near park",
          savedAt: NOW,
        },
      ],
      alertEmail: "sam@festra.au",
      colorblindRamp: true,
      buyerProfile: {
        mode: "buyer",
        intent: "buy",
        household: "family",
        car: "one_car",
        commuteLabel: "CBD",
        anchors: [{ id: "a1", kind: "work", label: "Office", lng: 144.96, lat: -37.81 }],
        quiet: "high",
        transport: "medium",
        dealBreakers: ["flood", "noise"],
        updatedAt: NOW,
      },
    });
    expect(out).not.toHaveProperty("personaId");
    expect(out).not.toHaveProperty("junk");
  });

  it("rejects unknown versions, missing sync clocks and non-objects wholesale", () => {
    expect(sanitizePrefsPayload({ version: 2, updatedAt: NOW })).toBeNull();
    expect(sanitizePrefsPayload({ version: 1 })).toBeNull();
    expect(sanitizePrefsPayload({ version: 1, updatedAt: "yesterday" })).toBeNull();
    expect(sanitizePrefsPayload(null)).toBeNull();
    expect(sanitizePrefsPayload([])).toBeNull();
  });

  it("caps list fields and text widths", () => {
    const out = sanitizePrefsPayload({
      version: 1,
      updatedAt: NOW,
      shortlist: Array.from({ length: 105 }, (_, i) => ` ${"s".repeat(90)}-${i} `),
      recent: Array.from({ length: 105 }, (_, i) => ({
        slug: `recent-${i}`,
        name: ` ${"n".repeat(90)} `,
        viewedAt: NOW,
      })),
      savedChecks: Array.from({ length: 55 }, (_, i) => ({
        id: `check-${i}`,
        lat: -37 + i * 0.001,
        lng: 144 + i * 0.001,
        savedAt: NOW,
      })),
    });
    expect(out?.shortlist).toHaveLength(100);
    expect(out?.shortlist[0]).toHaveLength(80);
    expect(out?.recent).toHaveLength(100);
    expect(out?.recent[0]!.name).toHaveLength(80);
    expect(out?.savedChecks).toHaveLength(50);
  });

  it("clamps numeric weights to 0-60 and drops unknown or non-numeric entries", () => {
    const out = sanitizePrefsPayload({
      version: 1,
      updatedAt: NOW,
      weights: {
        affordability: -5,
        transport: 61,
        safety: Number.NaN,
        health: "10",
        education: 22.5,
        greenSpace: 50,
      },
    });
    expect(out?.weights).toEqual({ affordability: 0, transport: 60, education: 22.5 });
  });

  it("guards prefs enums and drops malformed saved checks / buyer profile fields", () => {
    const out = sanitizePrefsPayload({
      version: 1,
      updatedAt: NOW,
      interestView: "youngPro",
      savedChecks: [
        { id: "bad-lat", lat: "no", lng: 144, savedAt: NOW },
        { id: "bad-lng", lat: -37, lng: 181, savedAt: NOW },
        { id: "bad-date", lat: -37, lng: 144, savedAt: "today" },
        { id: "ok", lat: -37, lng: 144, savedAt: NOW },
      ],
      alertEmail: "not-an-email",
      buyerProfile: {
        mode: "buyer",
        intent: "own",
        anchors: [
          { id: "bad", kind: "mars", label: "Bad", lng: 144, lat: -37 },
          { id: "ok", kind: "family", label: "Mum", lng: 144.9, lat: -37.8 },
        ],
        quiet: "urgent",
        dealBreakers: ["industry", "unknown"],
      },
    });
    expect(out?.interestView).toBeUndefined();
    expect(out?.savedChecks).toEqual([{ id: "ok", lat: -37, lng: 144, savedAt: NOW }]);
    expect(out?.alertEmail).toBeNull();
    expect(out?.buyerProfile).toEqual({
      mode: "buyer",
      anchors: [{ id: "ok", kind: "family", label: "Mum", lng: 144.9, lat: -37.8 }],
      dealBreakers: ["industry"],
    });
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
