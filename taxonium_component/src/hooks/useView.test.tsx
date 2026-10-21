import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import useView from "./useView";
import type { Settings } from "../types/settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps panned centres on axis zooms, scalar zoom and matrix resize", async () => {
  let view: ReturnType<typeof useView>;
  const root = createRoot(document.createElement("div"));
  function Harness({ width }: { width: number }) {
    view = useView({ settings: { treenomeEnabled: false } as Settings,
      deckSize: { width: 1200, height: 800 }, mouseDownIsMinimap: false, metadataMatrixWidth: width });
    return null;
  }
  try {
    await act(async () => root.render(<Harness width={120} />));
    await act(async () => view!.setViewState(v => ({ ...v, target: [731, 864], zoom: [1, 2] })));
    await act(async () => view!.zoomIncrement(0.6, "Y"));
    expect(view!.viewState.target).toEqual([731, 864]);
    expect(view!.viewState.zoom).toEqual([1, 2.6]);
    await act(async () => view!.zoomIncrement(-0.6, "X"));
    expect(view!.viewState.target).toEqual([731, 864]);
    expect(view!.viewState.zoom).toEqual([0.4, 2.6]);
    await act(async () => root.render(<Harness width={240} />));
    expect(view!.viewState.target).toEqual([731, 864]);
    expect(view!.viewState["metadata-matrix"]?.target).toEqual([120, 864]);
    await act(async () => view!.setViewState(v => ({ ...v, zoom: 2 })));
    await act(async () => view!.zoomIncrement(1, "both"));
    expect(view!.viewState.zoom).toEqual([3, 3]);
    expect(view!.viewState.target).toEqual([731, 864]);
  } finally { await act(async () => root.unmount()); }
});
