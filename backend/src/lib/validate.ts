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
const CURRENT_PREFS_VERSION = 1;
/** Per-user client cap - shared with the server-side roll-off in routes/clients.ts. */
export const MAX_CLIENTS = 30;
export const MAX_BODY_BYTES = 64_000;
const MAX_TEXT = 80;
const MAX_CLIENT_ID = 64;
const MAX_PREF_LIST = 100;
const MAX_PREF_SAVED_CHECKS = 50;
const MAX_PREF_WEIGHT = 60;
const MAX_PREF_ANCHORS = 20;

// RFC 5321 caps the forward path at 254 octets.
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_8601_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

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

// --- mlv-user-prefs-v1 payload ---------------------------------------------

const PREF_WEIGHT_DOMAINS = [
  "affordability",
  "transport",
  "safety",
  "health",
  "hazards",
  "education",
  "income",
] as const;

type PrefWeightDomain = (typeof PREF_WEIGHT_DOMAINS)[number];
type PrefWeights = Partial<Record<PrefWeightDomain, number>>;

export type PrefInterestView =
  | "general"
  | "rental"
  | "homeBuyer"
  | "education"
  | "dataQuality"
  | "family"
  | "retiree";

const PREF_INTEREST_VIEWS: PrefInterestView[] = [
  "general",
  "rental",
  "homeBuyer",
  "education",
  "dataQuality",
  "family",
  "retiree",
];

export type PrefRecentPlace = {
  slug: string;
  name: string;
  viewedAt: string;
};

export type PrefSavedCheck = {
  id: string;
  lat: number;
  lng: number;
  areaName?: string;
  label?: string;
  savedAt: string;
};

export type PrefAnchorKind = "work" | "school" | "family" | "other";

export type PrefBuyerAnchor = {
  id: string;
  kind: PrefAnchorKind;
  label: string;
  lng: number;
  lat: number;
};

export type PrefBuyerProfile = {
  mode: "buyer";
  intent?: "buy" | "rent";
  household?: "solo" | "couple" | "family" | "share" | "retiree";
  car?: "no_car" | "one_car" | "multi_car";
  commuteLabel?: string;
  anchors?: PrefBuyerAnchor[];
  quiet?: "low" | "medium" | "high";
  transport?: "low" | "medium" | "high";
  dealBreakers?: Array<
    "flood" | "bushfire" | "heritage" | "noise" | "industry" | "poor_transport"
  >;
  updatedAt?: string;
};

/** Server copy of the device-local mlv-user-prefs-v1 record plus sync clock. */
export type PrefsPayload = {
  version: 1;
  updatedAt: string;
  weights?: PrefWeights;
  interestView?: PrefInterestView;
  shortlist: string[];
  recent: PrefRecentPlace[];
  savedChecks: PrefSavedCheck[];
  alertEmail?: string | null;
  colorblindRamp?: boolean;
  buyerProfile?: PrefBuyerProfile;
};

function parseInterestView(raw: unknown): PrefInterestView | undefined {
  return typeof raw === "string" && (PREF_INTEREST_VIEWS as string[]).includes(raw)
    ? (raw as PrefInterestView)
    : undefined;
}

function clampPrefWeight(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.min(MAX_PREF_WEIGHT, Math.max(0, raw));
}

function cleanPrefWeights(raw: unknown): PrefWeights | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const weights: PrefWeights = {};
  for (const domain of PREF_WEIGHT_DOMAINS) {
    const n = clampPrefWeight(input[domain]);
    if (n !== undefined) weights[domain] = n;
  }
  return Object.keys(weights).length > 0 ? weights : undefined;
}

function cleanStringList(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= cap) break;
    const text = cleanText(item);
    if (text) out.push(text);
  }
  return out;
}

function cleanRecentPlaces(raw: unknown): PrefRecentPlace[] {
  if (!Array.isArray(raw)) return [];
  const out: PrefRecentPlace[] = [];
  for (const item of raw) {
    if (out.length >= MAX_PREF_LIST) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const slug = cleanText(entry.slug);
    const name = cleanText(entry.name);
    const viewedAt = cleanIsoTimestamp(entry.viewedAt);
    if (!slug || !name || !viewedAt) continue;
    out.push({ slug, name, viewedAt });
  }
  return out;
}

function cleanLat(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= -90 && raw <= 90
    ? raw
    : undefined;
}

function cleanLng(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= -180 && raw <= 180
    ? raw
    : undefined;
}

function cleanSavedChecks(raw: unknown): PrefSavedCheck[] {
  if (!Array.isArray(raw)) return [];
  const out: PrefSavedCheck[] = [];
  for (const item of raw) {
    if (out.length >= MAX_PREF_SAVED_CHECKS) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = cleanText(entry.id);
    const lat = cleanLat(entry.lat);
    const lng = cleanLng(entry.lng);
    const savedAt = cleanIsoTimestamp(entry.savedAt);
    if (!id || lat === undefined || lng === undefined || !savedAt) continue;
    const check: PrefSavedCheck = { id, lat, lng, savedAt };
    const areaName = cleanText(entry.areaName);
    const label = cleanText(entry.label);
    if (areaName) check.areaName = areaName;
    if (label) check.label = label;
    out.push(check);
  }
  return out;
}

function parseOneOf<T extends string>(raw: unknown, values: readonly T[]): T | undefined {
  return typeof raw === "string" && (values as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

function cleanBuyerAnchors(raw: unknown): PrefBuyerAnchor[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PrefBuyerAnchor[] = [];
  for (const item of raw) {
    if (out.length >= MAX_PREF_ANCHORS) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = cleanText(entry.id);
    const kind = parseOneOf(entry.kind, ["work", "school", "family", "other"] as const);
    const label = cleanText(entry.label);
    const lng = cleanLng(entry.lng);
    const lat = cleanLat(entry.lat);
    if (!id || !kind || !label || lng === undefined || lat === undefined) continue;
    out.push({ id, kind, label, lng, lat });
  }
  return out.length > 0 ? out : undefined;
}

function cleanDealBreakers(raw: unknown): PrefBuyerProfile["dealBreakers"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<PrefBuyerProfile["dealBreakers"]> = [];
  const seen = new Set<string>();
  const allowed = [
    "flood",
    "bushfire",
    "heritage",
    "noise",
    "industry",
    "poor_transport",
  ] as const;
  for (const item of raw) {
    const id = parseOneOf(item, allowed);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : undefined;
}

function cleanBuyerProfile(raw: unknown): PrefBuyerProfile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const mode = parseOneOf(input.mode, ["buyer", "agent"] as const);
  if (!mode) return undefined;
  const profile: PrefBuyerProfile = { mode: "buyer" };
  const intent = parseOneOf(input.intent, ["buy", "rent"] as const);
  const household = parseOneOf(input.household, [
    "solo",
    "couple",
    "family",
    "share",
    "retiree",
  ] as const);
  const car = parseOneOf(input.car, ["no_car", "one_car", "multi_car"] as const);
  const quiet = parseOneOf(input.quiet, ["low", "medium", "high"] as const);
  const transport = parseOneOf(input.transport, ["low", "medium", "high"] as const);
  const commuteLabel = cleanText(input.commuteLabel);
  const anchors = cleanBuyerAnchors(input.anchors);
  const dealBreakers = cleanDealBreakers(input.dealBreakers);
  const updatedAt = cleanIsoTimestamp(input.updatedAt);
  if (intent) profile.intent = intent;
  if (household) profile.household = household;
  if (car) profile.car = car;
  if (commuteLabel) profile.commuteLabel = commuteLabel;
  if (anchors) profile.anchors = anchors;
  if (quiet) profile.quiet = quiet;
  if (transport) profile.transport = transport;
  if (dealBreakers) profile.dealBreakers = dealBreakers;
  if (updatedAt) profile.updatedAt = updatedAt;
  return profile;
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

function cleanClientId(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const id = v.trim();
  return id.length > 0 && id.length <= MAX_CLIENT_ID ? id : undefined;
}

function cleanIsoTimestamp(v: unknown): string | undefined {
  if (typeof v !== "string" || !ISO_8601_UTC_RE.test(v)) return undefined;
  return Number.isNaN(Date.parse(v)) ? undefined : v;
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
    // Client ids are device-minted and referenced locally; invalid ids are dropped, not regenerated.
    const id = cleanClientId(entry.id);
    const label = cleanText(entry.label);
    const createdAt = cleanIsoTimestamp(entry.createdAt);
    if (!id || !label || !createdAt || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      createdAt,
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
 * Read an arbitrary parsed JSON body into the current prefs sync shape, or
 * null. Wrong/missing version and missing/invalid sync updatedAt reject the
 * whole record; field-level drift is cleaned away so devices converge on the
 * stored server shape.
 */
export function sanitizePrefsPayload(parsed: unknown): PrefsPayload | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== CURRENT_PREFS_VERSION) return null;
  const updatedAt = cleanIsoTimestamp(p.updatedAt);
  if (!updatedAt) return null;

  const prefs: PrefsPayload = {
    version: 1,
    updatedAt,
    shortlist: cleanStringList(p.shortlist, MAX_PREF_LIST),
    recent: cleanRecentPlaces(p.recent),
    savedChecks: cleanSavedChecks(p.savedChecks),
  };

  const weights = cleanPrefWeights(p.weights);
  const interestView = parseInterestView(p.interestView);
  const buyerProfile = cleanBuyerProfile(p.buyerProfile);
  if (weights) prefs.weights = weights;
  if (interestView) prefs.interestView = interestView;
  if ("alertEmail" in p) prefs.alertEmail = normalizeEmail(p.alertEmail);
  if (typeof p.colorblindRamp === "boolean") prefs.colorblindRamp = p.colorblindRamp;
  if (buyerProfile) prefs.buyerProfile = buyerProfile;
  return prefs;
}

/**
 * Body guard for POST /api/clients: a label that survives cleanText, or
 * null. Length cap matches the client-side MAX_TEXT.
 */
export function parseClientLabel(raw: unknown): string | null {
  return cleanText(raw) ?? null;
}
