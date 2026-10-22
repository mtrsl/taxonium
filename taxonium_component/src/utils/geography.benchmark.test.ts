// @vitest-environment node
import { expect, it } from "vitest";
import type { Node } from "../types/node";
import { buildMetadataTableIndex } from "./metadataTable";
import { buildGeographicIndex, queryGeography, MAX_GEOGRAPHIC_POINTS } from "./geography";

// Opt-in: RUN_GEOGRAPHY_BENCHMARK=1 npm run test -- --run src/utils/geography.benchmark.test.ts
it.skipIf(!process.env.RUN_GEOGRAPHY_BENCHMARK)("benchmarks one million coincident and dispersed samples", async () => {
  for (const distribution of ["coincident", "dispersed"]) {
    const nodes = [{ node_id: 0, parent_id: 0, is_tip: false, mutations: [] }] as Node[];
    for (let i = 0; i < 1000000; i++) nodes.push({ node_id: i + 1, parent_id: 0, is_tip: true,
      meta_lat: distribution === "coincident" ? 10 : ((i * 137) % 16000) / 100 - 80,
      meta_lon: distribution === "coincident" ? 20 : ((i * 991) % 36000) / 100 - 180,
      meta_group: `G${i % 31}` } as unknown as Node);
    let lastYield = performance.now(), yields = 0;
    const checkpoint = async () => { if (performance.now() - lastYield > 8) {
      await new Promise(resolve => setTimeout(resolve, 0)); lastYield = performance.now(); yields++;
    } };
    const start = performance.now();
    const tips = buildMetadataTableIndex(nodes);
    const index = await buildGeographicIndex(nodes, tips, ["meta_lat", "meta_lon"], checkpoint);
    const indexed = performance.now();
    const request = { selectedNodeId: null, bounds: [-180, -90, 180, 90] as [number, number, number, number], zoom: 2,
      width: 1600, height: 800, colorSpec: { field: "meta_group", kind: "categorical" as const } };
    const first = await queryGeography(nodes, tips, index, request, checkpoint);
    const queried = performance.now();
    const recoloured = await queryGeography(nodes, tips, index, { ...request, colorSpec: { ...request.colorSpec, seed: 10 } }, checkpoint);
    const recolourEnd = performance.now();
    const panned = await queryGeography(nodes, tips, index, { ...request, bounds: [-100, -60, 100, 60], zoom: 3 }, checkpoint);
    const panEnd = performance.now();
    expect(first.points.reduce((n, p) => n + p.count, 0)).toBe(1000000);
    expect(Math.max(first.points.length, recoloured.points.length, panned.points.length)).toBeLessThanOrEqual(MAX_GEOGRAPHIC_POINTS);
    expect(yields).toBeGreaterThan(0);
    const bytes = index.x.byteLength + index.y.byteLength + index.geometry!.next.byteLength +
      tips.tips.byteLength + tips.starts.byteLength + tips.ends.byteLength +
      index.category!.index.codes.byteLength + index.category!.index.counts.byteLength + index.category!.index.touched.byteLength;
    console.log(JSON.stringify({ distribution, samples: 1000000, indexMs: indexed - start, firstQueryMs: queried - indexed,
      recolourMs: recolourEnd - queried, panMs: panEnd - recolourEnd, markers: first.points.length,
      retainedTypedArrayMiB: bytes / 1024 ** 2, processHeapMiB: process.memoryUsage().heapUsed / 1024 ** 2, yields }));
  }
}, 60000);
