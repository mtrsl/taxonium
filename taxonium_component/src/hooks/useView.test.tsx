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

it("maps display gestures and axis buttons while preserving centre across rotation and Treenome", async () => {
  let view: ReturnType<typeof useView>;
  const root = createRoot(document.createElement("div"));
  function Harness({ rotated = false, treenome = false, height = 800 }) {
    view = useView({ settings: { treeLayout: rotated ? "rotated" : "standard", treenomeEnabled: treenome } as Settings,
      deckSize: { width: 1200, height }, mouseDownIsMinimap: false, metadataMatrixWidth: 200 });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => view!.setViewState(v => ({ ...v, target: [731, 864], zoom: [1, 2] })));
    await act(async () => root.render(<Harness rotated />));
    expect(view!.viewState.target).toEqual([731, 864]);
    expect(view!.displayViewState.target).toEqual([864, 731]);
    expect(view!.displayViewState.zoom).toEqual([2, 1]);
    expect(view!.displayViewState["metadata-matrix"]?.target).toEqual([864, 100]);
    await act(async () => view!.zoomIncrement(0.6, "X"));
    expect(view!.viewState.zoom).toEqual([1, 2.6]);
    await act(async () => view!.zoomIncrement(0.6, "Y"));
    expect(view!.viewState.zoom).toEqual([1.6, 2.6]);
    await act(async () => {
      const displayResult = view!.onViewStateChange({ viewId: "main", viewState: { target: [950, 800], zoom: [3, 2] }, interactionState: {} });
      expect(displayResult && displayResult.target).toEqual([950, 800]);
      expect(displayResult && displayResult.zoom).toEqual([3, 2]);
    });
    expect(view!.viewState.target).toEqual([800, 950]);
    expect(view!.viewState.zoom).toEqual([2, 3]);
    // Config/search navigation is already canonical and must not be swapped.
    await act(async () => view!.onViewStateChange({ viewId: "", viewState: { target: [820, 970], zoom: [2, 3] }, interactionState: {} }));
    await act(async () => root.render(<Harness rotated treenome />));
    expect(view!.layout.rotated).toBe(false);
    expect(view!.displayViewState.target).toEqual([820, 970]);
    await act(async () => root.render(<Harness rotated height={400} />));
    expect(view!.layout.rotated).toBe(true);
    expect(view!.displayViewState.target).toEqual([970, 820]);
    expect(view!.layout.tree.height).toBe(200);
    await act(async () => root.render(<Harness />));
    expect(view!.viewState.target).toEqual([820, 970]);
    expect(view!.viewState.zoom).toEqual([2, 3]);
  } finally { await act(async () => root.unmount()); }
});
