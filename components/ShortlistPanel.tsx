"use client";

import Link from "next/link";
import type { Place } from "@/lib/types";
import { removeFromShortlist } from "@/lib/user-prefs";
import { buildCompareUrl } from "@/lib/share-url";
import { ShareViewButton } from "./ShareViewButton";

type ShortlistPanelProps = {
  slugs: string[];
  places: Place[];
  onChange: (slugs: string[]) => void;
};

export function ShortlistPanel({ slugs, places, onChange }: ShortlistPanelProps) {
  if (slugs.length === 0) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-3 text-xs text-ink-muted shadow-card">
        <p className="font-medium text-ink">Your shortlist</p>
        <p className="mt-1">
          Save areas from the map or a profile page. Stored on this device only.
        </p>
      </div>
    );
  }

  const resolved = slugs
    .map((slug) => places.find((p) => p.slug === slug))
    .filter((p): p is Place => !!p);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Shortlist ({slugs.length})</p>
        <ShareViewButton getUrl={() => buildCompareUrl(slugs)} label="Share compare" />
      </div>
      <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-sm">
        {resolved.map((p) => (
          <li key={p.slug} className="flex items-center justify-between gap-2">
            <Link href={`/places/${p.slug}`} className="text-accent hover:underline">
              {p.name}
            </Link>
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-accent-focus"
              onClick={() => onChange(removeFromShortlist(p.slug).shortlist)}
              aria-label={`Remove ${p.name} from shortlist`}
            >
              Remove
            </button>
          </li>
        ))}
        {slugs.length > resolved.length && (
          <li className="text-xs text-ink-muted">
            {slugs.length - resolved.length} saved slug(s) not found in current data
          </li>
        )}
      </ul>
      {resolved.length >= 2 && (
        <Link
          href={buildCompareUrl(slugs)}
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
