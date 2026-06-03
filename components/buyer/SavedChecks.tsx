"use client";

import { MapPin, X } from "lucide-react";
import type { SavedCheck } from "@/lib/user-prefs";

type SavedChecksProps = {
  checks: SavedCheck[];
  onOpen: (check: SavedCheck) => void;
  onRemove: (id: string) => void;
};

/**
 * Device-local list of saved Buyer Location Checks (pins the user wants to
 * return to). Reopening regenerates the deterministic report from the stored
 * coordinates - we persist the location, not the report. Cross-device sync would
 * need an accounts service (out of scope for the static app).
 */
export function SavedChecks({ checks, onOpen, onRemove }: SavedChecksProps) {
  if (checks.length === 0) return null;
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Your saved checks
      </h3>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
        Saved on this device only. Reopen to drop the pin and regenerate the report.
      </p>
      <ul className="mt-2 space-y-1">
        {checks.map((c) => {
          const primary =
            c.label || c.areaName || `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
          const secondary = c.label && c.areaName ? c.areaName : null;
          return (
            <li key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
              >
                <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{primary}</span>
                  {secondary && (
                    <span className="block truncate text-[11px] text-ink-muted">
                      {secondary}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={`Remove saved check: ${primary}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
