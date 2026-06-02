import type { DomainId } from "./types";
import {
  domainProperty,
  SCORE_RAMP,
  NO_DATA_COLOR,
  RISK_PALETTE,
  RISK_BANDS,
} from "./colors";

export function choroplethFillColor(domain: DomainId): unknown[] {
  return choroplethFillColorByProp(domainProperty(domain));
}

export function choroplethFillColorByProp(property: string): unknown[] {
  const prop = ["get", property];
  return [
    "case",
    ["==", ["get", "nonResidential"], true],
    NO_DATA_COLOR,
    ["==", prop, null],
    NO_DATA_COLOR,
    // Continuous Red->Yellow->Green interpolation (worse -> better) for fine
    // granularity. See SCORE_RAMP in ./colors.
    [
      "interpolate",
      ["linear"],
      prop,
      ...SCORE_RAMP.flatMap(([p, c]) => [p, c]),
    ],
  ];
}

/**
 * Risk choropleth for the hazard overlay-share layers (bushfire / flood). Same
 * null/non-residential handling as the score ramp, but a Reds step keyed to
 * RISK_BANDS (high overlay share = deep red). See RISK_PALETTE in ./colors.
 */
export function riskFillColorByProp(property: string): unknown[] {
  const prop = ["get", property];
  return [
    "case",
    ["==", ["get", "nonResidential"], true],
    NO_DATA_COLOR,
    ["==", prop, null],
    NO_DATA_COLOR,
    [
      "step",
      prop,
      RISK_PALETTE[0],
      RISK_BANDS[0],
      RISK_PALETTE[1],
      RISK_BANDS[1],
      RISK_PALETTE[2],
      RISK_BANDS[2],
      RISK_PALETTE[3],
      RISK_BANDS[3],
      RISK_PALETTE[4],
    ],
  ];
}
