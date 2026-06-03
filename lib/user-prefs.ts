import type { ScoreWeights } from "./types";
import type { PersonaId } from "./personas";
import type { InterestViewId } from "./interest-views";
import type { BuyerProfile } from "./buyer-fit";

const STORAGE_KEY = "mlv-user-prefs-v1";
const MAX_SHORTLIST = 12;
const MAX_RECENT = 8;
const MAX_SAVED_CHECKS = 20;

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
  weights?: ScoreWeights;
  personaId?: PersonaId | null;
  interestView?: InterestViewId;
  shortlist: string[];
  recent: RecentPlace[];
  savedChecks: SavedCheck[];
  alertEmail?: string;
  /** Use the colourblind-safe (RdYlBu) score ramp on the map. Display-only. */
  colorblindRamp?: boolean;
  /** Lightweight personal "fit for your life" profile (buyer or agent). Local-only. */
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

export function loadUserPrefs(): UserPrefs {
  if (!isBrowser()) return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
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
                Number.isFinite((c as SavedCheck).lng)
            )
            .slice(0, MAX_SAVED_CHECKS)
        : [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUserPrefs(prefs: UserPrefs): void {
  if (!isBrowser()) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...prefs,
      version: 1,
      shortlist: prefs.shortlist.slice(0, MAX_SHORTLIST),
      recent: prefs.recent.slice(0, MAX_RECENT),
      savedChecks: (prefs.savedChecks ?? []).slice(0, MAX_SAVED_CHECKS),
    })
  );
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
  return loadUserPrefs().buyerProfile ?? null;
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
