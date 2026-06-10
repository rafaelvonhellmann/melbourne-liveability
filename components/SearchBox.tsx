"use client";

import { useId, useMemo, useRef, useState } from "react";
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

/**
 * Heuristic: a full STREET ADDRESS (has a number, and either starts with it or
 * has a comma) rather than a suburb / area name. These should resolve to an
 * exact geocoded pin - not a fuzzy SA2 match - so we hide the fuzzy area
 * results (which were luring users into the wrong nearby area) and offer the
 * explicit address-search action instead. The network geocode itself only runs
 * on an explicit submit (Enter, the search button, or the address row).
 */
function isAddressLike(q: string): boolean {
  return /\d/.test(q) && (/^\s*\d/.test(q) || q.includes(","));
}

export function SearchBox({ index, onSelect, onGeocode }: SearchBoxProps) {
  const [q, setQ] = useState("");
  const [geo, setGeo] = useState<GeoState>(GEO_IDLE);
  // Combobox state: the popup opens when the user types (or submits a geocode)
  // and closes on Escape / selection. activeIdx is the keyboard-highlighted
  // option, surfaced to AT via aria-activedescendant on the input.
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listboxId = useId();
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
  const addressLike = isAddressLike(trimmed);
  // For an address-like query, suppress the fuzzy AREA matches so a nearby SA2
  // (e.g. a Kew area for an Abbotsford address) can't be mistaken for the result.
  const areaResults = addressLike ? [] : results;

  const runGeocode = async () => {
    if (!onGeocode || trimmed.length < 3) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setOpen(true);
    setActiveIdx(-1);
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
    setOpen(true);
    setActiveIdx(-1);
    if (geo.status !== "idle") resetGeo();
  };

  const closePopup = () => {
    setOpen(false);
    setActiveIdx(-1);
  };

  const pickArea = (item: SearchIndexEntry) => {
    // Always show the canonical data-area name once selected.
    onSelect(item);
    setQ(item.areaName);
    resetGeo();
    closePopup();
  };

  const pickGeo = (r: GeocodeResult) => {
    onGeocode?.(r);
    setQ(r.shortLabel);
    resetGeo();
    closePopup();
  };

  const showAddressSection =
    canGeocode && (geo.status === "idle" || geoForCurrent);
  const showDropdown = open && (areaResults.length > 0 || showAddressSection);

  // Flat option order matching the rendered rows: area matches, then the
  // "search as address" action (idle), then geocoded address results (done).
  const addressActionVisible = showDropdown && geo.status === "idle" && canGeocode;
  const geoOptions =
    showDropdown && showAddressSection && geo.status === "done" ? geo.results : [];
  const optionCount =
    (showDropdown ? areaResults.length : 0) +
    (addressActionVisible ? 1 : 0) +
    geoOptions.length;
  // Clamp: results can shrink under the highlight (e.g. while typing).
  const active = activeIdx >= 0 && activeIdx < optionCount ? activeIdx : -1;
  const optId = (i: number) => `${listboxId}-option-${i}`;
  const geoOptionIdx = (i: number) =>
    areaResults.length + (addressActionVisible ? 1 : 0) + i;

  const runOption = (i: number) => {
    if (i < areaResults.length) {
      pickArea(areaResults[i]);
      return;
    }
    if (addressActionVisible && i === areaResults.length) {
      void runGeocode();
      return;
    }
    const r = geoOptions[i - areaResults.length - (addressActionVisible ? 1 : 0)];
    if (r) pickGeo(r);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (optionCount === 0) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx(
        active === -1
          ? delta === 1
            ? 0
            : optionCount - 1
          : (active + delta + optionCount) % optionCount
      );
    } else if (e.key === "Enter") {
      // A keyboard-highlighted option wins; otherwise Enter falls through to
      // the form submit, which runs the explicit geocode (submit-only policy).
      if (showDropdown && active >= 0) {
        e.preventDefault();
        runOption(active);
      }
    } else if (e.key === "Escape") {
      if (showDropdown) {
        // First Escape closes the popup (and keeps type="search" from clearing
        // the text); a second Escape clears the field natively.
        e.preventDefault();
        closePopup();
      }
    }
  };

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
          onKeyDown={onKeyDown}
          placeholder="Search a suburb, data area or full address…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Search by suburb, data area (SA2) or full street address"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={
            showDropdown && active >= 0 ? optId(active) : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
        />
      </form>
      {showDropdown && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-surface-border bg-surface shadow-card"
          role="listbox"
          id={listboxId}
          aria-label="Search results"
        >
          {areaResults.map((item, i) => {
            const isAlias = item.kind === "alias";
            return (
              <li
                key={item.key}
                id={optId(i)}
                role="option"
                aria-selected={active === i}
                onClick={() => pickArea(item)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken ${
                  active === i ? "bg-surface-sunken" : ""
                }`}
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
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${
                    isAlias
                      ? "bg-surface-sunken text-ink-muted"
                      : "bg-accent/10 text-accent"
                  }`}
                >
                  {isAlias ? "Suburb" : "Data area"}
                </span>
              </li>
            );
          })}

          {addressActionVisible && (
            <li
              id={optId(areaResults.length)}
              role="option"
              aria-selected={active === areaResults.length}
              onClick={() => void runGeocode()}
              className={`flex w-full cursor-pointer items-center gap-2 border-t border-surface-border px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken ${
                active === areaResults.length ? "bg-surface-sunken" : ""
              }`}
            >
              <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Search “{trimmed}” as a full address
              </span>
              <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-muted">
                Address
              </span>
            </li>
          )}

          {showAddressSection && geo.status === "loading" && (
            <li role="presentation" className="border-t border-surface-border">
              <p className="px-3 py-2 text-sm text-ink-muted">
                Searching addresses…
              </p>
            </li>
          )}

          {showAddressSection && geo.status === "error" && (
            <li role="presentation" className="border-t border-surface-border">
              <p className="px-3 py-2 text-xs leading-snug text-ink-muted">
                Couldn’t reach address search. Try a suburb or data area, or
                click the map.
              </p>
            </li>
          )}

          {showAddressSection && geo.status === "done" && geo.results.length === 0 && (
            <li role="presentation" className="border-t border-surface-border">
              <p className="px-3 py-2 text-xs leading-snug text-ink-muted">
                No Melbourne address matched “{trimmed}”. Try a suburb or click
                the map.
              </p>
            </li>
          )}

          {geoOptions.map((r, i) => (
            <li
              key={`${r.lat},${r.lng},${i}`}
              id={optId(geoOptionIdx(i))}
              role="option"
              aria-selected={active === geoOptionIdx(i)}
              title={r.label}
              onClick={() => pickGeo(r)}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken ${
                i === 0 ? "border-t border-surface-border" : ""
              } ${active === geoOptionIdx(i) ? "bg-surface-sunken" : ""}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {r.shortLabel}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-accent">
                Address
              </span>
            </li>
          ))}
          {geoOptions.length > 0 && (
            <li role="presentation">
              <p className="px-3 py-1.5 text-[10px] leading-snug text-ink-muted">
                {NOMINATIM_ATTRIBUTION}
              </p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
