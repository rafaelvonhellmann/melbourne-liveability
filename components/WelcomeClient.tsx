"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, MapPin, SlidersHorizontal, FileText } from "lucide-react";
import { loadPlaces } from "@/lib/places-data";
import { normalizeSearchTerm } from "@/lib/search";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import type { Place } from "@/lib/types";

type Suggestion = { slug: string; name: string; lga: string };

/** Reveal-on-scroll wrapper: adds .is-visible once the element enters view. */
function Reveal({ children, delayMs = 0 }: { children: React.ReactNode; delayMs?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal" style={{ transitionDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}

const STEPS: { icon: typeof MapPin; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Search where you want to live",
    body: "Type a suburb or address. We jump straight to it on the map - no signup, no paywall.",
  },
  {
    icon: MapPin,
    title: "Read the area at a glance",
    body: "A plain-English map of rent vs income, transport, safety, schools, hazards and more - every layer sourced from open government data.",
  },
  {
    icon: SlidersHorizontal,
    title: "Make it about you",
    body: "Drop a pin on an exact property, set what matters (a short commute, quiet, schools), and add your own work/school/family to measure each place against.",
  },
  {
    icon: FileText,
    title: "Get the full report",
    body: "A buyer's due-diligence summary: hidden risks to verify, real driving times, sun, future transport, the area profile - what the listing won't tell you.",
  },
];

export function WelcomeClient() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    loadPlaces()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    const nq = normalizeSearchTerm(q);
    if (nq.length < 2 || places.length === 0) return [];
    const out: Suggestion[] = [];
    for (const p of places) {
      if (p.nonResidential) continue;
      if (normalizeSearchTerm(p.name).includes(nq)) {
        out.push({ slug: p.slug, name: p.name, lga: p.lga });
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [q, places]);

  const go = (slug: string) => router.push(`/?select=${slug}`);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pick = active >= 0 ? suggestions[active] : suggestions[0];
    if (pick) go(pick.slug);
    else router.push("/");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="bg-bg text-ink">
      {/* Hero */}
      <section className="mx-auto flex min-h-[78vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          {PRODUCT_NAME}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          {PRODUCT_TAGLINE}
        </p>

        <form onSubmit={onSubmit} className="relative mt-8 w-full max-w-xl" role="search">
          <div className="flex items-center gap-2 rounded-full border border-surface-border bg-surface px-4 py-3 shadow-card focus-within:border-accent">
            <Search className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
            <label htmlFor="welcome-search" className="sr-only">
              Search where you want to live
            </label>
            <input
              id="welcome-search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
                setActive(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder="Search where you want to live..."
              className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
              autoComplete="off"
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls="welcome-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `welcome-opt-${active}` : undefined}
            />
          </div>
          {open && suggestions.length > 0 && (
            <ul
              id="welcome-suggestions"
              role="listbox"
              className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-surface-border bg-surface text-left shadow-card"
            >
              {suggestions.map((s, i) => (
                <li key={s.slug} role="option" id={`welcome-opt-${i}`} aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => go(s.slug)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${
                      i === active ? "bg-surface-sunken" : "hover:bg-surface-sunken"
                    }`}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="text-ink">{s.name}</span>
                    <span className="ml-auto text-xs text-ink-muted">{s.lga}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href="/"
            className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink transition-colors hover:bg-accent-focus"
          >
            Open the map &rarr;
          </Link>
          <Link href="/find" className="text-accent hover:underline">
            Or describe what you want
          </Link>
        </div>
        <p className="mt-10 animate-pulse text-xs text-ink-muted">
          scroll to see how it works
        </p>
      </section>

      {/* Scroll story */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-24">
        <div className="space-y-16">
          {STEPS.map((s, i) => (
            <Reveal key={s.title}>
              <div className="flex items-start gap-4 sm:gap-6">
                <span className="num mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg font-semibold text-accent">
                  {i + 1}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <s.icon className="h-5 w-5 text-accent" aria-hidden />
                    <h2 className="font-display text-xl font-medium text-ink">{s.title}</h2>
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-16 rounded-2xl border border-surface-border bg-surface p-6 text-center shadow-card">
            <h2 className="font-display text-2xl font-medium text-ink">Have a suburb in mind?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              Jump in - it&apos;s free, no login. Built from open government data; general
              information, not advice.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Open the map &rarr;
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
