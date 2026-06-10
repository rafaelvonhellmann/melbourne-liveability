import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlanningAt,
  parseArcgisPlanning,
  parseWfsPlanning,
  prettyPlanningName,
  zoneGroupMeaning,
  zoneParent,
  PARCEL_OVERLAY_META,
  WHITELISTED_OVERLAY_PARENTS,
} from "../lib/planning-at";

/**
 * Fixtures are REAL response shapes captured live (2026-06-10) from both
 * endpoints at a Carlton point (144.9674, -37.8001) - geometry stripped, since
 * the parsers only read properties/attributes. If either upstream changes its
 * schema these tests stay green but the live integration breaks; the runtime
 * then degrades to the SA2 fallback by design (fetchPlanningAt -> null).
 */

const CHECKED = "2026-06-10";

const wfsFeature = (props: Record<string, unknown>) => ({
  type: "Feature",
  id: "x",
  geometry: null,
  properties: props,
});

const WFS_ZONE = {
  type: "FeatureCollection",
  features: [
    wfsFeature({
      pfi: 3075133,
      scheme_code: "ZN",
      lga_code: "343",
      lga: "MELBOURNE",
      zone_num: 711,
      zone_status: "g",
      zone_code: "C1Z",
      zone_description: "COMMERCIAL 1 ZONE",
      gaz_begin_date: "2014-06-13T00:00:00Z",
    }),
  ],
  totalFeatures: 1,
  numberMatched: 1,
  numberReturned: 1,
};

const WFS_OVERLAY = {
  type: "FeatureCollection",
  features: [
    wfsFeature({
      scheme_code: "HO",
      lga: "MELBOURNE",
      zone_status: "g",
      zone_code: "HO1",
      zone_description: "HERITAGE OVERLAY (HO1)",
      gaz_begin_date: null,
    }),
    wfsFeature({
      scheme_code: "PO",
      lga: "MELBOURNE",
      zone_status: "g",
      zone_code: "PO12",
      zone_description: "PARKING OVERLAY - PRECINCT 12",
      gaz_begin_date: "2013-04-19T00:00:00Z",
    }),
    wfsFeature({
      scheme_code: "DDO",
      lga: "MELBOURNE",
      zone_status: "g",
      zone_code: "DDO48",
      zone_description: "DESIGN AND DEVELOPMENT OVERLAY - SCHEDULE 48",
      gaz_begin_date: "2002-12-19T00:00:00Z",
    }),
    // Duplicate polygon of the same schedule (parcels meet at boundaries).
    wfsFeature({
      scheme_code: "DDO",
      lga: "MELBOURNE",
      zone_status: "g",
      zone_code: "DDO48",
      zone_description: "DESIGN AND DEVELOPMENT OVERLAY - SCHEDULE 48",
      gaz_begin_date: "2002-12-19T00:00:00Z",
    }),
    // Proposed (non-gazetted) overlay must be dropped, not reported.
    wfsFeature({
      scheme_code: "LSIO",
      lga: "MELBOURNE",
      zone_status: "p",
      zone_code: "LSIO9",
      zone_description: "LAND SUBJECT TO INUNDATION OVERLAY - SCHEDULE 9",
      gaz_begin_date: null,
    }),
  ],
};

const ARC_ZONE = {
  displayFieldName: "SCHEME_CODE",
  features: [
    {
      attributes: {
        ZONE_CODE: "C1Z",
        ZONE_DESCRIPTION: "COMMERCIAL 1 ZONE",
        ZONE_CODE_GROUP: "C1Z",
        LGA: "MELBOURNE",
        GAZ_BEGIN_DATE: 1402617600000, // 2014-06-13 UTC
      },
    },
  ],
};

const ARC_OVERLAY = {
  displayFieldName: "SCHEME_CODE",
  features: [
    {
      attributes: {
        ZONE_CODE: "HO1",
        ZONE_DESCRIPTION: "HERITAGE OVERLAY (HO1)",
        ZONE_CODE_GROUP: "HO",
        LGA: "MELBOURNE",
        GAZ_BEGIN_DATE: null,
      },
    },
    {
      attributes: {
        ZONE_CODE: "PO12",
        ZONE_DESCRIPTION: "PARKING OVERLAY - PRECINCT 12",
        ZONE_CODE_GROUP: "PO",
        LGA: "MELBOURNE",
        GAZ_BEGIN_DATE: 1366329600000, // 2013-04-19 UTC
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zoneParent / prettyPlanningName / zoneGroupMeaning", () => {
  it("strips the trailing schedule number only", () => {
    expect(zoneParent("GRZ1")).toBe("GRZ");
    expect(zoneParent("HO123")).toBe("HO");
    expect(zoneParent("DDO48")).toBe("DDO");
    expect(zoneParent("C1Z")).toBe("C1Z"); // inner digit is part of the code
    expect(zoneParent("PUZ6")).toBe("PUZ");
  });

  it("title-cases names but keeps code/number tokens verbatim", () => {
    expect(prettyPlanningName("COMMERCIAL 1 ZONE")).toBe("Commercial 1 Zone");
    expect(prettyPlanningName("DESIGN AND DEVELOPMENT OVERLAY - SCHEDULE 48")).toBe(
      "Design and Development Overlay - Schedule 48"
    );
    expect(prettyPlanningName("HERITAGE OVERLAY (HO1)")).toBe("Heritage Overlay (HO1)");
  });

  it("has a plain-English line for common groups and an honest generic fallback", () => {
    expect(zoneGroupMeaning("GRZ")).toMatch(/residential/i);
    expect(zoneGroupMeaning("C1Z")).toMatch(/commercial/i);
    const generic = zoneGroupMeaning("XYZ");
    expect(generic).toMatch(/planning scheme/i);
  });

  it("every whitelisted overlay family has meta with a meaning + severity", () => {
    for (const parent of WHITELISTED_OVERLAY_PARENTS) {
      const meta = PARCEL_OVERLAY_META[parent];
      expect(meta?.name, parent).toBeTruthy();
      expect(meta?.buyerMeaning.length, parent).toBeGreaterThan(20);
      expect(["high", "medium", "low"]).toContain(meta?.severity);
    }
  });
});

describe("parseWfsPlanning (primary endpoint shape)", () => {
  it("maps the zone with parent, pretty description, gazettal as-at and LGA", () => {
    const r = parseWfsPlanning(WFS_ZONE, WFS_OVERLAY, CHECKED);
    expect(r).not.toBeNull();
    expect(r!.zone).toEqual({
      code: "C1Z",
      parent: "C1Z",
      description: "Commercial 1 Zone",
      lga: "Melbourne",
      gazetted: true,
      asAt: "2014-06-13",
    });
  });

  it("maps overlays: family from scheme_code, gazetted only, deduped, dated", () => {
    const r = parseWfsPlanning(WFS_ZONE, WFS_OVERLAY, CHECKED);
    const codes = r!.overlays.map((o) => o.code);
    expect(codes).toEqual(["HO1", "PO12", "DDO48"]); // dedup + proposed LSIO9 dropped
    const ho = r!.overlays.find((o) => o.code === "HO1")!;
    expect(ho.parent).toBe("HO");
    expect(ho.asAt).toBe(CHECKED); // null gaz date -> lookup date
    const po = r!.overlays.find((o) => o.code === "PO12")!;
    expect(po.asAt).toBe("2013-04-19");
  });

  it("treats a null/missing zone_status as gazetted (in-force LSIO rows carry null status)", () => {
    // Live City of Melbourne data has in-force LSIO flood overlays whose
    // zone_status is NULL - they must stay in the report, not be dropped as
    // "proposed" (which would also trigger a false parcel-overlays-clear).
    const overlaysWithNullStatus = {
      type: "FeatureCollection",
      features: [
        wfsFeature({
          scheme_code: "LSIO",
          lga: "MELBOURNE",
          zone_status: null,
          zone_code: "LSIO5",
          zone_description: "LAND SUBJECT TO INUNDATION OVERLAY - SCHEDULE 5",
          gaz_begin_date: "2018-03-01T00:00:00Z",
        }),
        // Missing key entirely behaves the same as null.
        wfsFeature({
          scheme_code: "SBO",
          lga: "MELBOURNE",
          zone_code: "SBO2",
          zone_description: "SPECIAL BUILDING OVERLAY - SCHEDULE 2",
          gaz_begin_date: null,
        }),
        // An explicit non-"g" status is still proposed and still dropped.
        wfsFeature({
          scheme_code: "LSIO",
          lga: "MELBOURNE",
          zone_status: "p",
          zone_code: "LSIO9",
          zone_description: "LAND SUBJECT TO INUNDATION OVERLAY - SCHEDULE 9",
          gaz_begin_date: null,
        }),
      ],
    };
    const r = parseWfsPlanning(WFS_ZONE, overlaysWithNullStatus, CHECKED);
    expect(r!.overlays.map((o) => o.code)).toEqual(["LSIO5", "SBO2"]);
    const lsio = r!.overlays.find((o) => o.code === "LSIO5")!;
    expect(lsio.parent).toBe("LSIO");
    expect(lsio.asAt).toBe("2018-03-01");
  });

  it("returns an empty-but-successful result for zero features (off-scheme point)", () => {
    const empty = { type: "FeatureCollection", features: [] };
    const r = parseWfsPlanning(empty, empty, CHECKED);
    expect(r).toEqual({ zone: null, overlays: [] });
  });

  it("returns null (endpoint failure) for non-feature-collection payloads", () => {
    expect(parseWfsPlanning({ error: "boom" }, WFS_OVERLAY, CHECKED)).toBeNull();
    expect(parseWfsPlanning(WFS_ZONE, "<html>WAF</html>", CHECKED)).toBeNull();
    expect(parseWfsPlanning(null, null, CHECKED)).toBeNull();
  });

  it("keeps a non-gazetted zone only as a flagged fallback", () => {
    const proposedOnly = {
      type: "FeatureCollection",
      features: [
        wfsFeature({
          scheme_code: "ZN",
          zone_status: "p",
          zone_code: "GRZ1",
          zone_description: "GENERAL RESIDENTIAL ZONE - SCHEDULE 1",
          gaz_begin_date: null,
        }),
      ],
    };
    const r = parseWfsPlanning(proposedOnly, { type: "FeatureCollection", features: [] }, CHECKED);
    expect(r!.zone).toMatchObject({ code: "GRZ1", parent: "GRZ", gazetted: false, asAt: CHECKED });
  });
});

describe("parseArcgisPlanning (fallback endpoint shape)", () => {
  it("maps zone + overlays, converting epoch-ms gazettal dates", () => {
    const r = parseArcgisPlanning(ARC_ZONE, ARC_OVERLAY, CHECKED);
    expect(r).not.toBeNull();
    expect(r!.zone).toMatchObject({
      code: "C1Z",
      parent: "C1Z",
      description: "Commercial 1 Zone",
      gazetted: true,
      asAt: "2014-06-13",
    });
    const po = r!.overlays.find((o) => o.code === "PO12")!;
    expect(po.parent).toBe("PO");
    expect(po.asAt).toBe("2013-04-19");
    const ho = r!.overlays.find((o) => o.code === "HO1")!;
    expect(ho.asAt).toBe(CHECKED); // null date -> lookup date
  });

  it("returns null for the ArcGIS {error} payload (HTTP 200 failures)", () => {
    const err = { error: { code: 400, message: "Invalid parameters" } };
    expect(parseArcgisPlanning(err, ARC_OVERLAY, CHECKED)).toBeNull();
  });
});

describe("fetchPlanningAt (never throws; WFS primary, ArcGIS fallback)", () => {
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const failRes = { ok: false, status: 500, json: async () => ({}) };

  it("uses the WFS when it answers, tagging source=wfs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        expect(url).toContain("opendata.maps.vic.gov.au");
        return okJson(url.includes("plan_zone") ? WFS_ZONE : WFS_OVERLAY);
      })
    );
    const r = await fetchPlanningAt(144.9674, -37.8001);
    expect(r?.source).toBe("wfs");
    expect(r?.zone?.code).toBe("C1Z");
    expect(r?.overlays.map((o) => o.code)).toContain("HO1");
    expect(r?.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to ArcGIS when the WFS fails, tagging source=arcgis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("opendata.maps.vic.gov.au")) return failRes;
        expect(url).toContain("plan-gis.mapshare.vic.gov.au");
        expect(url).toContain("/MapServer/0/query"); // layer 0 only
        return okJson(url.includes("Zones") ? ARC_ZONE : ARC_OVERLAY);
      })
    );
    const r = await fetchPlanningAt(144.9674, -37.8001);
    expect(r?.source).toBe("arcgis");
    expect(r?.zone?.code).toBe("C1Z");
  });

  it("resolves null (never throws) when both endpoints fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failRes));
    await expect(fetchPlanningAt(144.9674, -37.8001)).resolves.toBeNull();
  });

  it("resolves null when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    await expect(fetchPlanningAt(144.9674, -37.8001)).resolves.toBeNull();
  });

  it("sends WFS 2.0 lat,lng axis order in the INTERSECTS point", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(decodeURIComponent(String(input)));
        return okJson(String(input).includes("plan_zone") ? WFS_ZONE : WFS_OVERLAY);
      })
    );
    await fetchPlanningAt(144.9674, -37.8001);
    expect(seen[0]).toContain("POINT(-37.8001 144.9674)");
  });
});
