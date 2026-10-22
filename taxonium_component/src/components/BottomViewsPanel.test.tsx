import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BottomViewsPanel, { resolveBottomView } from "./BottomViewsPanel";
import type { BottomView } from "./BottomViewsPanel";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("defaults invalid or unavailable views to metadata", () => {
  for (const value of [undefined, "", "bad", null]) expect(resolveBottomView(value, true)).toBe("metadata");
  expect(resolveBottomView("embedding", false)).toBe("metadata");
  expect(resolveBottomView("embedding", true)).toBe("embedding");
  expect(resolveBottomView("map", false)).toBe("map");
});

it("shares disclosure/height, navigates accessible tabs and cancels inactive work", async () => {
  const element = document.createElement("div"); document.body.appendChild(element);
  const root = createRoot(element);
  const cancelTable = vi.fn(), cancelMap = vi.fn(), cancelEmbedding = vi.fn();
  const queryMetadataTable = vi.fn(() => cancelTable), queryGeography = vi.fn(() => cancelMap), queryEmbedding = vi.fn((_request: unknown) => cancelEmbedding);
  const backend = { queryMetadataTable, queryGeography, queryEmbedding } as unknown as LocalBackend;
  const config = { metadataSummaries: { meta_Lat: {}, meta_Long: {} },
    embeddingDiagnostics: { supplied: true, available: true } } as unknown as Config;
  const metadataMatrix = { getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  let bottomView: BottomView | undefined, selectedNodeId: number | null = null;
  const change = vi.fn((next: BottomView) => { bottomView = next; render(); });
  const render = () => root.render(<BottomViewsPanel {...{ backend, config, metadataMatrix, bottomView, selectedNodeId }}
    field="None" onBottomViewChange={change} />);
  const tab = (view: string) => element.querySelector<HTMLButtonElement>(`[role=tab][id$=${view}-tab]`)!;
  const toggle = () => element.querySelector<HTMLButtonElement>('[aria-expanded]')!.click();
  try {
    await act(async () => render());
    expect(element.querySelector('[aria-expanded]')?.textContent).toContain("Data views");
    expect(element.querySelector('section')?.style.height).toBe("300px");
    expect(tab("metadata").getAttribute("aria-selected")).toBe("true");
    expect(queryMetadataTable).toHaveBeenCalledTimes(1);
    expect(queryGeography).not.toHaveBeenCalled(); expect(queryEmbedding).not.toHaveBeenCalled();
    await act(async () => tab("metadata").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(change).toHaveBeenLastCalledWith("map");
    expect(document.activeElement).toBe(tab("map"));
    expect(cancelTable).toHaveBeenCalledOnce(); expect(queryGeography).toHaveBeenCalledOnce();
    expect(tab("map").getAttribute("aria-controls")).toBe(element.querySelector('[role=tabpanel][id$=map-panel]')?.id);
    await act(async () => tab("embedding").click());
    expect(queryEmbedding).toHaveBeenCalledOnce(); expect(cancelMap).toHaveBeenCalledOnce();
    const separator = element.querySelector('[role=separator]')!;
    await act(async () => separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(element.querySelector('section')?.style.height).toBe("320px");
    await act(async () => toggle());
    expect(cancelEmbedding).toHaveBeenCalledOnce();
    expect(element.querySelector('section')?.style.height).toBe("32px");
    expect(element.querySelector('[role=tablist]')).toBeNull();
    selectedNodeId = 42;
    await act(async () => render());
    expect(queryEmbedding).toHaveBeenCalledOnce();
    await act(async () => toggle());
    expect(element.querySelector('section')?.style.height).toBe("320px");
    expect(queryEmbedding.mock.calls.at(-1)?.[0]).toMatchObject({ selectedNodeId: 42 });
    await act(async () => tab("metadata").click());
    expect(element.querySelector('section')?.style.height).toBe("320px");
    config.embeddingDiagnostics = undefined; bottomView = "embedding";
    await act(async () => render());
    expect(tab("embedding").disabled).toBe(true);
    expect(tab("metadata").getAttribute("aria-selected")).toBe("true");
  } finally { await act(async () => root.unmount()); element.remove(); }
});
