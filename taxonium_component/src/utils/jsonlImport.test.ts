// @vitest-environment node
import { describe, expect, it } from "vitest";
import { processJsonl } from "taxonium_data_handling/importing.js";
import { ReadableWebToNodeStream } from "readable-web-to-node-stream";
import { parser } from "stream-json";
import { streamValues } from "stream-json/streamers/StreamValues";
import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";

const nodes = [
  { node_id: 0, parent_id: 0, name: "root", is_tip: false, x_dist: 0, y: 1, num_tips: 2, mutations: [] },
  { node_id: 1, parent_id: 0, name: "A", is_tip: true, x_dist: 1, y: 0, num_tips: 1, mutations: [] },
  { node_id: 2, parent_id: 0, name: "B", is_tip: true, x_dist: 1, y: 2, num_tips: 1, mutations: [] },
];
const valid = [{ mutations: [], total_nodes: 3 }, ...nodes].map(node => JSON.stringify(node)).join("\n") + "\n";
const parse = (text: string, gzip = false) => {
  const bytes = gzip ? gzipSync(text) : Buffer.from(text);
  return processJsonl({ filename: gzip ? "test.jsonl.gz" : "test.jsonl", status: "loaded", data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, () => {}, ReadableWebToNodeStream, parser, streamValues, Buffer);
};
describe("JSONL import completion", () => {
  it("waits for all nodes in plain and gzip streams", async () => {
    for (const gzip of [false, true]) {
      const result = await parse(valid, gzip);
      if (!result) throw new Error("Import returned no dataset");
      expect(result.nodes.map((node: { name: string }) => node.name)).toEqual(["root", "A", "B"]);
      expect(result.overwrite_config.num_tips).toBe(2);
    }
  });
  it("rejects malformed headers, node records and empty datasets", async () => {
    for (const text of ["{broken\n{}\n", '{"mutations":[]}\n{broken\n', '{"mutations":[]}\n', ""]) {
      await expect(parse(text)).rejects.toThrow();
    }
  });
});
