import axios from "axios";
import pako from "pako";
import { expect, it, vi } from "vitest";
import { fetch_or_extract, processNewickAndMetadata, processNewick, processMetadataFile } from "./processNewick";

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

it("loads gzip DOT coordinates from files and URLs with query strings", async () => {
  const source = `graph { "FP0001"[pos="1,2!"]; }`;
  const compressed = pako.gzip(source).slice().buffer as ArrayBuffer;
  const file = await fetch_or_extract({ filename: "coords.dot.gz", status: "loaded", data: compressed }, () => {}, "DOT embedding");
  expect(file).toBe(source);

  const url = "https://example.test/coords.dot.gz?download=1";
  const request = vi.spyOn(axios, "get").mockResolvedValue({ data: compressed } as never);
  try {
    const downloaded = await fetch_or_extract({ filename: url, status: "url_supplied" }, () => {}, "DOT embedding");
    expect(downloaded).toBe(source);
    expect(request).toHaveBeenCalledWith(url, expect.objectContaining({ responseType: "arraybuffer" }));
  } finally { request.mockRestore(); }
});


it("loads Nexus trees without a root label or branch length and rejects missing trees", async () => {
  const input = { filename: "tree.nex", filetype: "nexus" as const, status: "loaded" as const,
    data: "#NEXUS\nBegin trees;\nTree tree1 = (A:1,B:2);\nEnd;" };
  const tree = await processNewick(input, () => {});
  expect(tree.nodes.filter(node => node.is_tip).map(node => node.name).sort()).toEqual(["A", "B"]);
  await expect(processNewick({ ...input, data: "#NEXUS\nBegin trees;\nEnd;" }, () => {})).rejects.toThrow("No tree found");
});


it("rejects empty Newick and parser-reported syntax errors", async () => {
  for (const data of ["", "(A:1,B:2;", "A:1,B:2);", "(A[&broken:1,B:2);"]) {
    await expect(processNewick({ filename: "bad.nwk", filetype: "nwk", status: "loaded", data }, () => {})).rejects.toThrow("Unable to parse the tree");
  }
});
