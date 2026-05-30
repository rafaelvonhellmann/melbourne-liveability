import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RAW = path.join(ROOT, "data", "raw");
export const GENERATED = path.join(ROOT, "data", "generated");
export const PUBLIC_DATA = path.join(ROOT, "public", "data");
