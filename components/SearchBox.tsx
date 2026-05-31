"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Fuse from "fuse.js";
import type { SearchIndexEntry } from "@/lib/search";

type SearchBoxProps = {
  index: SearchIndexEntry[];
  onSelect: (entry: SearchIndexEntry) => void;
};

export function SearchBox({ index, onSelect }: SearchBoxProps) {
  const [q, setQ] = useState("");
  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: ["label", "suburb", "normalized"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [index]
  );

  // Search both data-area names and geographic suburb aliases, then collapse to
  // one row per data-area (keeping Fuse's best-ranked hit) so a suburb that maps
  // into an SA2 we already list doesn't appear twice.
  const results = useMemo(() => {
    if (q.length < 2) return [] as SearchIndexEntry[];
    const seen = new Set<string>();
    const out: SearchIndexEntry[] = [];
    for (const r of fuse.search(q, { limit: 24 })) {
      if (seen.has(r.item.slug)) continue;
      seen.add(r.item.slug);
      out.push(r.item);
      if (out.length >= 8) break;
    }
    return out;
  }, [fuse, q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-sunken px-3 py-2">
        <Search className="h-4 w-4 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a suburb or data area…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Search by suburb name or data area (SA2)"
        />
      </div>
      {results.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-surface-border bg-surface shadow-card"
          role="listbox"
        >
          {results.map((item) => {
            const isAlias = item.kind === "alias";
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                  onClick={() => {
                    // Always show the canonical data-area name once selected.
                    onSelect(item);
                    setQ(item.areaName);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {isAlias && (
                      <span className="block truncate text-xs text-ink-muted">
                        suburb → {item.areaName}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      isAlias
                        ? "bg-surface-sunken text-ink-muted"
                        : "bg-accent/10 text-accent"
                    }`}
                  >
                    {isAlias ? "Suburb" : "Data area"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
