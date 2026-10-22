import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import BottomViewsPanel from "./BottomViewsPanel";
import type { Config, LocalBackend } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { MetadataTableRequest, MetadataTableResponse } from "../types/metadataTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("metadata table panel", () => {
  it("defaults expanded, fetches only when active, windows wide pages, follows selection and retains session columns", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    const fields = Array.from({ length: 1000 }, (_, i) => `meta_f${String(i).padStart(4, "0")}`);
    const config: Config = { num_nodes: 4502, rootId: 0, rootMutations: [], name_accessor: "name",
      metadataSummaries: Object.fromEntries(fields.map(field => [field, { kind: "categorical" }])) };
    const color = vi.fn(() => [12, 34, 56]);
    const matrix = { metadata: { specs: {} }, getFieldColor: color, getValueColor: color } as unknown as MetadataMatrix;
    const query = vi.fn((request: MetadataTableRequest, callback: (response: MetadataTableResponse) => void) => {
      const total = request.selectedNodeId === null ? 4501 : request.selectedNodeId === 8 ? 0 : 1;
      const pageIndex = Math.min(request.pageIndex, Math.max(0, Math.ceil(total / 2000) - 1));
      callback({ total, pageIndex, fields: request.fields,
        rows: Array.from({ length: Math.min(2000, Math.max(0, total - pageIndex * 2000)) }, (_, i) => ({
          nodeId: pageIndex * 2000 + i, name: `sample-${pageIndex * 2000 + i}`,
          values: request.fields.map(() => "001"),
        })) });
      return vi.fn();
    });
    let bottomView: "metadata" | "map" = "metadata";
    const render = (selectedNodeId: number | null = null, queryMetadataTable = query) => root.render(
      <BottomViewsPanel bottomView={bottomView} field="None" onBottomViewChange={() => {}} backend={{ queryMetadataTable } as unknown as LocalBackend} config={config}
        selectedNodeId={selectedNodeId} metadataMatrix={matrix} />);
    const click = async (label: string) => act(async () => element.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
    const toggle = async () => act(async () => element.querySelector<HTMLButtonElement>("[aria-expanded]")!.click());
    try {
      await act(async () => render());
      expect(query).toHaveBeenCalledTimes(1);
      expect(element.textContent).toContain("4,501 samples");
      expect(element.querySelectorAll('[role="row"]').length).toBeLessThan(30);
      expect(element.querySelectorAll('[role="columnheader"]').length).toBeLessThan(12);
      expect(element.querySelectorAll('input[type="checkbox"]').length).toBeLessThan(12);
      expect(element.querySelector('[role="cell"][aria-colindex="2"]')?.textContent).toBe("001");
      expect((element.querySelector('[role="cell"][aria-colindex="2"] span') as HTMLElement).style.background).toBe("rgb(12, 34, 56)");
      await act(async () => element.querySelector<HTMLElement>('[role="cell"][aria-colindex="2"]')!.focus());
      expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("001");
      await click("Last table page");
      expect(element.querySelector('[role="tooltip"]')).toBeNull();
      expect(query.mock.calls.at(-1)![0].pageIndex).toBe(2);
      expect(element.textContent).toContain("4001–4501 shown");
      const scroll = element.querySelector<HTMLElement>('[aria-label="Metadata table scroll area"]')!;
      await act(async () => { scroll.scrollTop = 9000; scroll.scrollLeft = 90000; scroll.dispatchEvent(new Event("scroll", { bubbles: true })); });
      expect(query.mock.calls.at(-1)![0].fields[0]).toBe("meta_f0498");
      expect(query.mock.calls.every(([request]) => request.fields.length <= 32)).toBe(true);
      expect(element.querySelector('[role="rowgroup"]')?.getAttribute("style")).toContain("15030px");
      expect(element.querySelector('[data-node-id="4296"]')).not.toBeNull();
      // Searching the chooser reaches columns far beyond its initial virtual window.
      await act(async () => {
        const search = element.querySelector<HTMLInputElement>('[aria-label="Find table columns"]')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "f0999");
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(element.querySelectorAll('input[type="checkbox"]').length).toBe(1);
      await act(async () => element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      expect(element.querySelector("summary")?.textContent).toBe("Columns (999/1000)");
      bottomView = "map";
      await act(async () => render());
      const inactiveCalls = query.mock.calls.length;
      await act(async () => { scroll.scrollTop = 0; scroll.scrollLeft = 0; scroll.dispatchEvent(new Event("scroll", { bubbles: true })); });
      bottomView = "metadata";
      await act(async () => render());
      expect(query.mock.calls.length).toBe(inactiveCalls + 1);
      expect(query.mock.calls.at(-1)![0].pageIndex).toBe(2);
      expect(scroll.scrollTop).toBe(9000);
      expect(scroll.scrollLeft).toBe(90000);
      expect(element.querySelector("summary")?.textContent).toBe("Columns (999/1000)");
      await toggle();
      const count = query.mock.calls.length;
      await act(async () => render(3));
      expect(query).toHaveBeenCalledTimes(count);
      await toggle();
      expect(element.querySelector("summary")?.textContent).toBe("Columns (999/1000)");
      expect(element.textContent).toContain("1 samples");
      expect(query.mock.calls.at(-1)![0].pageIndex).toBe(0);
      await act(async () => render(null));
      expect(query.mock.calls.at(-1)![0].pageIndex).toBe(0);
      await act(async () => render(8));
      expect(element.textContent).toContain("No samples in this selection");
      const replacement = vi.fn(query.getMockImplementation()!);
      await act(async () => render(null, replacement));
      expect(element.querySelector("summary")?.textContent).toBe("Columns (1000/1000)");
      expect(element.querySelector<HTMLInputElement>('[aria-label="Find table columns"]')!.value).toBe("");
    } finally {
      await act(async () => root.unmount());
      element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });
});
