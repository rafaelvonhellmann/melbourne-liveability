/** Crosswalk record: SA2 ↔ suburb/LGA with overlap weights (population- or area-weighted). */

import REGIONS from "./regions";

export type CrosswalkMethod = "population-weighted" | "area-weighted";

export type SuburbOverlap = {
  suburb: string;
  salCode: string;
  lga: string;
  weight: number;
  method: CrosswalkMethod;
};

export type Sa2CrosswalkEntry = {
  sa2Code: string;
  sa2Name: string;
  suburbs: SuburbOverlap[];
};

export type CrosswalkFile = {
  region: string;
  generatedAt: string;
  /** SA2 code → overlapping suburbs */
  sa2ToSuburb: Record<string, Sa2CrosswalkEntry>;
  /** SAL code → SA2 codes (inverse index) */
  suburbToSa2: Record<string, { sa2Code: string; weight: number }[]>;
  /** Suburb display name (normalized) → SAL codes for search */
  suburbAliases: Record<string, string[]>;
};

/** Alias kept for existing consumers - the registry (lib/regions.ts) is now
 * the source of truth; value is unchanged ("2GMEL"). */
export const GREATER_MELBOURNE_GCCSA = REGIONS.melbourne.gccsa;
export const WEIGHT_SUM_TOLERANCE = 0.01;
