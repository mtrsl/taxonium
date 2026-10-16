import { it, expect, vi } from "vitest";
import getSVGfunction from "./deckglToSvg";
import { createMetadataColor } from "./metadata";

it("exports tree and categorical/numeric matrix cells using their shared colour accessors", async () => {
  const categorical = createMetadataColor({ field: "meta_id", kind: "categorical", seed: 3 });
  const numeric = createMetadataColor({ field: "meta_score", kind: "numeric", min: -5, max: 10 });
  let blob: Blob | undefined;
  vi.stubGlobal("URL", { createObjectURL: (value: Blob) => { blob = value; return "blob:test"; }, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const cells = [{ value: "001", color: categorical("001") }, { value: 5, color: numeric(5) }];
  getSVGfunction([
    { id: "main-scatter", layerType: "ScatterplotLayer", data: cells, getPosition: () => [0,0], getFillColor: (d: typeof cells[number]) => d.color, getRadius: 2 },
    { id: "metadata-matrix-boxes", layerType: "PolygonLayer", data: cells,
      getPolygon: () => [[12,0],[24,0],[24,10],[12,10]], getFillColor: (d: typeof cells[number]) => [...d.color,255] },
  ], { zoom: [0,0], target: [0,0] }, { treeWidth: 100, matrixWidth: 50 }).triggerSVGdownload({width:150,height:100});
  const svg = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob!); });
  for (const cell of cells) {
    expect(svg).toContain(`fill="rgb(${cell.color.join(",")})"`);
    expect(svg).toContain(`fill="rgba(${cell.color.join(",")},1)"`);
  }
  expect(svg).toContain('points="112,50 124,50 124,60 112,60"');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
