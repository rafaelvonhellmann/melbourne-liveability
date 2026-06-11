/**
 * Side-effect module: wire Node's fs into SheetJS so XLSX.readFile works.
 *
 * Since the 0.20.3 CVE upgrade (58c8b26, 2026-06-10) the package "exports" map
 * resolves `import ... from "xlsx"` to the ESM build (xlsx.mjs), which ships
 * with NO file-system access: every XLSX.readFile / writeFile throws
 * "Cannot access file <path>" - for EVERY path, file present or not - until
 * set_fs is called. All pipeline scripts run as ESM under tsx ("type":
 * "module"), so the 2026-06-10 refresh (run 27280836153) lost every
 * workbook-backed source at once: the VCSA crime XLSX (-> domains.safety
 * zeroed, coverage gate refused the commit) and the committed VIF2023 XLSX
 * (-> context.projections silently carried forward), both surfacing only as
 * optional-file warnings.
 *
 * Import this (for its side effect) in ANY module that calls XLSX.readFile or
 * XLSX.writeFile. ESM module records are shared, so one call wires the same
 * instance the importing module sees. The CJS build wires fs itself; calling
 * set_fs again there is harmless.
 */
import * as fs from "node:fs";
import XLSX from "xlsx";

(XLSX as { set_fs?: (m: typeof fs) => void }).set_fs?.(fs);
