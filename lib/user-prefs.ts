import type { ScoreWeights } from "./types";
import type { PersonaId } from "./personas";
import type { InterestViewId } from "./interest-views";

const STORAGE_KEY = "mlv-user-prefs-v1";
const MAX_SHORTLIST = 12;
const MAX_RECENT = 8;

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

export type UserPrefs = {
  version: 1;
  weights?: ScoreWeights;
  personaId?: PersonaId | null;
  interestView?: InterestViewId;
  shortlist: string[];
  recent: RecentPlace[];
  alertEmail?: string;
};

export const DEFAULT_PREFS: UserPrefs = {
  version: 1,
  shortlist: [],
  recent: [],
};

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
