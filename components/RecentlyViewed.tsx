"use client";

import Link from "next/link";
import type { RecentPlace } from "@/lib/user-prefs";

export function RecentlyViewed({ recent }: { recent: RecentPlace[] }) {
  if (recent.length === 0) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Recently viewed
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {recent.map((r) => (
          <li key={r.slug}>
            <Link href={`/places/${r.slug}`} className="text-accent hover:underline">
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
