"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2, Lock } from "lucide-react";
import { usePlaces } from "@/lib/use-places";
import {
  loadUserPrefs,
  saveUserPrefs,
  DEFAULT_PREFS,
  type UserPrefs,
} from "@/lib/user-prefs";
import { PERSONA_PRESETS } from "@/lib/personas";
import { INTEREST_VIEWS } from "@/lib/interest-views";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { SiteFooter } from "@/components/SiteFooter";

export default function AccountPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const { places, error: placesError } = usePlaces();
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setPrefs(loadUserPrefs());
  }, []);

  const name = (slug: string) =>
    places.find((p) => p.slug === slug)?.name ?? slug;

  const lensLabel = prefs.interestView
    ? INTEREST_VIEWS[prefs.interestView]?.label
    : null;
  const personaLabel = prefs.personaId
    ? PERSONA_PRESETS[prefs.personaId]?.label
    : null;

  function exportData() {
    const blob = new Blob([JSON.stringify(prefs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "liveable-melbourne-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetData() {
    saveUserPrefs({ ...DEFAULT_PREFS });
    setPrefs({ ...DEFAULT_PREFS });
    setCleared(true);
  }

  const hasAny =
    !!lensLabel ||
    !!personaLabel ||
    prefs.shortlist.length > 0 ||
    prefs.recent.length > 0 ||
    !!prefs.alertEmail ||
    !!prefs.weights;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Your data</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Everything below is stored <strong className="text-ink">only in this browser</strong>{" "}
          (no account, nothing sent to us). It personalises your own view. Export it to keep
          a copy, or clear it any time.
        </p>

        {/* Sync stub */}
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-surface-border bg-surface-sunken p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-ink">Sign in to sync — coming soon</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Optional accounts to sync your shortlist and lenses across devices (and unlock
              Pro features) are planned. The core map and all data stay free. See{" "}
              <Link href="/pricing" className="text-accent hover:underline">
                pricing
              </Link>
              .
            </p>
          </div>
        </div>

        {cleared && (
          <p className="mt-4 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-accent">
            Cleared. Your on-device data has been reset.
          </p>
        )}

        {placesError && (
          <p className="mt-4 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-sm text-[#9A552F]">
            Could not load suburb names — showing area IDs. Reload to retry.
          </p>
        )}

        {!hasAny ? (
          <p className="mt-6 rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-sm text-ink-muted">
            No saved preferences yet. Pick a lens, adjust weights, or shortlist suburbs on
            the <Link href="/" className="text-accent hover:underline">map</Link> and they
            will appear here.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <Card title="Lens & persona">
              <Row k="Interest lens" v={lensLabel ?? "Not set (Balanced)"} />
              <Row k="Persona" v={personaLabel ?? "Not set"} />
            </Card>

            <Card title="Priority weights">
              {prefs.weights ? (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {V1_SCORED_DOMAINS.map((d) => (
                    <li key={d} className="flex justify-between border-b border-surface-border py-1 text-sm">
                      <span className="text-ink-muted">{getDomain(d)?.label ?? d}</span>
                      <span className="num text-ink">{prefs.weights?.[d] ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Using default weights.</p>
              )}
            </Card>

            <Card title={`Shortlist (${prefs.shortlist.length})`}>
              {prefs.shortlist.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {prefs.shortlist.map((slug) => (
                    <li key={slug}>
                      <Link
                        href={`/places/${slug}`}
                        className="inline-flex rounded-full border border-surface-border bg-surface-sunken px-3 py-1 text-sm text-ink hover:border-accent hover:text-accent"
                      >
                        {name(slug)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No shortlisted areas.</p>
              )}
            </Card>

            <Card title={`Recently viewed (${prefs.recent.length})`}>
              {prefs.recent.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {prefs.recent.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/places/${r.slug}`}
                        className="text-sm text-accent hover:underline"
                      >
                        {r.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Nothing viewed yet.</p>
              )}
            </Card>

            <Card title="Alerts">
              <Row
                k="Alert email"
                v={prefs.alertEmail ?? "Not registered"}
              />
              <p className="mt-1 text-xs text-ink-muted">
                Manage on the{" "}
                <Link href="/alerts" className="text-accent hover:underline">
                  alerts
                </Link>{" "}
                page.
              </p>
            </Card>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportData}
            disabled={!hasAny}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden /> Export my data (JSON)
          </button>
          <button
            type="button"
            onClick={resetData}
            disabled={!hasAny}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-[#9A552F] transition-colors hover:border-[#9A552F] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Clear on-device data
          </button>
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          We never sell your data. See the{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-surface-border py-1.5 last:border-0 text-sm">
      <span className="text-ink-muted">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}
