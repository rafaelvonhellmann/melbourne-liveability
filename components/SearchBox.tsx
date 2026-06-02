"use client";

import { useMemo, useRef, useState } from "react";
import { Search, MapPin } from "lucide-react";
import Fuse from "fuse.js";
import type { SearchIndexEntry } from "@/lib/search";
import {
  geocodeAddress,
  NOMINATIM_ATTRIBUTION,
  type GeocodeResult,
} from "@/lib/geocode";

type SearchBoxProps = {
  index: SearchIndexEntry[];
  onSelect: (entry: SearchIndexEntry) => void;
  /**
   * Optional full-address geocode (OSM Nominatim). When provided, an explicit
   * "search this address" action is offered and a picked result drops an exact
   * pin. The suburb / SA2 local search stays the primary path.
   */
  onGeocode?: (result: GeocodeResult) => void;
};

type GeoState = {
  status: "idle" | "loading" | "done" | "error";
  results: GeocodeResult[];
  forQuery: string;
};

const GEO_IDLE: GeoState = { status: "idle", results: [], forQuery: "" };

export function SearchBox({ index, onSelect, onGeocode }: SearchBoxProps) {
  const [q, setQ] = useState("");
  const [geo, setGeo] = useState<GeoState>(GEO_IDLE);
  const abortRef = useRef<AbortController | null>(null);

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

  const trimmed = q.trim();
  const canGeocode = !!onGeocode && trimmed.length >= 3;
  // Address results only belong to the query they were fetched for.
  const geoForCurrent = geo.forQuery === trimmed;

  const runGeocode = async () => {
    if (!onGeocode || trimmed.length < 3) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGeo({ status: "loading", results: [], forQuery: trimmed });
    try {
      const found = await geocodeAddress(trimmed, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setGeo({ status: "done", results: found, forQuery: trimmed });
    } catch (err) {
      if (ctrl.signal.aborted || (err as Error)?.name === "AbortError") return;
      setGeo({ status: "error", results: [], forQuery: trimmed });
    }
  };

  const resetGeo = () => {
    abortRef.current?.abort();
    setGeo(GEO_IDLE);
  };

  const onQueryChange = (value: string) => {
    setQ(value);
    if (geo.status !== "idle") resetGeo();
  };

  const pickGeo = (r: GeocodeResult) => {
    onGeocode?.(r);
    setQ(r.shortLabel);
    resetGeo();
  };

  const showAddressSection =
    canGeocode && (geo.status === "idle" || geoForCurrent);
  const showDropdown = results.length > 0 || showAddressSection;

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runGeocode();
        }}
        className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-sunken px-3 py-2"
      >
        <button
          type="submit"
          className="shrink-0 text-ink-muted hover:text-ink disabled:cursor-default disabled:hover:text-ink-muted"
          aria-label="Search this address"
          disabled={!canGeocode}
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search a suburb, data area or full address…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Search by suburb, data area (SA2) or full street address"
        />
      </form>
      {showDropdown && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-surface-border bg-surface shadow-card"
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
                    resetGeo();
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

          {showAddressSection && (
            <li className="border-t border-surface-border">
              {geo.status === "idle" && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                  onClick={() => void runGeocode()}
                >
                  <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    Search “{trimmed}” as a full address
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    Address
                  </span>
                </button>
              )}

              {geo.status === "loading" && (
                <p className="px-3 py-2 text-sm text-ink-muted">
                  Searching addresses…
                </p>
              )}

              {geo.status === "error" && (
                <p className="px-3 py-2 text-xs leading-snug text-ink-muted">
                  Couldn’t reach address search. Try a suburb or data area, or
                  click the map.
                </p>
              )}

              {geo.status === "done" && geo.results.length === 0 && (
                <p className="px-3 py-2 text-xs leading-snug text-ink-muted">
                  No Melbourne address matched “{trimmed}”. Try a suburb or click
                  the map.
                </p>
              )}

              {geo.status === "done" && geo.results.length > 0 && (
                <>
                  {geo.results.map((r, i) => (
                    <button
                      key={`${r.lat},${r.lng},${i}`}
                      type="button"
                      title={r.label}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                      onClick={() => pickGeo(r)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {r.shortLabel}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                        Address
                      </span>
                    </button>
                  ))}
                  <p className="px-3 py-1.5 text-[10px] leading-snug text-ink-muted">
                    {NOMINATIM_ATTRIBUTION}
                  </p>
                </>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
