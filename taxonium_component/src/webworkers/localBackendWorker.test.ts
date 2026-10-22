import { describe, it, expect, vi } from "vitest";
import { createMetadataColor, resolveMetadataSpec } from "../utils/metadata";

vi.mock("taxonium_data_handling/importing.js", () => ({
  processJsonl: async (data: { fixture: unknown }) => data.fixture,
  generateConfig: () => {},
}));

describe("uploaded metadata worker", () => {
  it("pages real worker requests, echoes request IDs and rebuilds the lazy index on replacement", async () => {
    vi.resetModules();
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    try {
      await import("./localBackendWorker.js");
      const send = async (data: unknown) => { await (globalThis.onmessage as any)({ data }); return sent.at(-1); };
      const nodes = [
        { node_id: 0, parent_id: 0, is_tip: false, mutations: [], y: 0 },
        ...Array.from({ length: 2001 }, (_, i) => ({
          node_id: i + 1, parent_id: 0, is_tip: true, mutations: [], y: i,
          name: `sample-${i}`, meta_group: `G${i % 3}`,
        })),
      ];
      const upload = (nodes: unknown[]) => send({ type: "upload", data: { filename: "fixture.jsonl",
        fixture: { nodes, mutations: [], node_to_mut: {}, overwrite_config: {} } } });
      await upload(nodes);
      expect(sent.some(message => message.type === "metadata_table")).toBe(false);
      const request = { selectedNodeId: null, pageIndex: 1, fields: ["meta_group"], nameField: "name" };
      const page = await send({ type: "metadata_table", key: "page-1", request });
      expect(page.key).toBe("page-1");
      expect(page.data.total).toBe(2001);
      expect(page.data.rows).toEqual([{ nodeId: 2001, name: "sample-2000", values: ["G2"] }]);
      const tip = await send({ type: "metadata_table", key: "tip", request: { ...request, selectedNodeId: 3 } });
      expect(tip.data.total).toBe(1);
      expect(tip.data.pageIndex).toBe(0);
      expect(tip.data.rows[0].nodeId).toBe(3);
      const detail = await send({ type: "details", key: "details-3", node_id: 3 });
      expect(detail.key).toBe("details-3");
      expect(detail.data.node_id).toBe(3);
      const invalid = await send({ type: "metadata_table", key: "bad", request: { ...request, fields: Array(33).fill("meta_group") } });
      expect(invalid.data.error).toMatch("maximum 32");
      await upload(nodes.slice(0, 2));
      const replaced = await send({ type: "metadata_table", key: "new-dataset", request });
      expect(replaced.data.total).toBe(1);
      expect(replaced.data.rows[0].name).toBe("sample-0");
      let finishOldUpload!: (value: unknown) => void;
      const oldUpload = send({ type: "upload", data: { filename: "old.jsonl",
        fixture: new Promise(resolve => { finishOldUpload = resolve; }) } });
      await upload(nodes.slice(0, 3));
      finishOldUpload({ nodes, mutations: [], node_to_mut: {}, overwrite_config: {} });
      await oldUpload;
      const raced = await send({ type: "metadata_table", key: "after-race", request });
      expect(raced.data.total).toBe(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it("coalesces density requests and rejects cancelled work without blocking the newest request", async () => {
    vi.resetModules();
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    let time = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => time += 10);
    try {
      await import("./localBackendWorker.js");
      const send = (data: unknown) => (globalThis.onmessage as any)({ data });
      await send({ type: "upload", data: { filename: "fixture.jsonl", fixture: {
        nodes: Array.from({ length: 100 }, (_, i) => ({ y: i / 100, is_tip: true, meta_group: i % 2 ? "B" : "A" })),
        mutations: [], overwrite_config: {},
      } } });
      const request = { type: "metadata_density", minY: 0, maxY: 1, height: 2, outputHeight: 2, width: 36, columnWidth: 24,
        fields: [{ field: "meta_group", kind: "categorical", color: [1, 2, 3] }] };
      const first = send({ ...request, key: "first" });
      await new Promise(resolve => setTimeout(resolve, 0));
      await send({ ...request, key: "middle" });
      await send({ ...request, key: "last" });
      await first;
      const responses = sent.filter(message => message.type === "metadata_density");
      expect(responses.find(message => message.data.key === "first").data.result.cancelled).toBe(true);
      expect(responses.find(message => message.data.key === "middle").data.result.cancelled).toBe(true);
      expect(responses.find(message => message.data.key === "last").data.result.fields.meta_group.categoryValues).toEqual(["A", "A"]);
      const cancelled = send({ ...request, key: "cancel" });
      await new Promise(resolve => setTimeout(resolve, 0));
      await send({ type: "cancel_metadata_density", key: "cancel" });
      await cancelled;
      expect(sent.at(-1).data.result.cancelled).toBe(true);
    } finally { clock.mockRestore(); vi.unstubAllGlobals(); }
  });
  it("coalesces geographic requests, cancels old work and resets indexes on upload", async () => {
    vi.resetModules();
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    let time = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => time += 10);
    try {
      await import("./localBackendWorker.js");
      const send = (data: unknown) => (globalThis.onmessage as any)({ data });
      const nodes = [{ node_id: 0, parent_id: 0, is_tip: false, y: 0 },
        ...Array.from({ length: 100 }, (_, i) => ({ node_id: i + 1, parent_id: 0, y: i, is_tip: true,
          meta_Lat: 10, meta_Long: 20, meta_group: i % 2 ? "B" : "A" }))];
      const upload = (nodes: unknown[]) => send({ type: "upload", data: { filename: "fixture.jsonl", fixture: {
        nodes, mutations: [], overwrite_config: {},
      } } });
      await upload(nodes);
      const request = { selectedNodeId: null, bounds: [-180, -90, 180, 90], zoom: 0, width: 800, height: 400,
        colorSpec: { field: "meta_group", kind: "categorical" } };
      const first = send({ type: "geography", key: "first", request });
      await new Promise(resolve => setTimeout(resolve, 0));
      await send({ type: "geography", key: "middle", request });
      await send({ type: "geography", key: "last", request });
      await first;
      const responses = sent.filter(message => message.type === "geography");
      expect(responses.find(message => message.key === "first").data.cancelled).toBe(true);
      expect(responses.find(message => message.key === "middle").data.cancelled).toBe(true);
      expect(responses.find(message => message.key === "last").data.points[0].label).toContain("Mode: A");
      const cancelled = send({ type: "geography", key: "cancel", request });
      await send({ type: "cancel_geography", key: "cancel" }); await cancelled;
      expect(sent.at(-1).data.cancelled).toBe(true);
      const stale = send({ type: "geography", key: "stale", request });
      await upload(nodes.slice(0, 3)); await stale;
      expect(sent.filter(message => message.key === "stale").at(-1).data.cancelled).toBe(true);
      await send({ type: "geography", key: "replacement", request });
      expect(sent.at(-1).data.mappedCount).toBe(2);
    } finally { clock.mockRestore(); vi.unstubAllGlobals(); }
  });

  it("attaches DOT coordinates to JSONL, reports diagnostics and keeps metadata queries usable on parse errors", async () => {
    vi.resetModules();
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    try {
      await import("./localBackendWorker.js");
      const send = async (data: unknown) => { await (globalThis.onmessage as any)({ data }); return sent.at(-1); };
      const nodes = [
        { node_id: 0, parent_id: 0, is_tip: false, mutations: [] },
        { node_id: 1, parent_id: 0, is_tip: true, mutations: [], name: "A", meta_Lat: "10", meta_Long: "20" },
        { node_id: 2, parent_id: 0, is_tip: true, mutations: [], name: "A", meta_Lat: "11", meta_Long: "21" },
        { node_id: 3, parent_id: 0, is_tip: true, mutations: [], name: "a", meta_Lat: "-10", meta_Long: "-20" },
      ];
      const upload = (dot: string) => send({ type: "upload", data: {
        filename: "fixture.jsonl", filetype: "jsonl", fixture: { nodes, mutations: [], node_to_mut: {}, overwrite_config: {} },
        embedding: { filename: "fixture.dot", filetype: "dot", status: "loaded", data: dot },
      } });
      await upload('digraph G { A[x=1,y=2]; a[pos="3,-4!"]; unmatched[x=9,y=9]; }');
      const config = (await send({ type: "config" })).data;
      expect(config.embeddingDiagnostics).toMatchObject({ supplied: true, available: true, matchedSamples: 3,
        invalidCoordinateRecords: 0, unmatchedIdentifiers: 1 });
      const response = await send({ type: "embedding", key: "embedding-1", request: {
        selectedNodeId: null, bounds: [-1, -1, 1, 1], width: 400, height: 300,
      } });
      expect(response).toMatchObject({ key: "embedding-1", data: { selectedCount: 3, matchedCount: 3 } });
      expect(response.data.points.map((point: any) => point.count).sort()).toEqual([1, 2]);

      await upload("not a DOT graph");
      const malformedConfig = (await send({ type: "config" })).data;
      expect(malformedConfig.embeddingDiagnostics).toMatchObject({ supplied: true, available: false });
      expect(malformedConfig.embeddingDiagnostics.error).toMatch(/start with graph or digraph/);
      const table = await send({ type: "metadata_table", key: "still-usable", request: {
        selectedNodeId: null, pageIndex: 0, fields: ["meta_Lat"], nameField: "name",
      } });
      expect(table.data.total).toBe(3);
      expect(table.data.rows).toHaveLength(3);
    } finally { vi.unstubAllGlobals(); }
  });

  it("attaches the same DOT coordinates after Newick, Nexus and Nextstrain imports", async () => {
    vi.resetModules();
    const sent: any[] = [];
    vi.stubGlobal("postMessage", (message: unknown) => sent.push(message));
    vi.stubGlobal("onmessage", null);
    try {
      await import("./localBackendWorker.js");
      const send = async (data: unknown) => { await (globalThis.onmessage as any)({ data }); return sent.at(-1); };
      const inputs = [
        { filename: "tree.nwk", filetype: "nwk", data: "(A:1,B:1);" },
        { filename: "tree.nexus", filetype: "nexus", data: "#NEXUS\nBegin trees;\ntree tree1 = [&R] (A:1,B:1):0;\nEnd;" },
        { filename: "tree.json", filetype: "nextstrain", data: new TextEncoder().encode(JSON.stringify({ meta: {}, tree: {
          name: "root", node_attrs: {}, children: [
            { name: "A", node_attrs: {} }, { name: "B", node_attrs: {} },
          ],
        } })).buffer as ArrayBuffer },
      ];
      for (const input of inputs) {
        await send({ type: "upload", data: { ...input, status: "loaded", embedding: {
          filename: "coordinates.dot", filetype: "dot", status: "loaded", data: `graph { A[x=1,y=2]; B[pos="-3,4!"]; }`,
        } } });
        const config = (await send({ type: "config" })).data;
        expect(config.embeddingDiagnostics).toMatchObject({ supplied: true, available: true, matchedSamples: 2 });
        const response = await send({ type: "embedding", key: input.filetype, request: {
          selectedNodeId: null, bounds: [-1, -1, 1, 1], width: 400, height: 300,
        } });
        expect(response).toMatchObject({ key: input.filetype, data: { selectedCount: 2, matchedCount: 2 } });
      }
    } finally { vi.unstubAllGlobals(); }
  });

  it("summarizes the complete dataset and renders numeric and categorical density with shared colours", async () => {
    vi.resetModules();
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
    expect(result.fields.meta_group.categoryValues).toEqual(["B"]);
    expect(result.fields.meta_score.valueCounts[0]).toBe(2);
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
