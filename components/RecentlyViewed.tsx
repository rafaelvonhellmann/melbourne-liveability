"use client";

import Link from "next/link";
import type { RecentPlace } from "@/lib/user-prefs";

export function RecentlyViewed({ recent }: { recent: RecentPlace[] }) {
  if (recent.length === 0) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 backdrop-blur">
      <p className="text-sm font-medium text-slate-200">Recently viewed</p>
      <ul className="mt-2 space-y-1 text-sm">
        {recent.map((r) => (
          <li key={r.slug}>
            <Link href={`/places/${r.slug}`} className="text-emerald-400 hover:underline">
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
