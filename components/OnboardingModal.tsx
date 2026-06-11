"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import { INTEREST_VIEWS, type InterestViewId } from "@/lib/interest-views";
import { PRODUCT_NAME } from "@/lib/brand";

const SEEN_KEY = "mlv-onboarded-v1";
const PICKS: InterestViewId[] = ["general", "rental", "homeBuyer", "family"];

/**
 * Decorative intro chips - a stylized echo of a real pin report's findings.
 * Purely visual (the whole vignette is aria-hidden); positions are % of the
 * vignette box, `--chip-i` drives the 25ms CSS stagger.
 */
const INTRO_CHIPS: {
  text: string;
  tone: "pass" | "caution";
  pos: React.CSSProperties;
}[] = [
  { text: "Heritage rules apply", tone: "caution", pos: { left: "5%", top: "9%" } },
  { text: "Station 8 min walk", tone: "pass", pos: { right: "4%", top: "26%" } },
  { text: "No flood zone", tone: "pass", pos: { left: "9%", bottom: "13%" } },
  { text: "Schools zoned nearby", tone: "pass", pos: { right: "6%", bottom: "7%" } },
];

/**
 * Stylized map vignette behind the onboarding moment: a once-through, pure-CSS
 * demo of the product's core gesture - tap the map, the pin drops (--dur-3 on
 * the signature ease), the camera settles toward it (scale 1 -> 1.15), then
 * translucent data chips fade in staggered. Street-grid artwork reuses the
 * Crema mockup's aesthetic (design-mockups/festra-d-crema.html) as inline SVG;
 * zero network, decorative only (aria-hidden), and prefers-reduced-motion gets
 * the static final frame (see .onboard-* rules in globals.css).
 */
function IntroVignette() {
  return (
    <div
      data-testid="onboarding-intro"
      aria-hidden="true"
      className="pointer-events-none relative mb-4 h-36 select-none overflow-hidden rounded-xl border border-surface-border bg-[#F2F2EF]"
    >
      {/* "Camera" layer - the map plus its pin scale toward the pin point. */}
      <div className="onboard-cam absolute inset-0">
        <svg
          className="h-full w-full"
          viewBox="0 0 560 240"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <rect width="560" height="240" fill="#F2F2EF" />
          {/* River band along the bottom */}
          <path
            d="M0 196 Q150 178 280 200 T560 188 L560 240 L0 240 Z"
            fill="#DCE7F0"
          />
          <path
            d="M0 194 Q150 176 280 198 T560 186"
            fill="none"
            stroke="#C3D4E4"
            strokeWidth="2"
          />
          {/* Minor streets */}
          <g stroke="#E4E4DF" strokeWidth="1.5">
            <path d="M40 0 V240 M150 0 V240 M282 0 V196 M410 0 V240 M520 0 V196" />
            <path d="M0 30 H560 M0 92 H560 M0 152 H560" />
          </g>
          {/* Major roads */}
          <g stroke="#FFFFFF" strokeWidth="9">
            <path d="M84 0 V240 M216 0 V196 M348 0 V240 M472 0 V196" />
            <path d="M0 56 H560 M0 124 H560 M0 178 H348" />
          </g>
          {/* Parks */}
          <g fill="#E9EDE4">
            <rect x="372" y="64" width="84" height="50" rx="4" />
            <rect x="96" y="132" width="84" height="38" rx="4" />
          </g>
          {/* Building footprints */}
          <g fill="#EBEBE7">
            <rect x="94" y="34" width="22" height="16" />
            <rect x="124" y="34" width="18" height="16" />
            <rect x="94" y="66" width="22" height="18" />
            <rect x="228" y="66" width="24" height="16" />
            <rect x="228" y="100" width="22" height="16" />
            <rect x="300" y="34" width="22" height="16" />
            <rect x="300" y="100" width="24" height="18" />
            <rect x="484" y="64" width="22" height="16" />
            <rect x="484" y="134" width="20" height="16" />
            <rect x="160" y="100" width="20" height="14" />
          </g>
        </svg>
        {/* Tap ripple - "someone clicks the map" - then the pin drops on it. */}
        <span className="onboard-tap absolute left-[62%] top-[40%] -ml-4 -mt-4 block h-8 w-8 rounded-full border-2 border-accent" />
        <span className="absolute left-[62%] top-[40%] -ml-2 -mt-2 block h-4 w-4">
          <span className="onboard-pin block h-full w-full rounded-full border-2 border-white bg-accent shadow-[0_0_0_4px_rgba(29,78,216,0.18)]" />
        </span>
      </div>
      {/* Translucent findings, fading in over the settled camera. They sit
          OUTSIDE the camera layer so they read as UI over the map, not map. */}
      {INTRO_CHIPS.map((c, i) => (
        <span
          key={c.text}
          className="onboard-chip absolute flex items-center gap-1.5 rounded-full border border-surface-border bg-white/85 px-2.5 py-1 text-[11px] font-medium text-ink shadow-card backdrop-blur-[2px]"
          style={{ ...c.pos, "--chip-i": i } as React.CSSProperties}
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: c.tone === "pass" ? "var(--pass)" : "var(--caution)" }}
          />
          {c.text}
        </span>
      ))}
    </div>
  );
}

type Props = {
  /** Called when the user picks a lens, so the map can apply it immediately. */
  onPick?: (id: InterestViewId) => void;
  /**
   * Called once on any dismissal (lens pick, "Start exploring", Escape) - the
   * intro-to-map hand-off seam. The map page uses it to ease the real camera
   * toward the Melbourne centre, continuing the vignette's motion.
   */
  onDismiss?: () => void;
};

/**
 * First-run welcome that orients new visitors and lets them pick a starting
 * lens - shown once (localStorage flag), no signup. Returning users (who already
 * have any saved preference) never see it. Leads with the pin-dot F mark, the
 * wordmark and the tagline over a decorative map vignette (IntroVignette).
 */
export function OnboardingModal({ onPick, onDismiss }: Props) {
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
      /* localStorage unavailable - just don't onboard */
    }
  }, []);

  // useCallback (not a plain function): dismiss closes over the onDismiss
  // prop, and the keydown effect below depends on it.
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    onDismiss?.();
  }, [onDismiss]);

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
  }, [open, dismiss]);

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
        aria-labelledby="onboarding-brand onboarding-title"
        className="w-full max-w-lg rounded-t-2xl border border-surface-border bg-surface p-6 shadow-card sm:rounded-2xl"
      >
        <IntroVignette />

        {/* Brand lead: pin-dot F mark (same geometry as app/icon.svg) + wordmark. */}
        <div className="flex items-center gap-2.5">
          <svg
            width="24"
            height="26"
            viewBox="0 0 26 28"
            aria-hidden="true"
            focusable="false"
            className="text-accent"
          >
            <g fill="currentColor">
              <circle cx="6" cy="4" r="1.9" />
              <circle cx="11" cy="4" r="1.9" />
              <circle cx="16" cy="4" r="1.9" />
              <circle cx="21" cy="4" r="1.9" />
              <circle cx="6" cy="9" r="1.9" />
              <circle cx="6" cy="14" r="1.9" />
              <circle cx="11" cy="14" r="1.9" />
              <circle cx="16" cy="14" r="1.9" />
              <circle cx="6" cy="19" r="1.9" />
              <circle cx="6" cy="24" r="1.9" />
            </g>
          </svg>
          <span
            id="onboarding-brand"
            className="text-base font-semibold uppercase tracking-[0.06em] text-accent"
          >
            {PRODUCT_NAME}
          </span>
        </div>
        <h2
          id="onboarding-title"
          className="mt-2 font-display text-xl font-semibold text-ink"
        >
          A window towards your new home
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          A free map of Greater Melbourne built only from Australian government open data -
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
            Start exploring
          </button>
          <span className="text-[11px] text-ink-muted">No account needed</span>
        </div>
      </div>
    </div>
  );
}
