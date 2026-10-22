import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import GeographicMapPanel from "./GeographicMapPanel";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { GeographicResponse } from "../types/geography";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("uses summary fields for availability, follows selection and cancels collapsed/replaced requests", async () => {
  const element = document.createElement("div"), root = createRoot(element);
  const cancel = vi.fn();
  const query = vi.fn((_request: unknown, _callback: (response: GeographicResponse) => void) => cancel);
  const spec = { field: "meta_Country", kind: "categorical" };
  const metadataMatrix = { metadata: { specs: { meta_Country: spec } }, getFieldColor: () => [1, 2, 3] } as unknown as MetadataMatrix;
  const config = { metadataFields: {}, metadataSummaries: { meta_Lat: {}, meta_Long: {}, meta_Country: spec } } as unknown as Config;
  const render = (selectedNodeId: number | null = null, queryGeography = query) => root.render(
    <GeographicMapPanel backend={{ queryGeography } as unknown as LocalBackend} config={config}
      selectedNodeId={selectedNodeId} field="meta_Country" metadataMatrix={metadataMatrix} />);
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
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(element.querySelector('button[aria-expanded]')?.getAttribute("aria-expanded")).toBe("true");
  } finally { await act(async () => root.unmount()); }
});
