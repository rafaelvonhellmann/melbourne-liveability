"use client";

import { useEffect, useRef, useState } from "react";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import { INTEREST_VIEWS, type InterestViewId } from "@/lib/interest-views";

const SEEN_KEY = "mlv-onboarded-v1";
const PICKS: InterestViewId[] = ["general", "rental", "homeBuyer", "education"];

type Props = {
  /** Called when the user picks a lens, so the map can apply it immediately. */
  onPick?: (id: InterestViewId) => void;
};

/**
 * First-run welcome that orients new visitors and lets them pick a starting
 * lens — shown once (localStorage flag), no signup. Returning users (who already
 * have any saved preference) never see it.
 */
export function OnboardingModal({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      const prefs = loadUserPrefs();
      if (prefs.interestView || prefs.personaId || prefs.shortlist.length > 0) {
        localStorage.setItem(SEEN_KEY, "1");
        return;
      }
      setOpen(true);
    } catch {
      /* localStorage unavailable — just don't onboard */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];
    // Move focus into the dialog on open.
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function pick(id: InterestViewId) {
    const prefs = loadUserPrefs();
    saveUserPrefs({ ...prefs, interestView: id });
    onPick?.(id);
    dismiss();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-lg rounded-t-2xl border border-surface-border bg-surface p-6 shadow-card sm:rounded-2xl"
      >
        <h2 id="onboarding-title" className="font-display text-xl font-semibold text-ink">
          Welcome to liveable<span className="text-accent">.</span>melbourne
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          A free map of Greater Melbourne built only from Australian government open data —
          safety, affordability, transport, health, hazards, schools and more, suburb by
          suburb. Pick a starting lens (you can change it any time), or just explore.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {PICKS.map((id) => {
            const v = INTEREST_VIEWS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className="rounded-lg border border-surface-border bg-surface p-3 text-left transition-colors hover:border-accent"
              >
                <span className="block text-sm font-medium text-ink">{v.label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{v.description}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm text-ink-muted underline-offset-2 hover:text-accent hover:underline"
          >
            Skip — just explore the map
          </button>
          <span className="text-[11px] text-ink-muted">No account needed</span>
        </div>
      </div>
    </div>
  );
}
