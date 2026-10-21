import { expect, it } from "vitest";
import { processNewickAndMetadata, processNewick } from "./processNewick";

it("preserves uploaded columns, embedded metadata, duplicate identifiers and blank defaults", async () => {
  const fields = Array.from({ length: 24 }, (_, i) => `f${i}`);
  const tree = await processNewickAndMetadata({ filename: "small.nwk", filetype: "nwk", status: "loaded",
    data: "(a[&existing=kept]:1,a:2,b:3);", metadata: {
      filename: "small.csv", filetype: "meta_csv", status: "loaded",
      data: `id,${fields.join(",")}\na,${fields.map((_, i) => String(i)).join(",")}\na,${fields.map((_, i) => String(i + 1)).join(",")}`,
    } }, () => {});
  const nodes = tree.nodes as unknown as Record<string, unknown>[];
  for (const node of nodes) {
    expect(node.meta_f0).toBe(node.name === "a" ? "1" : "");
    expect(node.meta_f23).toBe(node.name === "a" ? "24" : "");
  }
  const plain = await processNewick({ filename: "plain.nwk", filetype: "nwk", status: "loaded", data: "(a[&existing=kept]:1,a:2,b:3);" }, () => {});
  expect(nodes.find(node => node.meta_existing)?.meta_existing).toBe(plain.nodes.find(node => node.meta_existing)?.meta_existing);
  expect(nodes.filter(node => node.name === "a")).toHaveLength(2);
});
