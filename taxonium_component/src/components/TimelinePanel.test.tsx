import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import TimelinePanel from "./TimelinePanel";
import type { LocalBackend, Config } from "../types/backend";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { TimelineSettings } from "../hooks/useTimeline";
import type { TimelineRequest, TimelineResponse } from "../types/timeline";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("requests selected samples, cancels hidden work, and displays counts and tooltips", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const el = document.createElement("div"); document.body.appendChild(el); const root = createRoot(el);
  const source = { id: "meta_Year", label: "Year", fields: ["meta_Year"], min: 2001, max: 2003, precision: "year" as const, valid: 2 };
  const cancel = vi.fn();
  const queryTimeline = vi.fn((_request: TimelineRequest, callback: (response: TimelineResponse) => void) => {
    callback({ sources: [source], source, selectedCount: 3, datedCount: 2, ignoredCount: 1,
      bars: [{ start: 2001, end: 2001, label: "2001", count: 2, segments: [{ label: "A", count: 2, color: [1, 2, 3] }] }], overview: [{ start: 2001, end: 2001, count: 2 }] }); return cancel;
  });
  const props = { backend: { queryTimeline } as unknown as LocalBackend, config: {} as Config, selectedNodeId: 7,
    field: "meta_group", metadataMatrix: { getFieldColor: () => [1, 2, 3], metadata: { specs: { meta_group: { field: "meta_group", kind: "categorical" } } } } as unknown as MetadataMatrix,
    timeline: { sources: [source], source: source.id } as TimelineSettings };
  try {
    await act(async () => root.render(<TimelinePanel {...props} active />));
    await act(async () => vi.advanceTimersByTime(100));
    expect(queryTimeline.mock.calls[0][0].selectedNodeId).toBe(7);
    expect(el.textContent).toContain("2 dated samples; 1 missing or invalid");
    expect(el.querySelector('rect title')?.textContent).toContain("Total: 2");
    expect(el.querySelectorAll('input[type=range]')).toHaveLength(2);
    await act(async () => root.render(<TimelinePanel {...props} active={false} />));
    expect(cancel).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); el.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
