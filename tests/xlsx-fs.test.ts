import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import "../scripts/lib/xlsx-fs";

/**
 * Regression: SheetJS 0.20.3's ESM build (picked by the package "exports"
 * import condition) has NO fs until set_fs is called - XLSX.readFile threw
 * "Cannot access file <path>" for EVERY path, which the 2026-06-10 refresh
 * surfaced as silently-zeroed crime data and carried-forward VIF projections.
 * scripts/lib/xlsx-fs.ts must make file IO work for whatever build resolved.
 */
describe("xlsx-fs side-effect wiring", () => {
  it("round-trips a workbook through the file system", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "xlsx-fs-"));
    const file = path.join(dir, "roundtrip.xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Year", "Offence Count"],
        [2025, 7],
      ]),
      "Table 99"
    );
    XLSX.writeFile(wb, file);
    const back = XLSX.readFile(file);
    expect(back.SheetNames).toEqual(["Table 99"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      back.Sheets["Table 99"]
    );
    expect(rows).toEqual([{ Year: 2025, "Offence Count": 7 }]);
  });
});
