"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  DEAL_BREAKERS,
  type BuyerProfile,
  type ProfileMode,
  type BuyerIntent,
  type HouseholdType,
  type CarAccess,
  type Importance,
  type DealBreakerId,
} from "@/lib/buyer-fit";

const HOUSEHOLDS: { id: HouseholdType; label: string }[] = [
  { id: "solo", label: "Just me" },
  { id: "couple", label: "Couple" },
  { id: "family", label: "Family with kids" },
  { id: "share", label: "Sharehouse" },
  { id: "retiree", label: "Retiree" },
];
const CARS: { id: CarAccess; label: string }[] = [
  { id: "no_car", label: "No car" },
  { id: "one_car", label: "One car" },
  { id: "multi_car", label: "2+ cars" },
];
const PRIORITIES: { key: keyof BuyerProfile; label: string }[] = [
  { key: "transport", label: "Public transport" },
  { key: "quiet", label: "Quiet" },
  { key: "schools", label: "Schools" },
  { key: "safety", label: "Safety" },
  { key: "walkability", label: "Walkability" },
];
const IMPORTANCE: Importance[] = ["low", "medium", "high"];

type Props = {
  initial: BuyerProfile | null;
  onSave: (p: BuyerProfile) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Lightweight personal-preference form (buyer or agent). Local-only — feeds the
 * report's "Fit for your life" + deal-breaker flags via lib/buyer-fit. Never
 * changes the score.
 */
export function BuyerProfilePanel({ initial, onSave, onClear, onClose }: Props) {
  const [p, setP] = useState<BuyerProfile>(initial ?? { mode: "buyer" });
  const set = (patch: Partial<BuyerProfile>) => setP((prev) => ({ ...prev, ...patch }));
  const toggleDB = (id: DealBreakerId) =>
    setP((prev) => {
      const cur = new Set(prev.dealBreakers ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, dealBreakers: [...cur] };
    });

  const seg = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-accent text-accent-ink"
        : "border border-surface-border text-ink-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-medium text-ink">
            {p.mode === "agent" ? "Client preferences" : "Your preferences"}
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Re-frames the report for {p.mode === "agent" ? "your client" : "you"} — never changes
            the score. Saved only in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preferences"
          className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 space-y-3 text-sm">
        <Field label="I'm using this as">
          <div className="flex gap-1.5">
            {(["buyer", "agent"] as ProfileMode[]).map((m) => (
              <button key={m} type="button" className={seg(p.mode === m)} onClick={() => set({ mode: m })}>
                {m === "buyer" ? "A buyer / renter" : "An agent (for a client)"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Looking to">
          <div className="flex gap-1.5">
            {(["buy", "rent"] as BuyerIntent[]).map((i) => (
              <button key={i} type="button" className={seg(p.intent === i)} onClick={() => set({ intent: i })}>
                {i === "buy" ? "Buy" : "Rent"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Household">
          <select
            value={p.household ?? ""}
            onChange={(e) => set({ household: (e.target.value || undefined) as HouseholdType })}
            className="w-full rounded-md border border-surface-border bg-surface px-2 py-1.5 text-sm text-ink"
          >
            <option value="">Prefer not to say</option>
            {HOUSEHOLDS.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Car access">
          <div className="flex gap-1.5">
            {CARS.map((c) => (
              <button key={c.id} type="button" className={seg(p.car === c.id)} onClick={() => set({ car: c.id })}>
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What matters to you?">
          <ul className="space-y-1">
            {PRIORITIES.map((pr) => (
              <li key={pr.key} className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">{pr.label}</span>
                <div className="flex gap-1">
                  {IMPORTANCE.map((imp) => (
                    <button
                      key={imp}
                      type="button"
                      className={seg((p[pr.key] as Importance | undefined) === imp)}
                      onClick={() => set({ [pr.key]: imp } as Partial<BuyerProfile>)}
                    >
                      {imp === "low" ? "Low" : imp === "medium" ? "Med" : "High"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Field>

        <Field label="Deal-breakers (flag these to verify)">
          <ul className="space-y-1">
            {DEAL_BREAKERS.map((db) => (
              <li key={db.id}>
                <label className="flex cursor-pointer items-center gap-2 text-ink">
                  <input
                    type="checkbox"
                    checked={(p.dealBreakers ?? []).includes(db.id)}
                    onChange={() => toggleDB(db.id)}
                    className="rounded border-surface-border accent-accent"
                  />
                  <span className="text-[13px]">{db.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-surface-border pt-3">
        <button
          type="button"
          onClick={() => onSave(p)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
        >
          Save preferences
        </button>
        {initial && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}
