import type { DomainId } from "./types";
import {
  domainProperty,
  getScoreRamp,
  NO_DATA_COLOR,
  RISK_PALETTE,
  RISK_BANDS,
} from "./colors";

export function choroplethFillColor(domain: DomainId, colorblind = false): unknown[] {
  return choroplethFillColorByProp(domainProperty(domain), colorblind);
}

export function choroplethFillColorByProp(property: string, colorblind = false): unknown[] {
  const prop = ["get", property];
  return [
    "case",
    ["==", ["get", "nonResidential"], true],
    NO_DATA_COLOR,
    ["==", prop, null],
    NO_DATA_COLOR,
    // Continuous worse->better interpolation for fine granularity. Default ramp
    // is Red->Yellow->Green; the colourblind-safe toggle swaps the top half to
    // blue (RdYlBu). See getScoreRamp in ./colors.
    [
      "interpolate",
      ["linear"],
      prop,
      ...getScoreRamp(colorblind).flatMap(([p, c]) => [p, c]),
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
