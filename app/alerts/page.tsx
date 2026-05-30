"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPlaces } from "@/lib/places-data";
import type { Place } from "@/lib/types";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import { allSources } from "@/lib/sources";
import { ShareViewButton } from "@/components/ShareViewButton";

const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ALERTS_ID;

export default function AlertsPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "saved-local" | "error">(
    "idle"
  );
  const [shortlist, setShortlist] = useState<string[]>([]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
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
    <div className="mx-auto max-w-xl px-4 py-8 text-slate-300">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">Update alerts</h1>
      <p className="mt-2 text-sm text-slate-400">
        Get notified when government open data refreshes for suburbs on your shortlist.
        Free — no account required. Our pipeline checks upstream sources monthly (
        {latestFetch ? `last build ${latestFetch}` : "see methodology"}).
      </p>

      {shortlist.length === 0 ? (
        <p className="mt-6 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-100">
          Add areas to your shortlist on the map first, then return here to register for
          alerts.
        </p>
      ) : (
        <ul className="mt-4 list-inside list-disc text-sm text-slate-400">
          {resolved.map((p) => (
            <li key={p.slug}>{p.name}</li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="alert-email" className="text-sm text-slate-400">
            Email
          </label>
          <input
            id="alert-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-surface-border bg-surface-raised px-3 py-2 text-slate-100"
            placeholder="you@example.com"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree to receive occasional update emails about my shortlisted suburbs. See{" "}
            <Link href="/disclaimer" className="text-emerald-400 hover:underline">
              disclaimer
            </Link>{" "}
            for privacy. Unsubscribe any time.
          </span>
        </label>
        <button
          type="submit"
          disabled={shortlist.length === 0 || !consent}
          className="rounded bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Register for alerts"}
        </button>
      </form>

      {status === "ok" && (
        <p className="mt-4 text-sm text-emerald-300">
          Thanks — you are on the list. We will email when data for your suburbs is refreshed.
        </p>
      )}
      {status === "saved-local" && (
        <p className="mt-4 text-sm text-amber-200">
          Preference saved on this device. To enable email delivery, set{" "}
          <code className="text-xs">NEXT_PUBLIC_FORMSPREE_ALERTS_ID</code> in your deploy
          environment (Formspree or similar).
        </p>
      )}
      {status === "error" && (
        <p className="mt-4 text-sm text-red-300">
          Could not submit. Try again or save your shortlist link and check back after the
          next data refresh.
        </p>
      )}

      <p className="mt-8 text-xs text-slate-500">
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
