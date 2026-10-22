// @vitest-environment node
import { expect, it } from "vitest";
import type { Node } from "../types/node";
import { buildEmbeddingIndex, queryEmbedding } from "./embedding";
import { buildMetadataTableIndex } from "./metadataTable";
import { MAX_SPATIAL_MARKERS } from "./spatialAggregation";

const makeOneLineDot = (count: number, distribution: "coincident" | "dispersed") => {
  const chunks = ["graph G {"];
  let output = "";
  for (let i = 0; i < count; i++) {
    const x = distribution === "coincident" ? 0.25 : ((i * 137) % 20000) / 10000 - 1;
    const y = distribution === "coincident" ? -0.5 : ((i * 991) % 20000) / 10000 - 1;
    chunks.push(`S${i}[pos="${x},${y}"];`);
    if (chunks.length >= 16384) { output += chunks.join(""); chunks.length = 0; }
  }
  return output + chunks.join("") + "}";
};

it.skipIf(!process.env.RUN_EMBEDDING_BENCHMARK)("benchmarks one million dispersed and coincident embedding samples", async () => {
  const count = 1_000_000;
  const nodes = [{ node_id: 0, parent_id: 0, is_tip: false, mutations: [] }] as Node[];
  for (let i = 0; i < count; i++) nodes.push({ node_id: i + 1, parent_id: 0, is_tip: true,
    mutations: [], name: `S${i}`, meta_group: `G${i % 31}` });
  const tips = buildMetadataTableIndex(nodes);
  const spec = { field: "meta_group", kind: "categorical" as const, seed: 3 };
  for (const distribution of ["coincident", "dispersed"] as const) {
    const source = makeOneLineDot(count, distribution);
    let lastYield = performance.now(), yields = 0;
    const checkpoint = async () => {
      if (performance.now() - lastYield >= 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
        yields++;
      }
    };
    let cancelCheckpoints = 0;
    await expect(buildEmbeddingIndex(nodes, tips, source, "name", async () => {
      if (++cancelCheckpoints >= 2) throw new Error("cancelled");
    })).rejects.toThrow("cancelled");

    const start = performance.now();
    const index = await buildEmbeddingIndex(nodes, tips, source, "name", checkpoint);
    const indexed = performance.now();
    const request = { selectedNodeId: null, bounds: [-1, -1, 1, 1] as [number, number, number, number],
      width: 1600, height: 800, colorSpec: spec };
    const first = await queryEmbedding(nodes, tips, index, request, checkpoint);
    const queried = performance.now();
    const geometry = index.geometry, summary = index.summary;
    const recoloured = await queryEmbedding(nodes, tips, index, { ...request,
      colorSpec: { ...spec, seed: 10 } }, checkpoint);
    const recolourEnd = performance.now();
    expect(first.matchedCount).toBe(count);
    expect(first.points.reduce((sum, point) => sum + point.count, 0)).toBe(count);
    expect(first.points.length).toBeLessThanOrEqual(MAX_SPATIAL_MARKERS);
    expect(recoloured.points).toHaveLength(first.points.length);
    expect(index.geometry).toBe(geometry);
    expect(index.summary).toBe(summary);
    expect(yields).toBeGreaterThan(0);
    const responseBytes = new TextEncoder().encode(JSON.stringify(first)).byteLength;
    const typedArrayBytes = index.x.byteLength + index.y.byteLength + geometry!.next.byteLength +
      tips.tips.byteLength + tips.starts.byteLength + tips.ends.byteLength;
    console.log(JSON.stringify({ distribution, samples: count, parseAndIndexMs: indexed - start,
      queryMs: queried - indexed, recolourMs: recolourEnd - queried, markers: first.points.length,
      responseBytes, retainedTypedArrayMiB: typedArrayBytes / 1024 ** 2,
      processHeapMiB: process.memoryUsage().heapUsed / 1024 ** 2, yields, cancelCheckpoints }));
  }
}, 120000);
