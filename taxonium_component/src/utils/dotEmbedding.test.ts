import { describe, expect, it } from "vitest";
import { parseDotCoordinates } from "./dotEmbedding";
import { buildEmbeddingIndex, queryEmbedding } from "./embedding";
import { buildMetadataTableIndex } from "./metadataTable";
import type { Node } from "../types/node";

const checkpoint = async () => {};

describe("DOT embedding coordinate parser", () => {
  it("reads coordinate attributes, pos, repeated lists, comments and subgraphs", async () => {
    const source = String.raw`digraph G { // line comment
      "FP0001"[x=1]; /* repeated declarations merge */ "FP0001"[y=2,color=red];
      "FP0002" [pos="3.5,-2!"][color=blue];
      subgraph cluster_a { "A\"B" [x=4,y=5]; }
      ignored -> edge [pos="999,999"];
    }`;
    const parsed = await parseDotCoordinates(source);
    expect(parsed.coordinates.get("FP0001")).toEqual({ x: 1, y: 2 });
    expect(parsed.coordinates.get("FP0002")).toEqual({ x: 3.5, y: -2 });
    expect(parsed.coordinates.get('A"B')).toEqual({ x: 4, y: 5 });
    expect(parsed.coordinates.has("edge")).toBe(false);
    expect(parsed.invalidCoordinateRecords).toBe(0);
  });

  it("prefers a complete explicit pair, falls back to pos, and counts unusable coordinate records", async () => {
    const parsed = await parseDotCoordinates(`graph { explicit[x=1,y=2,pos="7,8"]; fallback[x=oops,y=1,pos="9,-3!"]; partial[x=1]; bad[pos="NaN,2"]; }`);
    expect(parsed.coordinates.get("explicit")).toEqual({ x: 1, y: 2 });
    expect(parsed.coordinates.get("fallback")).toEqual({ x: 9, y: -3 });
    expect(parsed.invalidCoordinateRecords).toBe(2);
  });

  it("rejects malformed graph syntax and unterminated quoted identifiers", async () => {
    await expect(parseDotCoordinates("graph G { a[x=1,y=2]")).rejects.toThrow(/Unterminated DOT/);
    await expect(parseDotCoordinates('graph G { "unterminated[x=1,y=2]; }')).rejects.toThrow(/Unterminated quoted/);
  });

  it("yields cooperatively while scanning a large one-line graph", async () => {
    let checkpoints = 0;
    const source = `graph G {${"sample[x=1,y=2];".repeat(10000)}}`;
    await expect(parseDotCoordinates(source, async () => {
      checkpoints++;
      throw new Error("cancelled");
    })).rejects.toThrow("cancelled");
    expect(checkpoints).toBeGreaterThan(0);
  });

  it("matches sample names exactly, assigns duplicate tips, and bounds coincident markers", async () => {
    const nodes = [
      { node_id: 0, parent_id: 0, name: "root", is_tip: false, num_tips: 3 },
      { node_id: 1, parent_id: 0, name: "A", is_tip: true, num_tips: 1 },
      { node_id: 2, parent_id: 0, name: "A", is_tip: true, num_tips: 1 },
      { node_id: 3, parent_id: 0, name: "a", is_tip: true, num_tips: 1 },
    ].map(node => ({ ...node, mutations: [] })) as Node[];
    const tips = buildMetadataTableIndex(nodes);
    const dot = `graph { A[x=1,y=2]; a[pos="1,2"]; unmatched[x=3,y=4]; }`;
    const index = await buildEmbeddingIndex(nodes, tips, dot, "name", checkpoint);
    expect(index.diagnostics).toMatchObject({ matchedSamples: 3, invalidCoordinateRecords: 0, unmatchedIdentifiers: 1, available: true });
    const page = await queryEmbedding(nodes, tips, index, {
      selectedNodeId: null, bounds: [-1, -1, 1, 1], width: 400, height: 300,
    }, checkpoint);
    expect(page.selectedCount).toBe(3);
    expect(page.matchedCount).toBe(3);
    expect(page.points).toHaveLength(1);
    expect(page.points[0]).toMatchObject({ count: 3, x: 0.5, y: 1 });
  });

  it("preserves leading zeros in decoded identifiers", async () => {
    const nodes = [
      { node_id: 0, parent_id: 0, name: "root", is_tip: false },
      { node_id: 1, parent_id: 0, name: "0007", is_tip: true, num_tips: 1 },
      { node_id: 2, parent_id: 0, name: "7", is_tip: true, num_tips: 1 },
    ].map(node => ({ ...node, mutations: [] })) as Node[];
    const tips = buildMetadataTableIndex(nodes);
    const index = await buildEmbeddingIndex(nodes, tips, `graph { "0007"[x=1,y=2]; "7"[x=2,y=3]; }`, "name", checkpoint);
    expect(index.diagnostics.matchedSamples).toBe(2);
    expect(index.x[0]).not.toBe(index.x[1]);
  });

  it("keeps a degenerate viewport valid and preserves Cartesian y values", async () => {
    const nodes = [
      { node_id: 0, parent_id: 0, name: "root", is_tip: false, num_tips: 2 },
      { node_id: 1, parent_id: 0, name: "N", is_tip: true, num_tips: 1 },
      { node_id: 2, parent_id: 0, name: "S", is_tip: true, num_tips: 1 },
    ].map(node => ({ ...node, mutations: [] })) as Node[];
    const tips = buildMetadataTableIndex(nodes);
    const index = await buildEmbeddingIndex(nodes, tips, `graph { N[pos="0,4"]; S[pos="0,-4"]; }`, "name", checkpoint);
    const request = { selectedNodeId: null, bounds: [0, 0, 0, 0] as [number, number, number, number], width: 1, height: 1 };
    const page = await queryEmbedding(nodes, tips, index, request, checkpoint);
    expect(page.matchedCount).toBe(2);
    expect(page.bounds).toEqual([0, -1, 0, 1]);
    expect(page.points).toHaveLength(0); // Both points fall outside the point-sized viewport.
  });
});
