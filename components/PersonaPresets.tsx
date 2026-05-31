"use client";

import { PERSONA_PRESETS, type PersonaId } from "@/lib/personas";

type PersonaPresetsProps = {
  onSelect: (id: PersonaId) => void;
};

export function PersonaPresets({ onSelect }: PersonaPresetsProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Persona presets
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        One-tap weight profiles for common movers.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(PERSONA_PRESETS) as PersonaId[]).map((id) => {
          const p = PERSONA_PRESETS[id];
          return (
            <button
              key={id}
              type="button"
              title={p.description}
              onClick={() => onSelect(id)}
              className="rounded-full border border-surface-border bg-surface-sunken px-3 py-1.5 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
