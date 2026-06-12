"use client";

import { useEffect, useState } from "react";
import {
  loadRegionSources,
  sourcesForIndicatorIds,
  sourcesForIndicatorIdsIn,
  type SourceRecord,
} from "@/lib/sources";
import { DEFAULT_REGION, type RegionId } from "@/lib/regions";

type SourceDrawerProps = {
  /** Pre-resolved records (legacy callers). Wins over sourceIds when given. */
  sources?: SourceRecord[];
  /** Indicator source ids to resolve against the region's manifest. */
  sourceIds?: string[];
  /** Region whose sources.{region}.json the ids resolve in. Melbourne (the
   * default) resolves synchronously from the bundled manifest - identical
   * render to the legacy path; other regions fetch their baked manifest and
   * fall back to the melbourne manifest while it loads / when it 404s. */
  region?: RegionId;
  title?: string;
};

/** Collapsible per-source provenance: name, URL, licence, period, fetch date. */
export function SourceDrawer({
  sources,
  sourceIds,
  region = DEFAULT_REGION,
  title = "Sources & licences",
}: SourceDrawerProps) {
  // Initial state is always the melbourne-manifest resolution (synchronous, no
  // flicker); the effect swaps in the region manifest's records when relevant.
  const [resolved, setResolved] = useState<SourceRecord[]>(
    () => sources ?? sourcesForIndicatorIds(sourceIds ?? [])
  );
  const idsKey = (sourceIds ?? []).join(",");
  useEffect(() => {
    if (sources || !sourceIds || region === DEFAULT_REGION) return;
    let live = true;
    void loadRegionSources(region).then((records) => {
      if (live) setResolved(sourcesForIndicatorIdsIn(records, sourceIds));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids compared by value
  }, [sources, idsKey, region]);

  const list = sources ?? resolved;
  if (list.length === 0) return null;
  return (
    <details className="rounded-lg border border-surface-border bg-surface p-4 text-sm shadow-card">
      <summary className="cursor-pointer font-medium text-ink">
        {title} ({list.length})
      </summary>
      <ul className="mt-3 space-y-3">
        {list.map((s) => (
          <li
            key={s.id}
            className="border-t border-surface-border pt-3 first:border-0 first:pt-0"
          >
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {s.name}
            </a>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
              <span>
                <span className="text-ink-muted/70">Licence:</span> {s.licence}
              </span>
              {s.period && (
                <span>
                  <span className="text-ink-muted/70">Period:</span> {s.period}
                </span>
              )}
              {s.fetchedAt && (
                <span>
                  <span className="text-ink-muted/70">Fetched:</span> {s.fetchedAt}
                </span>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}
