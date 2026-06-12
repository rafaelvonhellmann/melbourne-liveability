import type { ScoreWeights } from "./types";
import {
  legacyPersonaToView,
  parseInterestView,
  type InterestViewId,
} from "./interest-views";
import type { BuyerProfile } from "./buyer-fit";

const STORAGE_KEY = "mlv-user-prefs-v1";
const CURRENT_PREFS_VERSION = 1;
const MAX_SHORTLIST = 100;
const MAX_RECENT = 8;
const MAX_SAVED_CHECKS = 50;

/**
 * Same-tab notification that persisted prefs changed. The native `storage`
 * event only fires in *other* tabs, so we dispatch this for in-tab listeners
 * (e.g. the shortlist panel) to re-hydrate without a reload.
 */
export const PREFS_CHANGED_EVENT = "mlv:prefs-changed";

export type RecentPlace = {
  slug: string;
  name: string;
  viewedAt: string;
};

/**
 * A saved Buyer "Location Check" - a pin the user wants to return to (device-local
 * only; cross-device would need an accounts service). The deterministic report
 * regenerates from the coordinates, so we persist the location, not the report.
 */
export type SavedCheck = {
  /** Stable id derived from the rounded coordinate. */
  id: string;
  lat: number;
  lng: number;
  /** SA2 name if the pin was inside coverage when saved. */
  areaName?: string;
  /** Address / short label if the pin came from an address search. */
  label?: string;
  savedAt: string;
};

export type UserPrefs = {
  version: 1;
  /** Client-supplied sync clock for /api/prefs whole-blob LWW. */
  updatedAt?: string;
  weights?: ScoreWeights;
  /** @deprecated Retired persona-preset id; kept so old stored prefs still parse. */
  personaId?: string | null;
  interestView?: InterestViewId;
  shortlist: string[];
  recent: RecentPlace[];
  savedChecks: SavedCheck[];
  alertEmail?: string | null;
  /** Use the colourblind-safe (RdYlBu) score ramp on the map. Display-only. */
  colorblindRamp?: boolean;
  /** Lightweight personal "fit for your life" profile. Local-only. */
  buyerProfile?: BuyerProfile;
};

export const DEFAULT_PREFS: UserPrefs = {
  version: 1,
  shortlist: [],
  recent: [],
  savedChecks: [],
};

/** Stable id for a saved check from its coordinate (5 dp ~= 1 m). */
export function savedCheckId(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

type StoredPrefs = Partial<Omit<UserPrefs, "version">> & { version?: unknown };

function cleanUpdatedAt(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  return Number.isNaN(Date.parse(v)) ? undefined : v;
}

/**
 * Reads a v1 payload into the current shape: spread over defaults, then clamp
 * the list fields and drop malformed entries. Identity migration today.
 */
function migrateFromV1(parsed: StoredPrefs): UserPrefs {
  const updatedAt = cleanUpdatedAt(parsed.updatedAt);
  return {
    ...DEFAULT_PREFS,
    ...parsed,
    version: CURRENT_PREFS_VERSION,
    updatedAt,
    // Enum drift guard: a lens id written by an older/newer build (persona-era
    // ids, rollback skew) must never reach INTEREST_VIEWS lookups - it crashed
    // every map route for returning visitors (live incident 2026-06-11).
    // A stored persona-era choice (the retired personaId field, P1-11) folds
    // into the lens it maps to, so an old visitor's saved lens survives the
    // persona retirement - but never over a valid stored interestView.
    interestView:
      parseInterestView((parsed.interestView as string | undefined) ?? null) ??
      legacyPersonaToView(
        typeof parsed.personaId === "string" ? parsed.personaId : null
      ) ??
      undefined,
    shortlist: Array.isArray(parsed.shortlist)
      ? parsed.shortlist.filter((s) => typeof s === "string").slice(0, MAX_SHORTLIST)
      : [],
    recent: Array.isArray(parsed.recent)
      ? parsed.recent.slice(0, MAX_RECENT)
      : [],
    savedChecks: Array.isArray(parsed.savedChecks)
      ? parsed.savedChecks
          .filter(
            (c): c is SavedCheck =>
              !!c &&
              typeof c === "object" &&
              Number.isFinite((c as SavedCheck).lat) &&
              Number.isFinite((c as SavedCheck).lng) &&
              ((c as SavedCheck).label === undefined ||
                typeof (c as SavedCheck).label === "string") &&
              ((c as SavedCheck).areaName === undefined ||
                typeof (c as SavedCheck).areaName === "string")
          )
          .slice(0, MAX_SAVED_CHECKS)
      : [],
  };
}

/**
 * Per-version readers into the current shape. Missing or non-numeric versions
 * read as v1 (every payload ever written had version 1 or none). A version
 * with no entry here (e.g. from a future build) falls back to defaults rather
 * than silently merging an unknown schema.
 */
const MIGRATIONS: Record<number, (parsed: StoredPrefs) => UserPrefs> = {
  1: migrateFromV1,
};

export function loadUserPrefs(): UserPrefs {
  if (!isBrowser()) return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as StoredPrefs;
    const version = typeof parsed.version === "number" ? parsed.version : 1;
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ...DEFAULT_PREFS };
    return migrate(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUserPrefs(
  prefs: UserPrefs,
  options: { preserveUpdatedAt?: boolean } = {}
): void {
  if (!isBrowser()) return;
  const updatedAt =
    options.preserveUpdatedAt && prefs.updatedAt
      ? prefs.updatedAt
      : new Date().toISOString();
  // setItem throws when storage is blocked/full (Safari private mode, quota).
  // These writers run from click handlers, which React error boundaries don't
  // catch - so a blocked store would crash the handler. Degrade to in-memory.
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        version: CURRENT_PREFS_VERSION,
        updatedAt,
        shortlist: prefs.shortlist.slice(0, MAX_SHORTLIST),
        recent: prefs.recent.slice(0, MAX_RECENT),
        savedChecks: (prefs.savedChecks ?? []).slice(0, MAX_SAVED_CHECKS),
      })
    );
  } catch {
    /* storage unavailable - prefs stay in memory for this session */
  }
  window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
}

export function addToShortlist(slug: string): UserPrefs {
  const prefs = loadUserPrefs();
  if (prefs.shortlist.includes(slug)) return prefs;
  const next = {
    ...prefs,
    shortlist: [slug, ...prefs.shortlist].slice(0, MAX_SHORTLIST),
  };
  saveUserPrefs(next);
  return next;
}

export function removeFromShortlist(slug: string): UserPrefs {
  const prefs = loadUserPrefs();
  const next = {
    ...prefs,
    shortlist: prefs.shortlist.filter((s) => s !== slug),
  };
  saveUserPrefs(next);
  return next;
}

export function trackRecentView(slug: string, name: string): UserPrefs {
  const prefs = loadUserPrefs();
  const filtered = prefs.recent.filter((r) => r.slug !== slug);
  const next = {
    ...prefs,
    recent: [{ slug, name, viewedAt: new Date().toISOString() }, ...filtered].slice(
      0,
      MAX_RECENT
    ),
  };
  saveUserPrefs(next);
  return next;
}

export function isInShortlist(slug: string): boolean {
  return loadUserPrefs().shortlist.includes(slug);
}

/** Save (or refresh) a Buyer Location Check pin. De-duped by rounded coordinate. */
export function addSavedCheck(
  check: Omit<SavedCheck, "id" | "savedAt"> & { savedAt?: string }
): UserPrefs {
  const prefs = loadUserPrefs();
  const id = savedCheckId(check.lat, check.lng);
  const entry: SavedCheck = {
    id,
    lat: check.lat,
    lng: check.lng,
    areaName: check.areaName,
    label: check.label,
    savedAt: check.savedAt ?? new Date().toISOString(),
  };
  const next = {
    ...prefs,
    savedChecks: [entry, ...prefs.savedChecks.filter((c) => c.id !== id)].slice(
      0,
      MAX_SAVED_CHECKS
    ),
  };
  saveUserPrefs(next);
  return next;
}

export function removeSavedCheck(id: string): UserPrefs {
  const prefs = loadUserPrefs();
  const next = {
    ...prefs,
    savedChecks: prefs.savedChecks.filter((c) => c.id !== id),
  };
  saveUserPrefs(next);
  return next;
}

export function isCheckSaved(lat: number, lng: number): boolean {
  const id = savedCheckId(lat, lng);
  return loadUserPrefs().savedChecks.some((c) => c.id === id);
}

/** The saved personal "fit" profile, or null if none set. Device-local. */
export function loadBuyerProfile(): BuyerProfile | null {
  const saved = loadUserPrefs().buyerProfile;
  if (!saved) return null;
  // Back-compat: old saved profiles may carry the retired "agent" mode or the
  // removed schools/safety/walkability importance keys - coerce/strip, never crash.
  const p = saved as BuyerProfile & Record<string, unknown>;
  return {
    mode: "buyer",
    intent: p.intent,
    household: p.household,
    car: p.car,
    commuteLabel: p.commuteLabel,
    anchors: p.anchors,
    quiet: p.quiet,
    transport: p.transport,
    dealBreakers: p.dealBreakers,
    updatedAt: p.updatedAt,
  };
}

/** Save (replace) the personal profile, stamping updatedAt. */
export function saveBuyerProfile(profile: BuyerProfile): UserPrefs {
  const prefs = loadUserPrefs();
  const next: UserPrefs = {
    ...prefs,
    buyerProfile: { ...profile, updatedAt: new Date().toISOString() },
  };
  saveUserPrefs(next);
  return next;
}

/** Forget the personal profile. */
export function clearBuyerProfile(): UserPrefs {
  const prefs = loadUserPrefs();
  const next: UserPrefs = { ...prefs };
  delete next.buyerProfile;
  saveUserPrefs(next);
  return next;
}
