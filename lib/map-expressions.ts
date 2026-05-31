import type { DomainId } from "./types";
import { domainProperty, DATA_PALETTE, NO_DATA_COLOR } from "./colors";

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
