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
        keys: ["label", "suburb"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [index]
  );

  const results = q.length >= 2 ? fuse.search(q, { limit: 8 }) : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-sunken px-3 py-2">
        <Search className="h-4 w-4 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search suburb or area…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Fuzzy suburb search"
        />
      </div>
      {results.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-auto rounded-lg border border-surface-border bg-surface shadow-card"
          role="listbox"
        >
          {results.map((r) => (
            <li key={r.item.key}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                onClick={() => {
                  onSelect(r.item);
                  setQ(r.item.label);
                }}
              >
                {r.item.label}
                <span className="num ml-2 text-xs text-ink-muted">{r.item.sa2Code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
