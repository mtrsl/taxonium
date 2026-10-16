import { describe, it, expect, vi } from "vitest";
import { createMetadataColor, resolveMetadataSpec } from "../utils/metadata";

vi.mock("taxonium_data_handling/importing.js", () => ({
  processJsonl: async (data: { fixture: unknown }) => data.fixture,
  generateConfig: () => {},
}));

describe("uploaded metadata worker", () => {
  it("summarizes the complete dataset and renders numeric and categorical density with shared colours", async () => {
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    await import("./localBackendWorker.js");
    const send = async (data: unknown) => { await (globalThis.onmessage as any)({ data }); return sent.at(-1); };
    await send({ type: "upload", data: { filename: "fixture.jsonl", fixture: {
      nodes: [
        { y: 0.1, is_tip: true, meta_id: "001", meta_group: "B", meta_score: -10 },
        { y: 0.3, is_tip: true, meta_id: "002", meta_group: "A", meta_score: null },
        { y: 0.5, is_tip: true, meta_id: "003", meta_group: "B", meta_score: 20 },
        { y: 0.7, is_tip: true, meta_id: "004", meta_group: "NA", meta_score: "bad" },
      ], mutations: [], overwrite_config: {},
    } } });
    const config = (await send({ type: "config" })).data;
    expect(config.metadataSummaries.meta_id).toEqual({ kind: "categorical", min: 1, max: 4 });
    const categorySpec = resolveMetadataSpec("meta_group", config.metadataSummaries.meta_group, undefined, { seed: 3 });
    const numericSpec = resolveMetadataSpec("meta_score", config.metadataSummaries.meta_score, undefined, { type: "numeric" });
    const args = { type: "metadata_density", key: "first", minY: 0, maxY: 1, height: 1, outputHeight: 1, width: 72, columnWidth: 24,
      fields: [categorySpec, numericSpec].map(spec => ({ field: spec.field, kind: spec.kind, color: [0,0,0], colorSpec: spec })) };
    const result = (await send(args)).data.result;
    const pixel = (x: number) => Array.from(result.bitmap.rgba.slice(x * 4, x * 4 + 4));
    expect(pixel(14)).toEqual([...createMetadataColor(categorySpec)("B"), 255]);
    expect(pixel(38)).toEqual([...createMetadataColor(numericSpec)(5), 255]);
    const changed = { ...categorySpec, seed: 999 };
    const next = (await send({ ...args, key: "next", fields: [{ ...args.fields[0], colorSpec: changed }] })).data.result;
    expect(Array.from(next.bitmap.rgba.slice(56,60))).toEqual([...createMetadataColor(changed)("B"), 255]);
    // A row of invalid numbers must use the same missing colour as a single cell.
    const missing = (await send({ ...args, minY: 0.6, maxY: 0.8 })).data.result;
    expect(Array.from(missing.bitmap.rgba.slice(152,156))).toEqual([...createMetadataColor(numericSpec)(null), 255]);
    vi.unstubAllGlobals();
  });
});
