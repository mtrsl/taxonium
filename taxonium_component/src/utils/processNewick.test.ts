import { expect, it } from "vitest";
import { processNewickAndMetadata, processNewick, processMetadataFile } from "./processNewick";

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

it("keeps GPS columns aligned after quoted CSV fields, escaped quotes and multiline values", async () => {
  const [rows, headers] = await processMetadataFile({ filename: "gps.csv", filetype: "meta_csv", status: "loaded",
    data: 'id,Site,Lat,Long\r\na,"Iquitos, Loreto Province",-3.763541,-73.267937\r\nb,"A ""quoted""\nsite",0,0\r\nc,plain,10,20',
  }, () => {});
  expect(headers).toEqual(["id", "Site", "Lat", "Long"]);
  expect(rows.get("a")).toEqual({ meta_Site: "Iquitos, Loreto Province", meta_Lat: "-3.763541", meta_Long: "-73.267937" });
  expect(rows.get("b")).toEqual({ meta_Site: 'A "quoted"\nsite', meta_Lat: "0", meta_Long: "0" });
  expect(rows.get("c")?.meta_Long).toBe("20");
});
