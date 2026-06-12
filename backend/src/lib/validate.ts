/**
 * Input validation and payload sanitizers - pure, no bindings.
 *
 * The profile sanitizer mirrors the device-local festra-profile-v1 shape and
 * the sanitizeProfile discipline in lib/user-profile.ts (repo root): unknown
 * versions/types are rejected wholesale (null - never a guess, never a
 * throw), while field-level drift (poisoned name, malformed clients) is
 * cleaned away and the record survives. Backend stays self-contained, so the
 * shape is restated here - if lib/user-profile.ts changes its schema, change
 * this file in the same commit.
 *
 * Enum guards follow the parseProfileType pattern (cf. the lens-id live
 * incident 2026-06-11): a string written by an older/newer build must never
 * reach a switch as a trusted value.
 */

// --- constants kept identical to lib/user-profile.ts -----------------------
const CURRENT_PROFILE_VERSION = 1;
/** Per-user client cap - shared with the server-side roll-off in routes/clients.ts. */
export const MAX_CLIENTS = 30;
const MAX_TEXT = 80;

// RFC 5321 caps the forward path at 254 octets.
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trimmed, lowercased email or null. Deliberately a sanity shape-check, not
 * RFC 5322 - the magic-link email send is the real verification.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL) return null;
  return EMAIL_RE.test(email) ? email : null;
}

// --- enum guards ------------------------------------------------------------

export type UserKind = "buyer" | "agent";

/** users.kind / profile type guard. Junk -> null, never a trusted value. */
export function parseUserKind(raw: unknown): UserKind | null {
  return raw === "buyer" || raw === "agent" ? raw : null;
}

export type PurchaseSku = "snapshot39" | "premium59";

/** purchases.sku guard. Prices live with checkout, not here. */
export function parseSku(raw: unknown): PurchaseSku | null {
  return raw === "snapshot39" || raw === "premium59" ? raw : null;
}

export type PurchaseStatus = "pending" | "paid" | "failed" | "refunded";

/** purchases.status guard (webhook writes, /api/me reads). */
export function parsePurchaseStatus(raw: unknown): PurchaseStatus | null {
  return raw === "pending" || raw === "paid" || raw === "failed" || raw === "refunded"
    ? raw
    : null;
}

// --- festra-profile-v1 payload ----------------------------------------------

/** Mirrors AgentClient in lib/user-profile.ts. */
export type AgentClient = {
  id: string;
  label: string;
  createdAt: string;
};

/** Mirrors UserProfile in lib/user-profile.ts (the profiles.payload JSON). */
export type ProfilePayload = {
  version: 1;
  type: UserKind;
  name?: string;
  createdAt: string;
  clients?: AgentClient[];
  activeClientId?: string;
};

/** Trimmed, length-capped display text; anything non-string/empty -> undefined. */
function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_TEXT);
  return t.length > 0 ? t : undefined;
}

/** Drop malformed / duplicate client entries; never throw on poisoned shapes. */
function cleanClients(v: unknown, now: string): AgentClient[] {
  if (!Array.isArray(v)) return [];
  const out: AgentClient[] = [];
  const seen = new Set<string>();
  for (const c of v) {
    if (out.length >= MAX_CLIENTS) break;
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const entry = c as Record<string, unknown>;
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null;
    const label = cleanText(entry.label);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
    });
  }
  return out;
}

/**
 * Read an arbitrary parsed JSON body into the current profile shape, or
 * null. Same rules as the client-side sanitizer: wrong/missing version or
 * unknown type rejects the record; bad fields are dropped; an agent's
 * dangling activeClientId falls back to the first client; buyers never
 * carry clients.
 *
 * `now` is injectable for tests; defaults to the current instant.
 */
export function sanitizeProfilePayload(
  parsed: unknown,
  now: string = new Date().toISOString()
): ProfilePayload | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== CURRENT_PROFILE_VERSION) return null;
  const type = parseUserKind(p.type);
  if (!type) return null;
  const profile: ProfilePayload = {
    version: 1,
    type,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : now,
  };
  const name = cleanText(p.name);
  if (name) profile.name = name;
  if (type === "agent") {
    const clients = cleanClients(p.clients, now);
    if (clients.length > 0) {
      profile.clients = clients;
      const active = typeof p.activeClientId === "string" ? p.activeClientId : null;
      profile.activeClientId = clients.some((c) => c.id === active)
        ? (active as string)
        : clients[0]!.id;
    }
  }
  return profile;
}

/**
 * Body guard for POST /api/clients: a label that survives cleanText, or
 * null. Length cap matches the client-side MAX_TEXT.
 */
export function parseClientLabel(raw: unknown): string | null {
  return cleanText(raw) ?? null;
}
