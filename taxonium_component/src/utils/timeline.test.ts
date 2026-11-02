import { describe, expect, it } from "vitest";
import type { Node } from "../types/node";
import { buildMetadataTableIndex } from "./metadataTable";
import { calendarDate, discoverTimeline, queryTimeline, timeLabel, MAX_TIMELINE_BARS, MAX_TIMELINE_SEGMENTS } from "./timeline";
import { createMetadataColor } from "./metadata";
const checkpoint = async () => {};
const fixture = (records: Record<string, unknown>[]) => {
  const nodes = [{ node_id: 0, parent_id: 0, is_tip: false, mutations: [] }, ...records.map((r, i) => ({ node_id: i + 1, parent_id: 0, is_tip: true, mutations: [], ...r }))] as Node[];
  return { nodes, tips: buildMetadataTableIndex(nodes) };
};
async function load(records: Record<string, unknown>[]) {
  const { nodes, tips } = fixture(records);
  const fields = [...new Set(records.flatMap(Object.keys))];
  const index = await discoverTimeline(nodes, tips, fields, checkpoint);
  return { nodes, tips, index, query: (request = {}) => queryTimeline(nodes, tips, index, { selectedNodeId: null, ...request }, checkpoint) };
}
describe("timeline calendar and worker aggregation", () => {
  it("validates Gregorian dates and never rolls invalid dates forward", () => {
    expect(calendarDate(2000, 2, 29)?.precision).toBe("day");
    for (const values of [[1900, 2, 29], [2023, 2, 29], [2024, 4, 31], [0, 1, 1], [2020, 13, 1]]) expect(calendarDate(values[0], values[1], values[2])).toBeNull();
  });
  it("prioritizes components, detects ISO beyond invalid prefixes and uses global coarsest precision", async () => {
    const f = await load([
      { meta_Year: "2020", meta_Month: "02", meta_Day: "29", meta_other: "bad", meta_date: "2020-02-29" },
      { meta_Year: "2021", meta_Month: "", meta_Day: "", meta_other: "2021-03", meta_date: "2021-02" },
      { meta_Year: "2022", meta_Month: "02", meta_Day: "30", meta_other: "2022-01-01", meta_date: "2021-02-30" },
    ]);
    expect(f.index.sources.map(s => s.id)).toEqual(["meta_Year|meta_Month|meta_Day", "meta_date", "meta_other"]);
    const all = await f.query(); expect(all.source?.precision).toBe("year"); expect(all.datedCount).toBe(2); expect(all.ignoredCount).toBe(1);
    const one = await f.query({ selectedNodeId: 1 }); expect(one.source?.precision).toBe("year"); expect(one.bars[0].count).toBe(1);
    const iso = await f.query({ source: "meta_date" }); expect(iso.source?.precision).toBe("month"); expect(iso.datedCount).toBe(2);
  });
  it("preserves empty bins, exact counts, shared colours and an unrestricted overview", async () => {
    const f = await load([{ meta_year: "2001", meta_group: "A" }, { meta_year: "2003", meta_group: "B" }, { meta_year: "2003", meta_group: "B" }, { meta_year: "invalid" }]);
    const spec = { field: "meta_group", kind: "categorical" as const, seed: 4 };
    const all = await f.query({ colorSpec: spec }); expect(all.bars.map(b => b.count)).toEqual([1, 0, 2]);
    expect(all.bars[2].segments[0].color).toEqual(createMetadataColor(spec)("B"));
    const zoom = await f.query({ range: [2003, 2003] }); expect(zoom.bars.map(b => b.count)).toEqual([2]); expect(zoom.overview).toEqual(all.overview);
    expect(zoom.selectedCount).toBe(4); expect(zoom.ignoredCount).toBe(1);
    await expect(f.query({ range: [2004, 2003] })).rejects.toThrow("Invalid timeline range");
    await expect(f.query({ source: "missing" })).rejects.toThrow("Unknown timeline source");
  });
  it("bounds bars and high-cardinality segments and preserves totals", async () => {
    const f = await load(Array.from({ length: 2000 }, (_, i) => ({ meta_year: String(1 + i * 4), meta_id: `sample-${i}` })));
    const page = await f.query({ colorSpec: { field: "meta_id", kind: "categorical" } });
    expect(page.bars.length).toBeLessThanOrEqual(MAX_TIMELINE_BARS);
    expect(page.bars.reduce((n, b) => n + b.count, 0)).toBe(2000);
    expect(page.bars.every(b => b.segments.length <= MAX_TIMELINE_SEGMENTS && b.segments.reduce((n, s) => n + s.count, 0) === b.count)).toBe(true);
  });
  it("bins numeric values with the shared scale, includes missing and supports neutral bars", async () => {
    const f = await load([0, 4, 8, null].map(n => ({ meta_year: "2020", meta_n: n })));
    const spec = { field: "meta_n", kind: "numeric" as const, min: 0, max: 8 };
    const page = await f.query({ colorSpec: spec }); expect(page.bars[0].segments.map(s => s.count)).toEqual([1, 1, 1, 1]);
    expect(page.bars[0].segments.find(s => s.label.startsWith("0 –"))?.color).toEqual(createMetadataColor(spec)(0.25));
    expect((await f.query()).bars[0].segments[0].count).toBe(4);
  });
  it("handles no dates, early Gregorian years, and cooperative cancellation", async () => {
    const f = await load([{ meta_date: "1900-02-29" }]); expect((await f.query()).source).toBeUndefined();
    const early = await load([{ meta_date: "0001-01-01" }]); const page = await early.query(); expect(timeLabel(page.source!.min, "day")).toBe("0001-01-01");
    await expect(discoverTimeline(early.nodes, early.tips, ["meta_date"], async () => { throw new Error("cancelled"); })).rejects.toThrow("cancelled");
  });
});
