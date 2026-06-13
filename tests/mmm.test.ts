import { describe, expect, it } from "vitest";
import { rollupMmmSa1ToSa2, sa1ToSa2Code } from "../scripts/lib/mmm";

describe("Modified Monash Model SA1 to SA2 rollup", () => {
  it("uses the first 9 SA1 digits as the SA2 parent", () => {
    expect(sa1ToSa2Code("20601110601")).toBe("206011106");
  });

  it("uses the modal MMM code, not the first SA1 row", () => {
    const rolled = rollupMmmSa1ToSa2([
      { SA1_CODE21: "20601110601", MMM_CODE23: 2, MMM_NAME23: "Modified Monash 2" },
      { SA1_CODE21: "20601110602", MMM_CODE23: 1, MMM_NAME23: "Modified Monash 1" },
      { SA1_CODE21: "20601110603", MMM_CODE23: 1, MMM_NAME23: "Modified Monash 1" },
    ]);

    expect(rolled.get("206011106")?.code).toBe(1);
    expect(rolled.get("206011106")?.note).toContain("SA2 spans MM1/MM2");
  });
});
