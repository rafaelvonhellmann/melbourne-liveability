"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Place } from "@/lib/types";
import {
  PREFS_CHANGED_EVENT,
  loadUserPrefs,
  removeFromShortlist,
} from "@/lib/user-prefs";
import { buildCompareUrl } from "@/lib/share-url";
import { ShareViewButton } from "./ShareViewButton";

type ShortlistPanelProps = {
  slugs: string[];
  places: Place[];
  onChange: (slugs: string[]) => void;
  /** Open a shortlisted place in-app (pan/zoom + select), without navigating. */
  onOpen?: (place: Place) => void;
};

export function ShortlistPanel({
  slugs,
  places,
  onChange,
  onOpen,
}: ShortlistPanelProps) {
  // Hydrate/subscribe to the persisted shortlist directly. The controlled
  // `slugs` prop is the primary source, but localStorage is the source of
  // truth across mounts (e.g. returning from a profile page) — without this
  // subscription the panel could render its title with no contents.
  const [localSlugs, setLocalSlugs] = useState<string[]>(slugs);

  useEffect(() => {
    setLocalSlugs(slugs);
  }, [slugs]);

  useEffect(() => {
    const sync = () => setLocalSlugs(loadUserPrefs().shortlist);
    // Reconcile on mount in case the controlled prop hasn't hydrated yet.
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(PREFS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PREFS_CHANGED_EVENT, sync);
    };
  }, []);

  const effectiveSlugs = localSlugs;

  if (effectiveSlugs.length === 0) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-3 text-xs text-ink-muted shadow-card">
        <p className="font-medium text-ink">Your shortlist</p>
        <p className="mt-1">
          Save areas from the map or a profile page. Stored on this device only.
        </p>
      </div>
    );
  }

  const resolved = effectiveSlugs
    .map((slug) => places.find((p) => p.slug === slug))
    .filter((p): p is Place => !!p);

  const remove = (slug: string) => {
    const next = removeFromShortlist(slug).shortlist;
    setLocalSlugs(next);
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          Shortlist ({effectiveSlugs.length})
        </p>
        <ShareViewButton
          getUrl={() => buildCompareUrl(effectiveSlugs)}
          label="Share compare"
        />
      </div>
      <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
        {resolved.map((p) => (
          <li
            key={p.slug}
            className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-surface-sunken"
          >
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="flex-1 truncate text-left text-accent hover:underline"
                title={`Show ${p.name} on the map`}
              >
                {p.name}
              </button>
            ) : (
              <Link
                href={`/places/${p.slug}`}
                className="flex-1 truncate text-accent hover:underline"
              >
                {p.name}
              </Link>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/places/${p.slug}`}
                className="text-xs text-ink-muted hover:text-accent"
              >
                Profile
              </Link>
              <button
                type="button"
                className="text-xs text-ink-muted hover:text-accent-focus"
                onClick={() => remove(p.slug)}
                aria-label={`Remove ${p.name} from shortlist`}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
        {effectiveSlugs.length > resolved.length && (
          <li className="text-xs text-ink-muted">
            {effectiveSlugs.length - resolved.length} saved slug(s) not found in
            current data
          </li>
        )}
      </ul>
      {resolved.length >= 2 && (
        <Link
          href={buildCompareUrl(effectiveSlugs)}
          className="mt-2 inline-block text-xs text-accent hover:underline"
        >
          Compare shortlist →
        </Link>
      )}
      <Link
        href="/alerts"
        className="mt-1 block text-xs text-ink-muted hover:text-ink"
      >
        Set update alerts for this list →
      </Link>
    </div>
  );
}
