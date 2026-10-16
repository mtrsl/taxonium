import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import useMetadata from "./useMetadata";
import useMetadataMatrix from "./useMetadataMatrix";
import useColor from "./useColor";
import MetadataTypeControl from "../components/MetadataTypeControl";
import type { Config, DynamicData } from "../types/backend";
import type { Query } from "../types/query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const config: Config = { num_nodes: 3, rootId: 0, rootMutations: [],
  colorBy: { colorByOptions: ["meta_id"] },
  metadataSummaries: { meta_id: { kind: "categorical", min: -5, max: 9 } },
  colorMapping: { "001": [1, 2, 3] } };
const data = { status: "loaded", data: { nodes: [], nodeLookup: {} } } as DynamicData;

describe("shared metadata controls", () => {
  it("updates tree and matrix together, persists type and shuffle state, and restores Auto", async () => {
    let state: ReturnType<typeof useMetadata>;
    let matrix: ReturnType<typeof useMetadataMatrix>;
    let tree: ReturnType<typeof useColor>;
    let query: Query = {};
    const rootElement = document.createElement("div");
    const root = createRoot(rootElement);
    function Harness() {
      const [q, setQ] = useState<Query>({ metadataMatrix: '{"fields":["meta_id"]}' });
      query = q;
      state = useMetadata(config, q, change => setQ(old => ({ ...old, ...change })), true);
      const serverState = useMetadata(config, q, vi.fn(), false);
      expect(serverState.specs).toEqual({});
      expect(serverState.colors).toEqual({});
      matrix = useMetadataMatrix({ config, data, query: q, updateQuery: vi.fn(), metadata: state });
      tree = useColor(config, {}, "meta_id", state.colors.meta_id);
      return <MetadataTypeControl field="meta_id" metadata={state} />;
    }
    await act(async () => root.render(<Harness />));
    const cellColor = (value: unknown) => matrix!.getValueColor(matrix!.matrixFields[0], value);
    expect(tree!.toRGB("001")).toEqual([1, 2, 3]);
    expect(cellColor("001")).toEqual(tree!.toRGB("001"));
    await act(async () => {
      const select = rootElement.querySelector("select")!;
      select.value = "numeric"; select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(JSON.parse(query.metadata!).meta_id.type).toBe("numeric");
    expect(cellColor("001")).toEqual(tree!.toRGB(1));
    expect(rootElement.querySelector("button")).toBeNull();
    await act(async () => state!.setType("meta_id", "categorical"));
    await act(async () => rootElement.querySelector("button")!.click());
    expect(JSON.parse(query.metadata!).meta_id.seed).toBeTypeOf("number");
    expect(cellColor("001")).not.toEqual([1, 2, 3]);
    expect(cellColor("001")).toEqual(tree!.toRGB("001"));
    await act(async () => state!.setColor("meta_id", "001", [9, 8, 7]));
    expect(cellColor("001")).toEqual([9, 8, 7]);
    await act(async () => state!.setType("meta_id", "auto"));
    expect(JSON.parse(query.metadata!).meta_id.type).toBeUndefined();
    expect(matrix!.fieldInfo.meta_id.kind).toBe("categorical");
    await act(async () => root.unmount());
  });
  it("isolates legacy colour caches by field and configured ramp", async () => {
    let first: ReturnType<typeof useColor>, second: ReturnType<typeof useColor>, genotype: ReturnType<typeof useColor>;
    const root = createRoot(document.createElement("div"));
    const ramps: Config = { ...config, colorRamps: {
      meta_a: { scale: [[0, "black"], [10, "red"]] },
      meta_b: { scale: [[0, "black"], [10, "blue"]] },
    } };
    function Harness() {
      genotype = useColor(config, {}, "genotype");
      first = useColor(ramps, {}, "meta_a");
      second = useColor(ramps, {}, "meta_b");
      return null;
    }
    await act(async () => root.render(<Harness />));
    expect(genotype!.toRGB("A")).toEqual([230, 25, 75]);
    expect(first!.toRGB("10")).toEqual([255, 0, 0]);
    expect(second!.toRGB("10")).toEqual([0, 0, 255]);
    await act(async () => root.unmount());
  });
});
