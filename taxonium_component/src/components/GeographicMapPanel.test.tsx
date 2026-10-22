import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import BottomViewsPanel from "./BottomViewsPanel";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { GeographicResponse } from "../types/geography";
import type { EmbeddingResponse } from "../types/embedding";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => vi.unstubAllGlobals());

it("uses summary fields for availability, follows selection and cancels collapsed/replaced requests", async () => {
  const element = document.createElement("div"), root = createRoot(element);
  const cancel = vi.fn();
  const query = vi.fn((_request: unknown, _callback: (response: GeographicResponse) => void) => cancel);
  const spec = { field: "meta_Country", kind: "categorical" };
  const metadataMatrix = { metadata: { specs: { meta_Country: spec } }, getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  const config = { metadataFields: {}, metadataSummaries: { meta_Lat: {}, meta_Long: {}, meta_Country: spec } } as unknown as Config;
  const render = (selectedNodeId: number | null = null, queryGeography = query) => root.render(
    <BottomViewsPanel backend={{ queryGeography } as unknown as LocalBackend} config={config}
      selectedNodeId={selectedNodeId} field="meta_Country" metadataMatrix={metadataMatrix}
      bottomView="map" onBottomViewChange={() => {}} />);
  try {
    await act(async () => render());
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatchObject({ selectedNodeId: null, colorSpec: spec });
    await act(async () => render(3));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.at(-1)![0]).toMatchObject({ selectedNodeId: 3 });
    await act(async () => query.mock.calls.at(-1)![1]({ points: [], selectedCount: 1, mappedCount: 0, bounds: null, available: true }));
    expect(element.textContent).toContain("No valid coordinates");
    await act(async () => (element.querySelector('button[aria-expanded]') as HTMLButtonElement).click());
    expect(cancel).toHaveBeenCalledTimes(2);
    const replacement = vi.fn(() => cancel);
    await act(async () => render(null, replacement));
    expect(replacement).not.toHaveBeenCalled();
    await act(async () => (element.querySelector('button[aria-expanded]') as HTMLButtonElement).click());
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(element.querySelector('button[aria-expanded]')?.getAttribute("aria-expanded")).toBe("true");
  } finally { await act(async () => root.unmount()); }
});

it("runs only the selected spatial view and keeps genotype points neutral", async () => {
  const element = document.createElement("div"), root = createRoot(element);
  const cancel = vi.fn();
  const queryGeography = vi.fn((_request: unknown, _callback: (response: GeographicResponse) => void) => cancel);
  const queryEmbedding = vi.fn((_request: unknown, _callback: (response: EmbeddingResponse) => void) => cancel);
  const spec = { field: "meta_Country", kind: "categorical" };
  const metadataMatrix = { metadata: { specs: { meta_Country: spec } }, getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  const config = { metadataFields: {}, metadataSummaries: { meta_Lat: {}, meta_Long: {}, meta_Country: spec },
    embeddingDiagnostics: { supplied: true, available: true, matchedSamples: 1, invalidCoordinateRecords: 0, unmatchedIdentifiers: 0 } } as unknown as Config;
  let bottomView: "metadata" | "map" | "embedding" = "map";
  let selectedNodeId: number | null = null;
  const render = (field = "meta_Country") => root.render(<BottomViewsPanel
    backend={{ queryGeography, queryEmbedding } as unknown as LocalBackend} config={config}
    selectedNodeId={selectedNodeId} field={field} metadataMatrix={metadataMatrix}
    bottomView={bottomView} onBottomViewChange={next => { bottomView = next; }} />);
  try {
    await act(async () => render());
    expect(queryGeography).toHaveBeenCalledTimes(1);
    expect(queryEmbedding).not.toHaveBeenCalled();
    await act(async () => (element.querySelector('[role=tab][id$=embedding-tab]') as HTMLButtonElement).click());
    await act(async () => render());
    expect(queryEmbedding).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    selectedNodeId = 7;
    await act(async () => render("genotype"));
    expect(queryEmbedding.mock.calls.at(-1)![0]).toMatchObject({ selectedNodeId: 7, color: [128, 128, 128] });
    await act(async () => (element.querySelector('[role=tab][id$=map-tab]') as HTMLButtonElement).click());
    await act(async () => render());
    expect(queryGeography).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); }
});

it("shows an accessible error when a supplied DOT file has no usable tree-tip coordinates", async () => {
  const element = document.createElement("div"), root = createRoot(element);
  const config = { metadataFields: {}, metadataSummaries: {}, embeddingDiagnostics: {
    supplied: true, available: false, matchedSamples: 0, invalidCoordinateRecords: 2, unmatchedIdentifiers: 4,
  } } as unknown as Config;
  const metadataMatrix = { metadata: { specs: {} }, getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  try {
    await act(async () => root.render(<BottomViewsPanel backend={{} as LocalBackend} config={config}
      selectedNodeId={null} field="None" metadataMatrix={metadataMatrix} bottomView="embedding" onBottomViewChange={() => {}} />));
    expect(element.querySelector('[role=tabpanel][id$=embedding-panel] [role="alert"]')?.textContent)
      .toContain("No usable DOT coordinates matched tree tips.");
    expect(element.textContent).not.toMatch(/Matched 0|invalid coordinates 2|unmatched identifiers 4/);
  } finally { await act(async () => root.unmount()); }
});
