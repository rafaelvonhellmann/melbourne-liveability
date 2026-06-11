"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addClient, saveProfile, type ProfileType } from "@/lib/user-profile";

type Props = {
  /** Which landing profile card was clicked (Landing's onProfileChoice seam). */
  type: ProfileType;
  /** Fired once after the profile is persisted, on every dismissal path. */
  onClose: () => void;
};

/** Tabbable elements inside the dialog panel, for focus trap + initial focus. */
function focusablesIn(panel: HTMLElement | null): HTMLElement[] {
  return panel
    ? Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        )
      )
    : [];
}

/**
 * Quiet one-step sheet shown over the map right after a landing profile-card
 * click. Everything here is optional and it never blocks the map: Done,
 * Escape and a backdrop click all persist the profile (the chosen type at
 * minimum, plus whatever was typed) via lib/user-profile and close.
 *
 * Buyers get an optional first-name field; agents get a name/agency field
 * plus an optional first-client label. The stored record is inert beyond
 * getProfileGreeting() for now - see lib/user-profile for the follow-up note.
 */
export function ProfileSetup({ type, onClose }: Props) {
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  // Refs mirror the inputs so the keydown-effect's dismiss closure never
  // persists stale text (the effect re-binds on dismiss identity otherwise).
  const nameRef = useRef("");
  const clientLabelRef = useRef("");
  const closedRef = useRef(false);

  const persistAndClose = useCallback(() => {
    if (closedRef.current) return; // double-fire guard (Escape + backdrop)
    closedRef.current = true;
    const trimmedName = nameRef.current.trim();
    saveProfile({ type, name: trimmedName || undefined });
    const label = clientLabelRef.current.trim();
    if (type === "agent" && label) addClient(label);
    onClose();
  }, [type, onClose]);

  // Move focus into the dialog ONCE on mount - kept out of the keydown effect
  // below, which re-binds whenever the parent re-renders (onClose is an inline
  // prop) and would otherwise yank focus back to the first field mid-typing.
  useEffect(() => {
    focusablesIn(panelRef.current)[0]?.focus();
  }, []);

  // Keyboard handling, same pattern as OnboardingModal: trap Tab inside the
  // dialog and let Escape dismiss (persisting first).
  useEffect(() => {
    const panel = panelRef.current;
    const focusables = () => focusablesIn(panel);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        persistAndClose();
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
  }, [persistAndClose]);

  const isAgent = type === "agent";

  return (
    <div
      data-testid="profile-setup-backdrop"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) persistAndClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-setup-title"
        className="w-full max-w-md rounded-t-2xl border border-surface-border bg-surface p-6 shadow-card sm:rounded-2xl"
      >
        <h2
          id="profile-setup-title"
          className="font-display text-xl font-semibold text-ink"
        >
          {isAgent ? "Your client window is ready" : "Your window is ready"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {isAgent
            ? "Add your name or agency, and a first client if you have one in mind. Everything is optional and stays on this device."
            : "Add a first name if you like - it stays on this device and only personalises your window."}
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            persistAndClose();
          }}
        >
          <div>
            <label
              htmlFor="profile-setup-name"
              className="block text-xs font-semibold uppercase tracking-wide text-ink-muted"
            >
              {isAgent ? "Your name or agency (optional)" : "First name (optional)"}
            </label>
            <input
              id="profile-setup-name"
              type="text"
              value={name}
              maxLength={80}
              autoComplete="off"
              placeholder={isAgent ? "e.g. Riverside Realty" : "e.g. Sam"}
              onChange={(e) => {
                setName(e.target.value);
                nameRef.current = e.target.value;
              }}
              className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
            />
          </div>

          {isAgent && (
            <div>
              <label
                htmlFor="profile-setup-client"
                className="block text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Add your first client (optional)
              </label>
              <input
                id="profile-setup-client"
                type="text"
                value={clientLabel}
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. The Chen family"
                onChange={(e) => {
                  setClientLabel(e.target.value);
                  clientLabelRef.current = e.target.value;
                }}
                className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-xs text-ink-muted">
                You can add more clients and switch between them later.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-ink-muted">No account needed</span>
            <button
              type="submit"
              className="rounded-lg border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
