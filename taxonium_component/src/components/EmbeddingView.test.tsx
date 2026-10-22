import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import EmbeddingView from "./EmbeddingView";
import BottomViewsPanel from "./BottomViewsPanel";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { EmbeddingRequest, EmbeddingResponse } from "../types/embedding";

const rendering = vi.hoisted(() => ({ layers: [] as object[], finalized: new WeakSet<object>(), camera: { zoom: 1 }, change: (_info: { viewState: Record<string, unknown> }) => {} }));
vi.mock("@deck.gl/react", () => ({ default: ({ layers, viewState, onViewStateChange }: { layers: object[]; viewState: { zoom: number }; onViewStateChange: typeof rendering.change }) => {
  expect(layers.some(layer => rendering.finalized.has(layer))).toBe(false);
  rendering.layers = layers; rendering.camera = viewState; rendering.change = onViewStateChange;
  useEffect(() => () => { layers.forEach(layer => rendering.finalized.add(layer)); }, [layers]);
  return <canvas />;
} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("recreates finalized rendering resources on activation, retains data and ignores obsolete replies", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const element = document.createElement("div"), root = createRoot(element);
  const query = vi.fn((_request: EmbeddingRequest, _callback: (response: EmbeddingResponse) => void) => vi.fn());
  const config = { embeddingDiagnostics: { supplied: true, available: true, matchedSamples: 5815 }, metadataSummaries: {} } as unknown as Config;
  const metadataMatrix = { getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  const render = (active: boolean, selectedNodeId: number | null = null) => root.render(<EmbeddingView
    backend={{ queryEmbedding: query } as unknown as LocalBackend} {...{ config, metadataMatrix, active, selectedNodeId }} field="None" />);
  const page = { points: [{ x: 0, y: 0, count: 1, color: [1, 2, 3, 255], label: "sample" }],
    selectedCount: 1, matchedCount: 1, bounds: [-1, -1, 1, 1], available: true } as EmbeddingResponse;
  try {
    await act(async () => render(true));
    await act(async () => query.mock.calls.at(-1)![1](page));
    const first = rendering.layers[0], obsoleteCameraChange = rendering.change;
    expect(element.querySelector('canvas')).not.toBeNull();
    await act(async () => render(false));
    expect(element.querySelector('canvas')).toBeNull();
    expect(rendering.finalized.has(first)).toBe(true);
    await act(async () => render(true));
    expect(rendering.layers[0]).not.toBe(first);
    const retainedZoom = rendering.camera.zoom;
    await act(async () => obsoleteCameraChange({ viewState: { target: [99, 99, 0], zoom: 15 } }));
    expect(rendering.camera.zoom).toBe(retainedZoom);
    expect(element.querySelector('canvas')).not.toBeNull();
    const stale = query.mock.calls.at(-1)![1];
    await act(async () => render(false, 7));
    await act(async () => stale(page));
    await act(async () => render(true, 7));
    expect(element.querySelector('canvas')).toBeNull();
    expect(query.mock.calls.at(-1)![0].selectedNodeId).toBe(7);
    expect(element.textContent).not.toMatch(/5815|matched|positioned|invalid coordinates|unmatched identifiers/i);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("resets spatial camera/data on dataset replacement and rejects the old dataset response", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const element = document.createElement("div"), root = createRoot(element);
  const query = vi.fn((_request: EmbeddingRequest, _callback: (response: EmbeddingResponse) => void) => vi.fn());
  const replacement = vi.fn(query.getMockImplementation()!);
  const config = { embeddingDiagnostics: { supplied: true, available: true }, metadataSummaries: {} } as unknown as Config;
  const metadataMatrix = { getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  const render = (queryEmbedding = query) => root.render(<BottomViewsPanel
    backend={{ queryEmbedding } as unknown as LocalBackend} {...{ config, metadataMatrix }}
    selectedNodeId={null} field="None" bottomView="embedding" onBottomViewChange={() => {}} />);
  const page = { points: [{ x: 0, y: 0, count: 1, color: [1, 2, 3, 255], label: "sample" }],
    selectedCount: 1, matchedCount: 1, bounds: [-1, -1, 1, 1], available: true } as EmbeddingResponse;
  try {
    await act(async () => render());
    await act(async () => query.mock.calls.at(-1)![1](page));
    await act(async () => rendering.change({ viewState: { target: [5, 5, 0], zoom: 10 } }));
    expect(rendering.camera.zoom).toBe(10);
    const obsoleteReply = query.mock.calls.at(-1)![1];
    await act(async () => render(replacement));
    await act(async () => obsoleteReply(page));
    expect(element.querySelector('canvas')).toBeNull();
    await act(async () => replacement.mock.calls.at(-1)![1](page));
    expect(rendering.camera.zoom).toBe(1);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
