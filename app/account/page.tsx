"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, Download, LogOut, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { usePlaces } from "@/lib/use-places";
import {
  PREFS_CHANGED_EVENT,
  loadUserPrefs,
  saveUserPrefs,
  DEFAULT_PREFS,
  type UserPrefs,
} from "@/lib/user-prefs";
import {
  PROFILE_CHANGED_EVENT,
  clearProfile,
  loadProfile,
  type UserProfile,
} from "@/lib/user-profile";
import { runWithoutSyncPush, useAccountSync } from "@/lib/sync";
import { useSession } from "@/lib/use-session";
import { INTEREST_VIEWS } from "@/lib/interest-views";
import { V1_SCORED_DOMAINS, getDomain } from "@/lib/domains";
import { SiteFooter } from "@/components/SiteFooter";

export default function AccountPage() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { places, error: placesError } = usePlaces();
  const session = useSession();
  const sync = useAccountSync(session);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadLocal = () => {
      setPrefs(loadUserPrefs());
      setProfile(loadProfile());
    };
    loadLocal();
    window.addEventListener(PREFS_CHANGED_EVENT, loadLocal);
    window.addEventListener(PROFILE_CHANGED_EVENT, loadLocal);
    return () => {
      window.removeEventListener(PREFS_CHANGED_EVENT, loadLocal);
      window.removeEventListener(PROFILE_CHANGED_EVENT, loadLocal);
    };
  }, []);

  const name = (slug: string) =>
    places.find((p) => p.slug === slug)?.name ?? slug;

  const lensLabel = prefs.interestView
    ? INTEREST_VIEWS[prefs.interestView]?.label
    : null;

  function exportData() {
    const blob = new Blob([
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          prefs: loadUserPrefs(),
          profile: loadProfile(),
        },
        null,
        2
      ),
    ], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "festra-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearDeviceData() {
    if (!window.confirm("Clear data saved in this browser?")) return;
    runWithoutSyncPush(() => {
      saveUserPrefs({ ...DEFAULT_PREFS });
      clearProfile();
    });
    setPrefs(loadUserPrefs());
    setProfile(null);
    setNotice("Cleared. Your on-device data has been reset.");
  }

  async function deleteSyncedCopy() {
    if (session.status !== "signed-in") return;
    if (!window.confirm("Delete the synced copy and sign out? This device keeps its local copy.")) {
      return;
    }
    const status = await sync.deleteSyncedCopy();
    if (status === "synced") {
      await session.signOut();
      setNotice("Deleted the synced copy and signed out. This device keeps its local copy.");
    } else {
      setNotice("Could not delete the synced copy. Your on-device data is unchanged.");
    }
  }

  const hasAny =
    !!profile ||
    !!lensLabel ||
    prefs.shortlist.length > 0 ||
    prefs.recent.length > 0 ||
    prefs.savedChecks.length > 0 ||
    !!prefs.weights ||
    !!prefs.buyerProfile;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Profile</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Everything below is stored on this device. Sign in to sync it across devices,
          export a copy, or clear it any time.
        </p>

        <SyncPanel
          session={session}
          status={sync.status}
          onSync={() => void sync.syncNow("all")}
          onSignOut={() => void session.signOut()}
        />

        {notice && (
          <p className="mt-4 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-accent">
            {notice}
          </p>
        )}

        {placesError && (
          <p className="mt-4 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] px-3 py-2 text-sm text-[#9A552F]">
            Could not load suburb names - showing area IDs. Reload to retry.
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
            {profile && (
              <Card title="Profile">
                <Row k="Profile type" v={profile.type === "agent" ? "Agent" : "Buyer"} />
                <Row k="Name" v={profile.name ?? "Not set"} />
                {profile.type === "agent" && (
                  <>
                    <Row k="Clients" v={String(profile.clients?.length ?? 0)} />
                    <Row
                      k="Active client"
                      v={
                        profile.clients?.find((c) => c.id === profile.activeClientId)?.label ??
                        "Not set"
                      }
                    />
                  </>
                )}
              </Card>
            )}

            <Card title="Lens">
              <Row k="Interest lens" v={lensLabel ?? "Not set (Balanced)"} />
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
            onClick={clearDeviceData}
            disabled={!hasAny}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-[#9A552F] transition-colors hover:border-[#9A552F] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Clear this device
          </button>
          {session.status === "signed-in" && (
            <button
              type="button"
              onClick={() => void deleteSyncedCopy()}
              disabled={sync.status === "syncing"}
              className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-[#9A552F] transition-colors hover:border-[#9A552F] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete synced copy
            </button>
          )}
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

function SyncPanel({
  session,
  status,
  onSync,
  onSignOut,
}: {
  session: ReturnType<typeof useSession>;
  status: "idle" | "syncing" | "synced" | "offline" | "error";
  onSync: () => void;
  onSignOut: () => void;
}) {
  if (session.status === "loading") {
    return (
      <div className="mt-6 rounded-lg border border-surface-border bg-surface-sunken p-4 text-sm text-ink-muted">
        Checking account...
      </div>
    );
  }

  if (session.status === "signed-out") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-surface-border bg-surface-sunken p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-ink">Sign in to sync</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Keep your shortlist, checks, profile and lenses available across devices.
          </p>
          <Link
            href="/signin"
            className="mt-3 inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (session.status === "unavailable") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-surface-border bg-surface-sunken p-4">
        <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-ink">Sync offline</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Changes are saved on this device. Sync will retry next time this page loads.
          </p>
        </div>
      </div>
    );
  }

  const label =
    status === "syncing"
      ? "Syncing"
      : status === "synced"
        ? "Synced"
        : status === "offline"
          ? "Offline"
          : status === "error"
            ? "Sync error"
            : "Ready";

  return (
    <div className="mt-6 rounded-lg border border-surface-border bg-surface-sunken p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">{session.user.email}</h2>
          <span className="mt-1 inline-flex rounded-full border border-surface-border bg-surface px-2 py-0.5 text-xs text-ink-muted">
            {label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSync}
            disabled={status === "syncing"}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>
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
