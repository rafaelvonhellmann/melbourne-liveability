"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePlaces } from "@/lib/use-places";
import type { Place } from "@/lib/types";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import { allSources } from "@/lib/sources";
import { ShareViewButton } from "@/components/ShareViewButton";

const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ALERTS_ID;

export default function AlertsPage() {
  const { places } = usePlaces();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "saved-local" | "error">(
    "idle"
  );
  const [shortlist, setShortlist] = useState<string[]>([]);

  useEffect(() => {
    const prefs = loadUserPrefs();
    setShortlist(prefs.shortlist);
    if (prefs.alertEmail) setEmail(prefs.alertEmail);
  }, []);

  const resolved = shortlist
    .map((slug) => places.find((p) => p.slug === slug))
    .filter((p): p is Place => !!p);

  const latestFetch = allSources()
    .map((s) => s.fetchedAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !email.includes("@")) return;

    saveUserPrefs({ ...loadUserPrefs(), alertEmail: email });

    if (FORMSPREE_ID) {
      setStatus("sending");
      try {
        const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            shortlist: shortlist.join(","),
            suburbs: resolved.map((p) => p.name).join("; "),
            _subject: "Melbourne Liveability — shortlist update alert signup",
          }),
        });
        setStatus(res.ok ? "ok" : "error");
      } catch {
        setStatus("error");
      }
      return;
    }

    saveUserPrefs({
      ...loadUserPrefs(),
      alertEmail: email,
      shortlist,
    });
    setStatus("saved-local");
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg px-4 py-8 text-ink">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Update alerts</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Get notified when government open data refreshes for suburbs on your shortlist.
        Free — no account required. Our pipeline checks upstream sources monthly (
        {latestFetch ? `last build ${latestFetch}` : "see methodology"}).
      </p>

      {shortlist.length === 0 ? (
        <p className="mt-6 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] p-4 text-sm text-[#9A552F]">
          Add areas to your shortlist on the map first, then return here to register for
          alerts.
        </p>
      ) : (
        <ul className="mt-4 list-inside list-disc text-sm text-ink-muted">
          {resolved.map((p) => (
            <li key={p.slug}>{p.name}</li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="alert-email"
            className="block text-sm font-medium text-ink"
          >
            Email address
          </label>
          <input
            id="alert-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby="alert-email-help"
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
            placeholder="you@example.com"
          />
          <p id="alert-email-help" className="mt-1 text-xs text-ink-muted">
            We only use this to email you when your shortlisted suburbs get refreshed
            data.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="alert-consent"
            name="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-surface-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
          />
          <label htmlFor="alert-consent" className="text-sm text-ink-muted">
            I agree to receive occasional update emails about my shortlisted suburbs. See{" "}
            <Link href="/disclaimer" className="text-accent hover:underline">
              disclaimer
            </Link>{" "}
            for privacy. Unsubscribe any time.
          </label>
        </div>
        <button
          type="submit"
          disabled={shortlist.length === 0 || !consent}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Register for alerts"}
        </button>
      </form>

      {status === "ok" && (
        <p className="mt-4 text-sm text-accent">
          Thanks — you are on the list. We will email when data for your suburbs is refreshed.
        </p>
      )}
      {status === "saved-local" && (
        <p className="mt-4 text-sm text-[#9A552F]">
          Preference saved on this device. To enable email delivery, set{" "}
          <code className="text-xs">NEXT_PUBLIC_FORMSPREE_ALERTS_ID</code> in your deploy
          environment (Formspree or similar).
        </p>
      )}
      {status === "error" && (
        <p className="mt-4 text-sm text-accent-focus">
          Could not submit. Try again or save your shortlist link and check back after the
          next data refresh.
        </p>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Automated refresh runs via GitHub Actions when upstream ABS/VCSA/planning data
        changes. Alerts compare your shortlist against the new build.
      </p>
      <ShareViewButton
        getUrl={() => (typeof window !== "undefined" ? window.location.pathname : "/alerts")}
        label="Copy alerts page link"
        className="mt-4"
      />
    </div>
  );
}
