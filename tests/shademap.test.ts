import { describe, it, expect } from "vitest";
import { shadeMapUrl } from "../lib/shademap";

describe("shadeMapUrl", () => {
  it("builds a shademap.app permalink centred on the pin", () => {
    expect(shadeMapUrl(-37.8136, 144.9631)).toBe(
      "https://shademap.app/@-37.81360,144.96310,17z"
    );
  });

  it("rounds coordinates to 5 dp and honours a custom zoom", () => {
    expect(shadeMapUrl(-37.123456, 144.987654, 15)).toBe(
      "https://shademap.app/@-37.12346,144.98765,15z"
    );
  });
});
