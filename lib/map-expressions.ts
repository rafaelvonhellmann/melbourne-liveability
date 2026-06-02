import type { DomainId } from "./types";
import {
  domainProperty,
  DATA_PALETTE,
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
    // 5 discrete colorblind-safe YlGnBu bands — floor(p/20)
    [
      "step",
      prop,
      DATA_PALETTE[0],
      20,
      DATA_PALETTE[1],
      40,
      DATA_PALETTE[2],
      60,
      DATA_PALETTE[3],
      80,
      DATA_PALETTE[4],
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
