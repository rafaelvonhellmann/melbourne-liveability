import type { DomainId } from "./types";
import { domainProperty } from "./colors";

export function choroplethFillColor(domain: DomainId): unknown[] {
  const prop = ["get", domainProperty(domain)];
  return [
    "case",
    ["==", ["get", "nonResidential"], true],
    "#4a5568",
    ["==", prop, null],
    "#64748b",
    [
      "interpolate",
      ["linear"],
      prop,
      0,
      "#440154",
      25,
      "#3b528b",
      50,
      "#21918c",
      75,
      "#5ec962",
      100,
      "#fde725",
    ],
  ];
}
