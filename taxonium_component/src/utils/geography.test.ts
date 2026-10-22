import { describe, expect, it } from "vitest";
import type { Node } from "../types/node";
import type { GeographicRequest } from "../types/geography";
import { buildGeographicIndex, coordinateFields, queryGeography, MAX_GEOGRAPHIC_POINTS } from "./geography";
import { buildMetadataTableIndex, queryMetadataTablePage } from "./metadataTable";
import { createMetadataColor } from "./metadata";

const checkpoint = async () => {};
const request: GeographicRequest = { selectedNodeId: null, bounds: [-180, -90, 180, 90], zoom: 0, width: 800, height: 400 };
const nodesFor = (values: Record<string, unknown>[]) => [
  { node_id: 0, parent_id: 0, is_tip: false, mutations: [] },
  ...values.map((value, i) => ({ node_id: i + 1, parent_id: 0, is_tip: true, mutations: [], name: `sample-${i}`, ...value })),
] as Node[];
async function setup(nodes: Node[]) {
  const tips = buildMetadataTableIndex(nodes);
  const index = await buildGeographicIndex(nodes, tips, Object.keys(nodes[1] ?? {}), checkpoint);
  return { index, tips, query: (args: Partial<GeographicRequest> = {}, check = checkpoint) => queryGeography(nodes, tips, index, { ...request, ...args }, check) };
}
describe("geographic worker queries", () => {
  it("detects imported aliases with deterministic full-name precedence", () => {
    expect(coordinateFields(["meta_Lat", "meta_Long"])).toEqual(["meta_Lat", "meta_Long"]);
    expect(coordinateFields(["lat", "lon", "Latitude", "longitude"])).toEqual(["Latitude", "longitude"]);
    expect(coordinateFields(["meta_Lat", "meta_country"])).toBeNull();
  });
  it("validates coordinates without changing metadata types, including zero and poles", async () => {
    const { query } = await setup(nodesFor([
      { meta_Lat: "0", meta_Long: "0" }, { meta_Lat: 90, meta_Long: 180 },
      { meta_Lat: -90, meta_Long: -180 }, { meta_Lat: "", meta_Long: 0 },
      { meta_Lat: "12bad", meta_Long: 0 }, { meta_Lat: 91, meta_Long: 0 },
      { meta_Lat: 0, meta_Long: -181 }, { meta_Lat: Infinity, meta_Long: 0 },
    ]));
    const page = await query();
    expect(page.selectedCount).toBe(8); expect(page.mappedCount).toBe(3);
    expect(page.points.reduce((sum, p) => sum + p.count, 0)).toBe(3);
    expect(page.points.every(p => Math.abs(p.latitude) <= 85.052)).toBe(true);
    const noGPS = await setup(nodesFor([{ meta_country: "UK" }]));
    expect(await noGPS.query()).toMatchObject({ available: false, mappedCount: 0, points: [] });
  });
  it("shares table selection and excludes invalid coordinates within a selected clade", async () => {
    const nodes = nodesFor([{ meta_Lat: 10, meta_Long: 20 }, { meta_Lat: null, meta_Long: 0 }, { meta_Lat: 20, meta_Long: 30 }]);
    nodes.push({ node_id: 4, parent_id: 0, is_tip: false, mutations: [] } as Node);
    nodes[1].parent_id = 4; nodes[2].parent_id = 4;
    const { query, tips } = await setup(nodes);
    const page = await query({ selectedNodeId: 4 });
    const table = queryMetadataTablePage(nodes, tips, new Set(), { selectedNodeId: 4, pageIndex: 0, fields: [], nameField: "name" });
    expect(page.selectedCount).toBe(table.total); expect(page.mappedCount).toBe(1);
    expect((await query({ selectedNodeId: 2 })).bounds).toBeNull();
    expect((await query({ selectedNodeId: 0 })).mappedCount).toBe(2);
    await expect(query({ selectedNodeId: 99 })).rejects.toThrow("Selected node");
  });
  it("matches density summaries and recolours cached geometry without changing membership", async () => {
    const { query, index } = await setup(nodesFor(["B", "A", "B", "NA"].map((meta_group, i) =>
      ({ meta_Lat: 10, meta_Long: 20, meta_group, meta_score: [-10, null, 20, "bad"][i], meta_flag: i === 0 }))));
    const colorSpec = { field: "meta_group", kind: "categorical" as const, seed: 3 };
    const first = await query({ colorSpec }); const geometry = index.geometry, summary = index.summary;
    expect(first.points).toHaveLength(1);
    expect(first.points[0].color).toEqual([...createMetadataColor(colorSpec)("B"), 255]);
    expect(first.points[0].label).toContain("Mode: B (aggregate)");
    const second = await query({ colorSpec: { ...colorSpec, colors: { B: [1, 2, 3] } } });
    expect(index.geometry).toBe(geometry); expect(index.summary).toBe(summary);
    expect(second.points[0].color).toEqual([1, 2, 3, 255]);
    const numeric = { field: "meta_score", kind: "numeric" as const, min: -10, max: 20 };
    const mean = await query({ colorSpec: numeric });
    expect(mean.points[0].color).toEqual([...createMetadataColor(numeric)(5), 255]);
    expect(mean.points[0].label).toContain("Mean: 5 (aggregate)");
    const bool = await query({ colorSpec: { field: "meta_flag", kind: "boolean" }, color: [10, 20, 30] });
    expect(bool.points[0].color).toEqual([10, 20, 30, 64]);
    expect(bool.points[0].label).toContain("True: 1 / 4 (25.0%, aggregate)");
    expect((await query({ selectedNodeId: 1, colorSpec })).points[0].label).toContain("group: B");
  });
  it("handles antimeridian viewports and world copies without double-counting", async () => {
    const { query } = await setup(nodesFor([179, -179, 0].map(lon => ({ meta_Lat: 0, meta_Long: lon }))));
    const page = await query({ bounds: [170, -10, -170, 10], zoom: 4 });
    expect(page.points.reduce((n, p) => n + p.count, 0)).toBe(2);
    expect((await query({ bounds: [-540, -90, 540, 90] })).points.reduce((n, p) => n + p.count, 0)).toBe(3);
    const crossing = await setup(nodesFor([179, -179].map(lon => ({ meta_Lat: 0, meta_Long: lon }))));
    const bounds = (await crossing.query()).bounds!;
    expect(bounds[2] - bounds[0]).toBeCloseTo(2);
  });
  it("bounds outputs for dispersed samples and can interrupt preprocessing", async () => {
    const nodes = nodesFor(Array.from({ length: 20000 }, (_, i) => ({ meta_Lat: (i % 160) - 80, meta_Long: ((i * 137) % 360) - 180 })));
    const { query, tips } = await setup(nodes);
    const result = await query({ zoom: 20, width: 10000, height: 10000 });
    expect(result.points.length).toBeLessThanOrEqual(MAX_GEOGRAPHIC_POINTS);
    expect(result.points.reduce((n, p) => n + p.count, 0)).toBe(20000);
    let checkpoints = 0;
    await expect(buildGeographicIndex(nodes, tips, ["meta_Lat", "meta_Long"], async () => {
      if (++checkpoints > 1) throw new Error("cancelled");
    })).rejects.toThrow("cancelled");
  });
});
