import { describe, expect, it } from "vitest";
import type { Node } from "../types/node";
import { buildMetadataTableIndex, metadataTableText, queryMetadataTablePage, tableWindow } from "./metadataTable";

describe("worker metadata pages", () => {
  const nodes: Node[] = [
    { node_id: 0, parent_id: 0, is_tip: false, mutations: [] },
    { node_id: 1, parent_id: 0, is_tip: false, mutations: [] },
    ...Array.from({ length: 4501 }, (_, i) => ({
      node_id: i + 2, parent_id: i < 2101 ? 1 : 0, is_tip: true, mutations: [],
      name: `sample-${i}`, meta_id: String(i).padStart(5, "0"), meta_flag: false, meta_score: 0,
    })),
  ];
  const index = buildMetadataTableIndex(nodes);
  const fields = new Set(["meta_id", "meta_flag", "meta_score"]);
  const query = (selectedNodeId: number | string | null, pageIndex = 0, requested = ["meta_id"]) =>
    queryMetadataTablePage(nodes, index, fields, { selectedNodeId, pageIndex, fields: requested, nameField: "name" });

  it("returns complete disjoint fixed pages and exact clade/tip counts", () => {
    const pages = [0, 1, 2].map(page => query(null, page));
    expect(pages.map(page => page.rows.length)).toEqual([2000, 2000, 501]);
    expect(new Set(pages.flatMap(page => page.rows.map(row => row.nodeId))).size).toBe(4501);
    expect(pages.every(page => page.total === 4501)).toBe(true);
    expect(query(0)).toEqual(pages[0]);
    expect(query(1, 1).rows.length).toBe(101);
    expect(query(1).total).toBe(2101);
    expect(query("2").rows).toEqual([{ nodeId: 2, name: "sample-0", values: ["00000"] }]);
    expect(query(null, 999)).toEqual(pages[2]);
    expect(query(null, 0, ["meta_flag", "meta_score"]).rows[0].values).toEqual([false, 0]);
    expect(index.positions).toBeUndefined();
  });

  it("handles sparse IDs, missing metadata, empty/unary clades and iterative deep traversal", () => {
    const sparse = [
      { node_id: 90, parent_id: 90, is_tip: false, num_tips: 1, mutations: [] },
      { node_id: 30, parent_id: 90, num_tips: 1, mutations: [] },
      { node_id: 50, parent_id: 90, is_tip: false, mutations: [] },
    ];
    const querySparse = (selectedNodeId: number) => queryMetadataTablePage(sparse, buildMetadataTableIndex(sparse), fields,
      { selectedNodeId, pageIndex: 0, fields: ["meta_id"], nameField: "name" });
    expect(querySparse(90).rows).toEqual([{ nodeId: 30, name: null, values: [null] }]);
    expect(querySparse(50).total).toBe(0);
    const chain = Array.from({ length: 5000 }, (_, i) => ({
      node_id: i, parent_id: Math.max(0, i - 1), is_tip: i === 4999, mutations: [],
    }));
    expect(Array.from(buildMetadataTableIndex(chain).tips)).toEqual([4999]);
    expect(buildMetadataTableIndex([]).tips.length).toBe(0);
    expect(() => buildMetadataTableIndex([{ node_id: 1, parent_id: 2, mutations: [] }])).toThrow("invalid parent");
    expect(() => buildMetadataTableIndex([
      { node_id: 0, parent_id: 1, mutations: [] }, { node_id: 1, parent_id: 0, mutations: [] },
    ])).toThrow("cycle");
  });

  it("bounds field projection for wide datasets and rejects invalid requests", () => {
    const wideFields = Array.from({ length: 1000 }, (_, i) => `meta_${i}`);
    const wide = [{ node_id: 0, is_tip: true, name: "wide", mutations: [],
      ...Object.fromEntries(wideFields.map((field, i) => [field, `raw-${i}`])) }];
    const page = queryMetadataTablePage(wide, buildMetadataTableIndex(wide), new Set(wideFields),
      { selectedNodeId: null, pageIndex: 0, fields: wideFields.slice(400, 432), nameField: "name" });
    expect(page.rows[0].values).toEqual(Array.from({ length: 32 }, (_, i) => `raw-${400 + i}`));
    expect(Object.keys(page.rows[0])).toEqual(["nodeId", "name", "values"]);
    expect(() => query(null, -1)).toThrow("Invalid table page");
    expect(() => query(99999)).toThrow("not in this dataset");
    expect(() => query(null, 0, ["unknown"])).toThrow("Invalid metadata columns");
    expect(() => query(null, 0, Array(33).fill("meta_id"))).toThrow("maximum 32");
  });

  it("bounds virtual windows and preserves raw text", () => {
    expect(tableWindow(30000, 180, 30, 2000, 4)).toEqual({ start: 996, end: 1010 });
    expect(tableWindow(90000, 500, 180, 1000, 2, 32)).toEqual({ start: 498, end: 505 });
    expect(tableWindow(0, 100000, 180, 1000, 2, 32)).toEqual({ start: 0, end: 32 });
    expect(tableWindow(0, 180, 30, 0)).toEqual({ start: 0, end: 0 });
    expect([null, "", false, 0, "001", "NA"].map(metadataTableText)).toEqual(["—", "—", "false", "0", "001", "NA"]);
  });
});
