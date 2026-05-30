"use client";

import { PERSONA_PRESETS, type PersonaId } from "@/lib/personas";

type PersonaPresetsProps = {
  onSelect: (id: PersonaId) => void;
};

export function PersonaPresets({ onSelect }: PersonaPresetsProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/95 p-3 backdrop-blur">
      <p className="text-sm font-medium text-slate-200">Persona presets</p>
      <p className="mt-0.5 text-xs text-slate-500">One-tap weight profiles for common movers.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(PERSONA_PRESETS) as PersonaId[]).map((id) => {
          const p = PERSONA_PRESETS[id];
          return (
            <button
              key={id}
              type="button"
              title={p.description}
              onClick={() => onSelect(id)}
              className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-emerald-700 hover:text-emerald-200"
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
