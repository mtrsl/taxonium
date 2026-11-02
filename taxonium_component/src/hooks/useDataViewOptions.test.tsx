import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import useDataViewOptions from "./useDataViewOptions";
import type { Backend } from "../types/backend";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("relocates summaries without queries and rejects old selection and dataset callbacks", async () => {
  const queryGeography = vi.fn(); let options!: ReturnType<typeof useDataViewOptions>;
  const root = createRoot(document.createElement("div"));
  function Harness({ selected, query = queryGeography }: { selected: number; query?: typeof queryGeography }) {
    options = useDataViewOptions({ type: "local", queryGeography: query } as unknown as Backend, selected, "Year"); return null;
  }
  try {
    await act(async () => root.render(<Harness selected={1} />)); const old = options.reportMap;
    await act(async () => old({ busy: false, total: 3, valid: 2 })); expect(options.map?.total).toBe(3);
    await act(async () => root.render(<Harness selected={2} />)); expect(options.map).toBeUndefined();
    await act(async () => options.reportMap({ busy: false, total: 1, valid: 1 }));
    await act(async () => old({ busy: false, total: 3, valid: 2 })); expect(options.map?.total).toBe(1);
    await act(async () => root.render(<Harness selected={2} query={vi.fn()} />)); expect(options.map).toBeUndefined();
    expect(queryGeography).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
