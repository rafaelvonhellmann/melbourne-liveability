"use client";

import { useRef, useState } from "react";
import { MapPin, Plus, Search, Trash2, X } from "lucide-react";
import {
  DEAL_BREAKERS,
  type BuyerProfile,
  type BuyerIntent,
  type HouseholdType,
  type CarAccess,
  type Importance,
  type DealBreakerId,
} from "@/lib/buyer-fit";
import { geocodeAddress, type GeocodeResult } from "@/lib/geocode";
import {
  ANCHOR_KINDS,
  anchorKindLabel,
  type AnchorKind,
  type BuyerAnchor,
} from "@/lib/anchors";

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
];
const IMPORTANCE: Importance[] = ["low", "medium", "high"];

type Props = {
  initial: BuyerProfile | null;
  onSave: (p: BuyerProfile) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Lightweight personal-preference form. Local-only - feeds the report's
 * "Fit for your life" + deal-breaker flags via lib/buyer-fit. Never
 * changes the score.
 */
export function BuyerProfilePanel({ initial, onSave, onClear, onClose }: Props) {
  // Legacy saved profiles may carry the retired "agent" mode - coerce to buyer.
  const [p, setP] = useState<BuyerProfile>(
    initial ? { ...initial, mode: "buyer" } : { mode: "buyer" }
  );
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
            Your preferences
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Re-frames the report for you - never changes the score. Saved only
            in this browser.
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

        <Field label="Your places (we measure each property against them)">
          <AnchorEditor
            anchors={p.anchors ?? []}
            onChange={(anchors) => set({ anchors })}
          />
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
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Add real-life anchors (work / school / family) by geocoded address. Each is
 * stored on the profile; the buyer report measures every dropped pin against
 * them (straight-line). Reuses the Nominatim geocoder, like the main search box.
 */
function AnchorEditor({
  anchors,
  onChange,
}: {
  anchors: BuyerAnchor[];
  onChange: (next: BuyerAnchor[]) => void;
}) {
  const [kind, setKind] = useState<AnchorKind>("work");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const search = async () => {
    const query = q.trim();
    if (query.length < 3) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setResults([]);
    try {
      const found = await geocodeAddress(query, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResults(found);
      setStatus(found.length ? "idle" : "empty");
    } catch (err) {
      if (ctrl.signal.aborted || (err as Error)?.name === "AbortError") return;
      setStatus("error");
    }
  };

  const add = (r: GeocodeResult) => {
    const id = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;
    onChange([
      ...anchors.filter((a) => a.id !== id),
      { id, kind, label: r.shortLabel, lng: r.lng, lat: r.lat },
    ]);
    setQ("");
    setResults([]);
    setStatus("idle");
  };

  const seg = (active: boolean) =>
    `rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
      active
        ? "bg-accent text-accent-ink"
        : "border border-surface-border text-ink-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="space-y-2">
      {anchors.length > 0 && (
        <ul className="space-y-1">
          {anchors.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-surface-border bg-surface-sunken px-2 py-1"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{a.label}</span>
                <span className="block text-[10px] tracking-wide text-ink-muted">
                  {anchorKindLabel(a.kind)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.label}`}
                onClick={() => onChange(anchors.filter((x) => x.id !== a.id))}
                className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:text-accent"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        {ANCHOR_KINDS.map((k) => (
          <button key={k.id} type="button" className={seg(kind === k.id)} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex items-center gap-2 rounded-md border border-surface-border bg-surface px-2 py-1"
      >
        <button
          type="submit"
          aria-label="Find this address"
          disabled={q.trim().length < 3}
          className="shrink-0 text-ink-muted transition-colors hover:text-accent disabled:opacity-40"
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Add a ${anchorKindLabel(kind).toLowerCase()} address…`}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Anchor address"
        />
      </form>

      {status === "loading" && <p className="text-[11px] text-ink-muted">Searching addresses…</p>}
      {status === "error" && (
        <p className="text-[11px] text-ink-muted">Couldn&apos;t reach address search - try again.</p>
      )}
      {status === "empty" && (
        <p className="text-[11px] text-ink-muted">No Melbourne address matched.</p>
      )}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-md border border-surface-border">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                onClick={() => add(r)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] text-ink hover:bg-surface-sunken"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{r.shortLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-snug text-ink-muted">
        Each property is measured against your places (straight-line) - verify the real commute.
      </p>
    </div>
  );
}
