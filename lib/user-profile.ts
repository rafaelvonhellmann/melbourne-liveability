/**
 * Local-only identity profile for the post-landing setup flow: WHO is using
 * the window (a buyer, or an agent working with buyers), persisted under its
 * own versioned key.
 *
 * Scope split - extend, never duplicate:
 * - lib/user-prefs.ts owns map preferences AND the buyer "fit" profile
 *   (BuyerProfile with anchors / deal-breakers) under mlv-user-prefs-v1. The
 *   map page reads profile?.anchors from THERE; this module stores no fit
 *   data and no anchors - it is the identity layer on top.
 * - components/Landing.tsx persists the raw final-band card choice under
 *   PROFILE_CHOICE_KEY before onProfileChoice fires; ProfileSetup turns that
 *   choice into this record.
 *
 * The stored record is INERT beyond getProfileGreeting() for now. Wiring it
 * into scores, anchors or report framing is a deliberate follow-up.
 */

export const PROFILE_STORAGE_KEY = "festra-profile-v1";
const CURRENT_PROFILE_VERSION = 1;
const MAX_CLIENTS = 30;
const MAX_TEXT = 80;

/**
 * Same-tab notification that the stored profile changed (the native `storage`
 * event only fires in other tabs). Mirrors PREFS_CHANGED_EVENT in user-prefs.
 */
export const PROFILE_CHANGED_EVENT = "festra:profile-changed";

export type ProfileType = "buyer" | "agent";

/** Lightweight sub-profile an agent can switch between (label only for now). */
export type AgentClient = {
  id: string;
  label: string;
  createdAt: string;
};

export type UserProfile = {
  version: 1;
  type: ProfileType;
  /** First name (buyer) or name/agency (agent). Display only. */
  name?: string;
  /** ISO timestamp from the first save; preserved across re-saves. */
  createdAt: string;
  /** Agent only: clients this agent works with. Never present for buyers. */
  clients?: AgentClient[];
  /** Agent only: which client is currently active (always set when clients exist). */
  activeClientId?: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Enum drift guard, same pattern as parseInterestView in lib/interest-views:
 * a type written by an older/newer build must never reach a switch as a
 * trusted value (cf. the lens-id live incident 2026-06-11).
 */
export function parseProfileType(raw: string | null): ProfileType | null {
  return raw === "buyer" || raw === "agent" ? raw : null;
}

/** Trimmed, length-capped display text; anything non-string/empty -> undefined. */
function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_TEXT);
  return t.length > 0 ? t : undefined;
}

/** Drop malformed / duplicate client entries; never throw on poisoned shapes. */
function cleanClients(v: unknown): AgentClient[] {
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
      createdAt:
        typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Read an arbitrary parsed payload into the current shape, or null. Unknown
 * shapes (wrong version, unknown type, non-object) are null - never a guess,
 * never a throw. Field-level drift (poisoned name, malformed clients) is
 * sanitized away while the record survives.
 */
function sanitizeProfile(parsed: unknown): UserProfile | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  // This key has only ever been written with version 1; a missing, future or
  // junk version is an unknown schema -> defaults (null), not a silent merge.
  if (p.version !== CURRENT_PROFILE_VERSION) return null;
  const type = parseProfileType(typeof p.type === "string" ? p.type : null);
  if (!type) return null;
  const profile: UserProfile = {
    version: 1,
    type,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
  };
  const name = cleanText(p.name);
  if (name) profile.name = name;
  if (type === "agent") {
    const clients = cleanClients(p.clients);
    if (clients.length > 0) {
      profile.clients = clients;
      const active = typeof p.activeClientId === "string" ? p.activeClientId : null;
      // A dangling active id (client deleted, drifted payload) falls back to
      // the first client, so an agent with clients always has an active one.
      profile.activeClientId = clients.some((c) => c.id === active)
        ? (active as string)
        : clients[0].id;
    }
  }
  return profile;
}

/** The saved profile, or null if none / unreadable. Never throws. */
export function loadProfile(): UserProfile | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persist(profile: UserProfile): void {
  if (!isBrowser()) return;
  // setItem throws when storage is blocked/full (Safari private mode, quota).
  // These writers run from click handlers - degrade silently, never crash.
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable - the profile is simply not retained */
  }
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

export type SaveProfileInput = {
  type: ProfileType;
  name?: string;
  createdAt?: string;
  clients?: AgentClient[];
  activeClientId?: string;
};

/**
 * Save (replace) the profile. createdAt is preserved from an existing record
 * unless explicitly provided; all fields pass through the same sanitizer that
 * guards loads, so caps and the buyer-has-no-clients rule hold on write too.
 */
export function saveProfile(input: SaveProfileInput): UserProfile {
  const existing = loadProfile();
  const profile =
    sanitizeProfile({
      version: CURRENT_PROFILE_VERSION,
      type: input.type,
      name: input.name,
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
      clients: input.clients,
      activeClientId: input.activeClientId,
    }) ??
    // Unreachable for valid ProfileType inputs; satisfies the type system.
    { version: 1 as const, type: input.type, createdAt: new Date().toISOString() };
  persist(profile);
  return profile;
}

function newClientId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the time-based id */
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Agent only: add a client and make it the active one. A buyer profile (or no
 * profile, or a blank label) is a no-op that returns the current state.
 */
export function addClient(label: string): UserProfile | null {
  const profile = loadProfile();
  if (!profile || profile.type !== "agent") return profile;
  const clean = cleanText(label);
  if (!clean) return profile;
  const client: AgentClient = {
    id: newClientId(),
    label: clean,
    createdAt: new Date().toISOString(),
  };
  // At the cap, the oldest client rolls off (clients are in creation order).
  const clients = [...(profile.clients ?? []), client].slice(-MAX_CLIENTS);
  const next: UserProfile = { ...profile, clients, activeClientId: client.id };
  persist(next);
  return next;
}

/** Agent only: switch the active client. Unknown ids leave the state untouched. */
export function setActiveClient(id: string): UserProfile | null {
  const profile = loadProfile();
  if (!profile || profile.type !== "agent") return profile;
  if (!(profile.clients ?? []).some((c) => c.id === id)) return profile;
  const next: UserProfile = { ...profile, activeClientId: id };
  persist(next);
  return next;
}

/** Forget the stored profile entirely. */
export function clearProfile(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

/** The active client record for an agent profile, or null. */
export function getActiveClient(
  profile: UserProfile | null = loadProfile()
): AgentClient | null {
  if (!profile || profile.type !== "agent" || !profile.clients) return null;
  return profile.clients.find((c) => c.id === profile.activeClientId) ?? null;
}

/**
 * Greeting seam - the ONLY consumer surface of the stored profile for now.
 * Buyers: "Welcome back, Sam". Agents additionally surface the active client
 * label. Deliberately inert beyond this string: wiring the profile into
 * scores, anchors or report framing is a follow-up (the fit layer that
 * already feeds the report lives in lib/user-prefs as buyerProfile).
 */
export function getProfileGreeting(): string | null {
  const profile = loadProfile();
  if (!profile) return null;
  const name = profile.name ? `, ${profile.name}` : "";
  if (profile.type === "agent") {
    const client = getActiveClient(profile);
    return client
      ? `Welcome back${name} - viewing for ${client.label}`
      : `Welcome back${name}`;
  }
  return `Welcome back${name}`;
}
