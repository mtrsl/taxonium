// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { processNewickAndMetadata } from "./processNewick";
import { buildMetadataTableIndex } from "./metadataTable";
import { discoverTimeline, queryTimeline, MAX_TIMELINE_BARS } from "./timeline";

// Supply a temporary dated copy, never modify the source CSV:
// RUN_TIMELINE_BENCHMARK=1 TIMELINE_METADATA=/private/tmp/comp03-dated.csv.gz npm test -- --run src/utils/timeline.benchmark.test.ts
it.skipIf(!process.env.RUN_TIMELINE_BENCHMARK)("aggregates the large real tree with synthetic dates", async () => {
  const buffer = (path: string) => new Uint8Array(readFileSync(path)).buffer;
  const imported = await processNewickAndMetadata({ status: "loaded", filename: "large.nwk.gz", filetype: "nwk", useDistances: true,
    data: buffer(resolve(process.env.TIMELINE_TREE ?? "../ATB_tree_batch2_cleaned.nwk.gz")), metadata: {
      status: "loaded", filetype: "meta_csv", filename: "dates.csv.gz", data: buffer(process.env.TIMELINE_METADATA!),
    } }, () => {});
  const tips = buildMetadataTableIndex(imported.nodes);
  let lastYield = performance.now(), yields = 0;
  const checkpoint = async () => { if (performance.now() - lastYield > 8) {
    await new Promise(resolve => setTimeout(resolve, 0)); lastYield = performance.now(); yields++;
  } };
  const start = performance.now();
  const index = await discoverTimeline(imported.nodes, tips, ["meta_Collection_date"], checkpoint);
  const indexed = performance.now();
  const times: number[] = [];
  for (let repeat = 0; repeat < 7; repeat++) {
    const source = index.sources[0];
    const tick = performance.now();
    const page = await queryTimeline(imported.nodes, tips, index, { selectedNodeId: null,
      range: [source.min + repeat, source.max], colorSpec: { field: "meta_Phylum", kind: "categorical", seed: repeat } }, checkpoint);
    times.push(performance.now() - tick);
    expect(page.bars.length).toBeLessThanOrEqual(MAX_TIMELINE_BARS);
    expect(page.datedCount + page.ignoredCount).toBe(tips.tips.length);
    expect(page.bars.every(b => b.count === b.segments.reduce((n, s) => n + s.count, 0))).toBe(true);
  }
  console.log(JSON.stringify({ samples: tips.tips.length, indexMs: indexed - start, queryMs: times,
    retainedTimelineBytes: index.current!.values.byteLength + index.coloring!.codes.byteLength, yields }));
  expect(yields).toBeGreaterThan(0);
}, 180000);
