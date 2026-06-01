import { describe, it, expect } from "vitest";
import {
  parseListParam,
  serializeList,
  parseMapUrlState,
  buildMapUrl,
  buildCompareUrl,
} from "../lib/share-url";
import { normalizeWeights } from "../lib/weights";

describe("share-url", () => {
  it("round-trips shortlist", () => {
    const list = ["carlton-123", "box-hill-456"];
    expect(parseListParam(serializeList(list))).toEqual(list);
  });

  it("parses map state from query", () => {
    const state = parseMapUrlState(
      "w=affordability:30,transport:18,safety:14,health:14,hazards:8,education:8,income:8&list=a,b&view=rental&persona=family"
    );
    expect(state.shortlist).toEqual(["a", "b"]);
    expect(state.view).toBe("rental");
    expect(state.persona).toBe("family");
    expect(state.weights?.affordability).toBe(30);
  });

  it("builds map url with view", () => {
    const url = buildMapUrl("/", {
      weights: normalizeWeights({ affordability: 40, transport: 20 }),
      shortlist: ["x"],
      view: "education",
    });
    expect(url).toContain("view=education");
    expect(url).toContain("list=x");
  });

  it("parses a valid layer deep-link and rejects unknown layers", () => {
    expect(parseMapUrlState("layer=transport").layer).toBe("transport");
    expect(parseMapUrlState("layer=bogus").layer).toBeNull();
    expect(parseMapUrlState("").layer).toBeNull();
  });

  it("serializes the layer param", () => {
    const url = buildMapUrl("/", { layer: "safety" });
    expect(url).toContain("layer=safety");
  });

  it("builds compare url", () => {
    const url = buildCompareUrl(["a", "b"]);
    const list = new URL(url, "http://localhost").searchParams.get("list");
    expect(parseListParam(list)).toEqual(["a", "b"]);
  });

  it("round-trips buyer mode + pin", () => {
    const url = buildMapUrl("/", { buyer: true, pin: [144.9876, -37.8001] });
    expect(url).toContain("buyer=1");
    const state = parseMapUrlState(new URL(url, "http://localhost").search.slice(1));
    expect(state.buyer).toBe(true);
    expect(state.pin?.[0]).toBeCloseTo(144.9876, 3);
    expect(state.pin?.[1]).toBeCloseTo(-37.8001, 3);
  });

  it("rejects out-of-region / junk pins", () => {
    expect(parseMapUrlState("buyer=1&lat=0&lng=0").pin).toBeNull(); // gulf of guinea
    expect(parseMapUrlState("buyer=1&lat=-33.8&lng=151.2").pin).toBeNull(); // sydney
    expect(parseMapUrlState("buyer=1&lat=foo&lng=bar").pin).toBeNull();
    expect(parseMapUrlState("buyer=1").pin).toBeNull();
  });
});
