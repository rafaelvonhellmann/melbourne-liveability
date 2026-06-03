"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { withBase } from "@/lib/asset-path";
import { parseQuery, rankAreas } from "@/lib/area-search";
import type { Place } from "@/lib/types";

const EXAMPLES = [
  "safe and affordable near a train",
  "good schools, family-friendly",
  "near hospitals with low crime",
  "affordable with good public transport",
];

const ALL_DOMAINS = "safe, affordable, transport, schools, health, hazards (flood/fire), income";

export function FindAreasClient() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    if (q) {
      setQuery(q);
      setSubmitted(q);
    }
    fetch(withBase("/data/places.json"))
      .then((r) => r.json())
      .then((j: { places?: Place[] } | Place[]) => setPlaces(Array.isArray(j) ? j : (j.places ?? [])))
      .catch(() => setPlaces([]));
  }, []);

  const parsed = useMemo(() => (submitted.trim() ? parseQuery(submitted) : null), [submitted]);
  const results = useMemo(
    () => (parsed && places.length ? rankAreas(parsed.domains, places, 24) : []),
    [parsed, places]
  );

  const run = (text: string) => {
    setQuery(text);
    setSubmitted(text);
    const url = new URL(window.location.href);
    if (text.trim()) url.searchParams.set("q", text);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ink">Find areas like this</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Describe what you want in a place - in plain words - and we rank Greater Melbourne areas by the
        liveability measures your words map to. We show exactly which words we used, and flag any we
        could not match. This is area-level context, not a score of any single property.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="mt-5 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. safe, affordable, near a train, good schools"
          aria-label="Describe what you want in an area"
          className="min-h-11 flex-1 rounded-md border border-surface-border bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
        >
          <Search className="h-4 w-4" aria-hidden />
          Find areas
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => run(ex)}
            className="min-h-9 rounded-full border border-surface-border px-3 py-1 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
          >
            {ex}
          </button>
        ))}
      </div>

      {parsed && (
        <div className="mt-6">
          {parsed.matched.length > 0 ? (
            <p className="text-sm text-ink">
              Ranking <b>{results.length}</b> areas by:{" "}
              {parsed.matched.map((m, i) => (
                <span key={m.domain}>
                  {i > 0 && ", "}
                  <span className="font-medium text-accent">{m.label}</span>
                </span>
              ))}
              .
            </p>
          ) : (
            <p className="rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              We could not match any of your words to a liveability measure. Try words like{" "}
              <span className="text-ink">{ALL_DOMAINS}</span>.
            </p>
          )}
          {parsed.unmatched.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              Not matched (we have no measure for these yet):{" "}
              <span className="text-ink">{parsed.unmatched.join(", ")}</span>.
            </p>
          )}
        </div>
      )}

      {results.length > 0 && (
        <ol className="mt-5 space-y-2">
          {results.map((r, i) => (
            <li key={r.slug}>
              <Link
                href={`/places/${r.slug}`}
                className="block rounded-lg border border-surface-border bg-surface p-4 shadow-card transition-colors hover:border-accent"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-base font-semibold text-ink">
                    <span className="mr-1.5 text-ink-muted">{i + 1}.</span>
                    {r.name}
                  </h2>
                  <span className="shrink-0 text-xs text-ink-muted">{r.lga}</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {r.perDomain.map((d) => (
                    <div key={d.domain} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-xs text-ink-muted">{d.label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${d.percentile}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink">{d.percentile}</span>
                    </div>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        Equal-weighted, deterministic ranking across the seven scored liveability domains (percentiles,
        higher is better - hazards scores higher where there is less flood/fire overlay). Context only,
        never a buy/avoid verdict; open the area to see the full profile, sources and caveats. Want a
        specific address checked? Use the Buyer Check on the map.
      </p>
    </section>
  );
}
