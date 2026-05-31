import type { DomainId, ScoreWeights } from "./types";
import type { PersonaId } from "./personas";
import { V1_SCORED_DOMAINS } from "./domains";
import { parseWeightsFromSearchParams, serializeWeights } from "./weights";
import { parseInterestView, type InterestViewId } from "./interest-views";

export type MapUrlState = {
  weights: ScoreWeights | null;
  shortlist: string[];
  persona: PersonaId | null;
  view: InterestViewId | null;
  /** Optional one-shot deep-link to activate a specific choropleth domain. */
  layer: DomainId | null;
};

function parseLayer(raw: string | null): DomainId | null {
  if (!raw) return null;
  return (V1_SCORED_DOMAINS as string[]).includes(raw)
    ? (raw as DomainId)
    : null;
}

export function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function serializeList(slugs: string[]): string {
  return slugs.join(",");
}

export function parseMapUrlState(search: string): MapUrlState {
  const params = new URLSearchParams(search);
  const persona = params.get("persona");
  const validPersonas = ["family", "youngPro", "retiree", "student"] as const;
  return {
    weights: parseWeightsFromSearchParams(search),
    shortlist: parseListParam(params.get("list")),
    persona:
      persona && (validPersonas as readonly string[]).includes(persona)
        ? (persona as PersonaId)
        : null,
    view: parseInterestView(params.get("view")),
    layer: parseLayer(params.get("layer")),
  };
}

export function buildMapUrl(
  base: string,
  state: Partial<MapUrlState>
): string {
  const params = new URLSearchParams();
  if (state.weights && Object.keys(state.weights).length > 0) {
    params.set("w", serializeWeights(state.weights));
  }
  if (state.shortlist && state.shortlist.length > 0) {
    params.set("list", serializeList(state.shortlist));
  }
  if (state.persona) params.set("persona", state.persona);
  if (state.view && state.view !== "general") params.set("view", state.view);
  if (state.layer) params.set("layer", state.layer);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function buildCompareUrl(slugs: string[], weights?: ScoreWeights): string {
  const params = new URLSearchParams();
  if (slugs.length > 0) params.set("list", serializeList(slugs.slice(0, 4)));
  if (weights) params.set("w", serializeWeights(weights));
  const q = params.toString();
  return q ? `/compare?${q}` : "/compare";
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
